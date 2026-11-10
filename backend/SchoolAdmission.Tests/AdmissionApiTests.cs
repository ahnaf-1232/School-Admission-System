using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Models;
using Xunit;

namespace SchoolAdmission.Tests;

public class AdmissionApiTests
{
    private static readonly HttpClient Client = new()
    {
        BaseAddress = new Uri(
            Environment.GetEnvironmentVariable("TEST_API_BASE_URL")
            ?? "http://localhost:8081"
        )
    };

    // Test 1: Concurrency
    [Fact]
    public async Task FiftyStudents_CannotOverbookFiveSeats()
    {
        var classId = await CreateClassAsync(5);

        var start = new TaskCompletionSource<bool>(
            TaskCreationOptions.RunContinuationsAsynchronously
        );

        var requests = Enumerable.Range(1, 50)
            .Select(async i =>
            {
                await start.Task;
                
                var studentId = i.ToString("D17");

                using var response = await CreateHoldAsync(
                    classId, studentId);
                
                return response.StatusCode;
            })
            .ToArray();

        start.SetResult(true);

        var results = await Task.WhenAll(requests);

        var successfull = results.Count(
            s=> s == HttpStatusCode.Created
        );

        var rejected = results.Count(
            r=> r == HttpStatusCode.Conflict
        );

        Assert.Equal(5, successfull);
        Assert.Equal(45, rejected);

        var seats = await GetSeatsAsync(classId);

        var occupied = seats.GetProperty("heldSeats").GetInt32()
            + seats.GetProperty("confirmedSeats").GetInt32();

        Assert.Equal(5, occupied);

        Assert.Equal(0, seats.GetProperty("availableSeats").GetInt32());
    }

    // Test 2: Duplicate Application
    [Fact]
    public async Task SameStudent_CannotReserveTwice()
    {
        var classId = await CreateClassAsync(10);
        var studentId = "20152691234567890";

        using var first = await CreateHoldAsync(classId, studentId);

        using var second = await CreateHoldAsync(classId, studentId);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var seats = await GetSeatsAsync(classId);

        Assert.Equal(1, seats.GetProperty("heldSeats").GetInt32());
    }

    // Test 3: Idempotent Confirmation
    [Fact]
    public async Task ConfirmingTwice_CountsOnlyOneSeat()
    {
        var classId = await CreateClassAsync(1);
        var studentId = "20152691234567891";

        using var holdResponse = await CreateHoldAsync(classId, studentId);
        
        Assert.Equal(HttpStatusCode.Created, holdResponse.StatusCode);

        var body = await holdResponse.Content.ReadFromJsonAsync<JsonElement>();

        var holdId = body.GetProperty("holdId").GetGuid();

        using var first = await ConfirmAsync(holdId, studentId);
        using var second = await ConfirmAsync(holdId, studentId);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var seats = await GetSeatsAsync(classId);

        Assert.Equal(0, seats.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, seats.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(0, seats.GetProperty("availableSeats").GetInt32());
    }

    // TEST 4: Automatic expiration
    [Fact]
    public async Task ExpiredHold_IsReleasedByBackgroundWorker()
    {
        var classId = await CreateClassAsync(1);
        var studentId = "20152691234567892";

        using var holdResponse = await CreateHoldAsync(classId, studentId);

        Assert.Equal(HttpStatusCode.Created, holdResponse.StatusCode);

        var body = await holdResponse.Content.ReadFromJsonAsync<JsonElement>();

        var holdId = body.GetProperty("holdId").GetGuid();

        var connectionString = Environment.GetEnvironmentVariable("TEST_DB_CONNECTION")
            ?? throw new InvalidOperationException("TEST_DB_CONNECTION is not configured.");

            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(connectionString)
                .Options;

        await using var db = new AppDbContext(options);

        var pastTime = DateTime.UtcNow.AddMinutes(-1);

        var updated = await db.Holds
            .Where(h => h.Id == holdId)
            .ExecuteUpdateAsync(setters => 
                setters.SetProperty(h => h.ExpiresAt, pastTime
            )
        );

        Assert.Equal(1, updated);

        HoldStatus status = HoldStatus.HELD;

        for(var attempt = 0; attempt < 40; attempt++)
        {
            status = await db.Holds
                .AsNoTracking()
                .Where(h => h.Id == holdId)
                .Select(h => h.Status)
                .SingleAsync();

            if(status == HoldStatus.EXPIRED) break;

            await Task.Delay(250);
        }

        Assert.Equal(HoldStatus.EXPIRED, status);

        var seats = await GetSeatsAsync(classId);

        Assert.Equal(1, seats.GetProperty("availableSeats").GetInt32());
    }

    public static async Task<Guid> CreateClassAsync(int TotalSeats)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            "/classes"
        )
        {
            Content = JsonContent.Create(new
            {
                name = $"Automated Test {Guid.NewGuid():N}",
                TotalSeats
            })
        };

        using var response = await Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        return json.GetProperty("id").GetGuid();
    }

    public static async Task<HttpResponseMessage> CreateHoldAsync(
        Guid classId,
        string studentId
    )
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
             $"/classes/{classId}/holds"
        );

        request.Headers.Add("X-Student-Id", studentId);

        return await Client.SendAsync(request);
    }

    public static async Task<JsonElement> GetSeatsAsync(Guid classId)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/classes/{classId}"
        );

        using var response = await Client.SendAsync(request);

        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<HttpResponseMessage> ConfirmAsync(
        Guid holdID,
        string studentId
    )
    {
        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"holds/{holdID}/confirm"
        );

        request.Headers.Add("X-Student-Id", studentId);

        return await Client.SendAsync(request);
    }
}