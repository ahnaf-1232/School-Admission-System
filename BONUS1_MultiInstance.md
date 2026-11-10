# Bonus 1: Multiple backend processes against one PostgreSQL database

## Architecture

Two independent ASP.NET Core 8 backend containers use one PostgreSQL `db` service. The normal API is published on localhost:8080 and a second one-off instance on localhost:8082. Both containers inherit the same Docker Compose database connection string.

## Test

Run `scripts/Test-MultiInstance.ps1` from Windows PowerShell while both backends run. Each round creates a unique class with 5 seats and sends 50 concurrent hold requests, alternately targeting ports 8080 and 8082. The test requires exactly 5 HTTP 201 successes, 45 HTTP 409 conflicts, and `heldSeats + confirmedSeats == 5 <= totalSeats`. It repeats three rounds by default.

## Concurrency strategy

`HoldService.CreateAsync` starts a PostgreSQL transaction, locks the class row using `SELECT ... FOR UPDATE`, then expires old holds, checks duplicate applications, counts current `HELD` and `CONFIRMED` reservations, and inserts a new hold before committing. Row locking takes place in PostgreSQL and works across independent API processes, not just threads within one process. A partial unique index on `(class_id, student_id)` for active states adds duplicate protection.

## Scope and limitations

All seat-allocation write paths must follow the same class-row locking protocol. The 50-request test demonstrates behavior under the tested workloads; it is not mathematical proof for every possible schedule. The test creates persistent sample classes and holds in the current database and does not delete records. Run against a disposable local database/volume if necessary.
