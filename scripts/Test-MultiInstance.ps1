# School Admission System - Bonus 1
# Sends concurrent HTTP requests across two independent API containers
# that share the same PostgreSQL database.
# Compatible with Windows PowerShell 5.1+ and PowerShell 7+.
# This script creates unique test classes and does not delete any records.

param(
    [string]$FirstUrl = 'http://localhost:8080',
    [string]$SecondUrl = 'http://localhost:8082',
    [int]$Students = 50,
    [int]$TotalSeats = 5,
    [int]$Rounds = 3
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

if ($TotalSeats -lt 1 -or $Students -le $TotalSeats -or $Rounds -lt 1) {
    throw 'Use TotalSeats >= 1, Students > TotalSeats, and Rounds >= 1.'
}

$FirstUrl = $FirstUrl.TrimEnd('/')
$SecondUrl = $SecondUrl.TrimEnd('/')
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(120)

try {
    # Both origins must be reachable before the concurrency experiment starts.
    foreach ($origin in @($FirstUrl, $SecondUrl)) {
        $health = $client.GetAsync("$origin/classes").GetAwaiter().GetResult()
        try {
            if (-not $health.IsSuccessStatusCode) {
                throw "API $origin failed readiness check (HTTP $([int]$health.StatusCode))."
            }
            Write-Host "Ready: $origin" -ForegroundColor Green
        }
        finally {
            $health.Dispose()
        }
    }

    for ($round = 1; $round -le $Rounds; $round++) {
        $className = 'Bonus Multi Instance ' + [Guid]::NewGuid().ToString('N')
        $body = @{ name = $className; totalSeats = $TotalSeats } | ConvertTo-Json -Compress
        $content = [System.Net.Http.StringContent]::new(
            $body,
            [System.Text.Encoding]::UTF8,
            'application/json'
        )

        try {
            $created = $client.PostAsync("$FirstUrl/classes", $content).GetAwaiter().GetResult()
            try {
                $createdBody = $created.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if ([int]$created.StatusCode -ne 201) {
                    throw "Could not create test class: HTTP $([int]$created.StatusCode): $createdBody"
                }
                $classId = (ConvertFrom-Json -InputObject $createdBody).id
            }
            finally {
                $created.Dispose()
            }
        }
        finally {
            $content.Dispose()
        }

        Write-Host "`nRound $round/$Rounds - Class ID: $classId; capacity: $TotalSeats" -ForegroundColor Cyan

        $requests = @()
        $pending = @()
        $responses = @()
        $codes = @()

        try {
            # SendAsync returns immediately with a Task. All 50 requests
            # begin without waiting for the previous request to complete.
            for ($i = 1; $i -le $Students; $i++) {
                $origin = if ($i % 2 -eq 0) { $SecondUrl } else { $FirstUrl }
                $studentId = $i.ToString('D17')
                $request = [System.Net.Http.HttpRequestMessage]::new(
                    [System.Net.Http.HttpMethod]::Post,
                    "$origin/classes/$classId/holds"
                )
                $request.Headers.Add('X-Student-Id', $studentId)
                $requests += $request
                $pending += $client.SendAsync($request)
            }

            # All requests were issued first; now collect their results.
            foreach ($task in $pending) {
                $response = $task.GetAwaiter().GetResult()
                $responses += $response
                $codes += [int]$response.StatusCode
            }

            $createdCount = @($codes | Where-Object { $_ -eq 201 }).Count
            $conflictCount = @($codes | Where-Object { $_ -eq 409 }).Count
            $unexpected = @($codes | Where-Object { $_ -ne 201 -and $_ -ne 409 })

            $seatResponse = $client.GetAsync("$SecondUrl/classes/$classId").GetAwaiter().GetResult()
            try {
                if (-not $seatResponse.IsSuccessStatusCode) {
                    throw "Class lookup failed: HTTP $([int]$seatResponse.StatusCode)."
                }
                $seatJson = $seatResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                $seats = ConvertFrom-Json -InputObject $seatJson
            }
            finally {
                $seatResponse.Dispose()
            }

            $occupied = [int]$seats.heldSeats + [int]$seats.confirmedSeats
            Write-Host "HTTP 201 (created): $createdCount; HTTP 409 (rejected): $conflictCount"
            Write-Host "Database-backed seat count: held=$($seats.heldSeats), confirmed=$($seats.confirmedSeats), total=$($seats.totalSeats), occupied=$occupied"

            if ($unexpected.Count -gt 0) {
                throw "Unexpected HTTP statuses: $($unexpected -join ', '). Check 'docker compose logs backend' and the bonus container logs."
            }
            if ($createdCount -ne $TotalSeats -or $conflictCount -ne ($Students - $TotalSeats)) {
                throw "Incorrect allocation: expected $TotalSeats successes and $($Students - $TotalSeats) conflicts."
            }
            if ($occupied -ne $TotalSeats -or $occupied -gt [int]$seats.totalSeats) {
                throw "Seat integrity check failed: occupied=$occupied, capacity=$($seats.totalSeats)."
            }

            Write-Host "PASS: both API instances shared the same seat limit." -ForegroundColor Green
        }
        finally {
            foreach ($response in $responses) { $response.Dispose() }
            foreach ($request in $requests) { $request.Dispose() }
        }
    }

    Write-Host "`nBONUS 1 PASSED: $Rounds independent rounds completed without overbooking." -ForegroundColor Green
    Write-Host 'Note: Test classes remain in the current school_admission database.'
}
finally {
    $client.Dispose()
}
