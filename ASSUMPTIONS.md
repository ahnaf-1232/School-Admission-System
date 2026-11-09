
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
