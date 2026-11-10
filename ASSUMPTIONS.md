
# Assumptions

## Seat Hold Duration
- Default hold duration is 600 seconds.
- Configurable using HOLD_DURATION_SECONDS.
- Must be a positive integer.

## Student Identification
- Each student is identified by a 17-digit birth registration number.
- The identifier is passed using X-Student-Id.
- No login is required by the assignment.

## Duplicate Applications
- A student cannot hold or confirm multiple seats in the same class.
- Expired and cancelled applications do not block new applications.

## Concurrency
- Seat allocation locks the PostgreSQL class row using SELECT FOR UPDATE.
- All seat-allocation transactions must acquire this lock before checking capacity.
- A partial unique index protects against duplicate active applications.

## Expiration
- Expired holds are processed by a background worker.
- The worker checks every second while the API is running.
- Expired holds are excluded from seat availability calculations immediately, based on their expiration timestamps.

## Confirmation
- Payment is simulated as successful when the confirmation
  endpoint is called.
- Only the student who owns a hold can confirm it.
- Only an unexpired HELD application can transition to CONFIRMED.
- Repeated confirmation of an already CONFIRMED application
  returns HTTP 200 without changing the seat count again.

## Cancellation
- Only an unexpired HELD application can be cancelled.
- Cancelling a hold changes its status to CANCELLED.
- Cancellation history is preserved in the database.
- Repeated cancellation returns HTTP 204.
- Confirmed admissions cannot be cancelled through this endpoint,
  because the assignment doesn't define refunds or withdrawal.

## Invalid Operations
- Invalid student identifiers return HTTP 400.
- Missing holds or holds belonging to another student return HTTP 404
  for confirmation and cancellation.
- Invalid state transitions return HTTP 409.

## Bonus: Multiple Backend Instances
- Two independent ASP.NET Core backend containers share PostgreSQL.
- The instances are exposed on ports 8080 and 8082.
- Seat allocation uses PostgreSQL transactions and
  SELECT FOR UPDATE row locking.
- A test sends 50 concurrent requests across both instances
  for a class with 5 seats.
- The expected result is 5 successful holds and 45 conflicts.
- The test verifies heldSeats + confirmedSeats <= totalSeats.
