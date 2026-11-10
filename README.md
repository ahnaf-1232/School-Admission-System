# School Admission System

A first-come, first-served school admission application built with **ASP.NET Core 8**, **Entity Framework Core 8**, **PostgreSQL 16**, **React + TypeScript**, and **Docker Compose**. It supports temporary seat holds, simulated fee confirmation, cancellation, automatic expiration, and seat-availability updates.

> **Assignment/demo project:** The current student identifier is a 17-digit birth registration number provided as an `X-Student-Id` header. No login or administrator authentication is implemented. Do not deploy this demo publicly with real student data.

## Quick start — Windows or any machine with Docker

**Prerequisites:** Git, Docker Desktop with Linux containers enabled, and an internet connection for initial image downloads. You do **not** need to install .NET, Node.js, or PostgreSQL locally to run the app with Docker.

```powershell
git clone https://github.com/ahnaf-1232/School-Admission-System.git
cd School-Admission-System
Copy-Item .env.example .env
docker compose up --build
```

The `.env` file is optional if you use the Compose defaults. The example values are only for **local evaluation**, not for an internet-facing deployment. When changing the PostgreSQL password, use a new database volume or update the password in the existing database too: changing the environment variable alone does not update an existing PostgreSQL user's password.

Wait until all services have started. Docker Compose waits for PostgreSQL's health check before starting the backend. On first startup, the backend applies pending EF Core database migrations when `APPLY_MIGRATIONS=true`.

| Component | Address |
| --- | --- |
| Welcome / portal selection | http://localhost:3000/ |
| Student Portal | http://localhost:3000/student |
| Admin Portal | http://localhost:3000/admin |
| Backend API | http://localhost:8080/classes |
| PostgreSQL (optional host tools) | localhost:5433 |

**Note:** The React site uses Nginx. Requests to `/api/...` on port 3000 are proxied to the backend; for example, `/api/classes` is forwarded to `/classes` on port 8080.

### Basic walkthrough

1. Open the **Admin Portal** and create a class, such as `Class 6 - Morning Shift`, with a positive seat capacity.
2. Open the **Student Portal**, enter a 17-digit student ID, and select a class.
3. Select **Apply / Hold seat** to reserve a seat temporarily.
4. Confirm the hold using **Pay fee (simulate)** before its countdown expires, or cancel the held application to release the seat.
5. Verify that class counts change and that **My applications** can be restored after a page refresh.

`HELD` reservations expire after `HOLD_DURATION_SECONDS` (default: **600 seconds**). An application background worker updates overdue holds, and seat availability excludes overdue holds based on their timestamps.

### Commands

```powershell
# Start in the background
docker compose up -d --build

# Show container status
docker compose ps

# Follow backend logs
docker compose logs -f backend

# Stop containers while keeping the database volume
docker compose down

# Restart
docker compose up -d
```

**Persistence:** PostgreSQL stores data in the named `postgres_data` Docker volume. `docker compose down` preserves this volume. **Do not use `docker compose down -v`** unless you deliberately want to remove stored database data.

## Architecture

```text
Browser
  └── React + TypeScript (Nginx, :3000)
        └── /api/* reverse proxy
              └── ASP.NET Core Web API (:8080)
                    ├── Controllers (HTTP API)
                    ├── Services (business logic)
                    ├── EF Core AppDbContext
                    ├── Background hold-expiration worker
                    └── PostgreSQL 16 (Docker service "db":5432)
```

### Repository structure

```text
backend/
  SchoolAdmission.Api/
    Controllers/       API routes
    DTOs/              request/response contracts
    Models/            entities and status enum
    Data/              EF Core DbContext
    Services/          admission and seat-counting rules
    BackgroundServices/ expiration worker
    Migrations/        versioned database schema
    Dockerfile
  SchoolAdmission.Tests/  xUnit integration tests
frontend/
  src/                 React pages, state, API client
  Dockerfile
  nginx.conf
docker-compose.yml
.env.example
ASSUMPTIONS.md
AI_USAGE.md
README.md
```

## API reference

All HTTP routes are on the backend at port `8080`. For browser traffic through the frontend container, prefix these routes with `/api`. JSON is returned using camelCase field names.

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/classes` | Create a class; body: `{ "name": "...", "totalSeats": 50 }` |
| `GET` | `/classes` | List classes, including `heldSeats`, `confirmedSeats`, `availableSeats` |
| `GET` | `/classes/{classId}` | Retrieve one class with seat counts |
| `POST` | `/classes/{classId}/holds` | Reserve a seat; requires `X-Student-Id` |
| `GET` | `/holds/{holdId}` | Retrieve hold status |
| `POST` | `/holds/{holdId}/confirm` | Simulate payment and confirm; requires `X-Student-Id` |
| `DELETE` | `/holds/{holdId}` | Cancel an active hold; requires `X-Student-Id` |
| `GET` | `/me/holds` | List the student's applications; requires `X-Student-Id` |

The student header must contain **exactly 17 ASCII digits**. Common statuses: `HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`. Creating a hold returns `201`; an unavailable seat or duplicate active application returns `409`. Successful cancellation returns `204`. See `ASSUMPTIONS.md` for the chosen rules for unspecified edge cases.

### Concurrency model

Seat creation uses a PostgreSQL transaction and `SELECT ... FOR UPDATE` on the target class row before counting and inserting reservations. This serializes competing requests *for the same class* and prevents exceeding capacity when all writers follow the same protocol. A PostgreSQL partial unique index also prevents duplicate `HELD` / `CONFIRMED` applications by a given student in one class. Confirmation and cancellation use conditional SQL updates to enforce valid state transitions; repeating confirmation does not allocate an additional seat.

The database is the authority: frontend countdowns, disabled buttons, or cached values do not determine admission eligibility.

## Testing

### Backend integration tests (xUnit)

The tests call a **running API** and use a **separate PostgreSQL test database**. The test suite includes simultaneous holds, duplicate applications, idempotent confirmation, and background expiration.

For repeatable testing on Windows, open PowerShell in the repository root:

```powershell
# Start PostgreSQL, if needed
docker compose up -d db

# Create this database once; skip if it already exists
docker compose exec db psql -U admission_user -d postgres -c "CREATE DATABASE school_admission_test;"

# Requires .NET 8 SDK and dotnet-ef v8 CLI on the test-running machine
$env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=5433;Database=school_admission_test;Username=admission_user;Password=local_dev_only_password"
dotnet ef database update --project backend/SchoolAdmission.Api --startup-project backend/SchoolAdmission.Api

# Start the test API in terminal 1; keep it running
$env:HOLD_DURATION_SECONDS = "600"
dotnet run --project backend/SchoolAdmission.Api --no-launch-profile --urls "http://localhost:8081"
```

In **terminal 2**, from the repository root:

```powershell
$env:TEST_API_BASE_URL = "http://localhost:8081"
$env:TEST_DB_CONNECTION = "Host=localhost;Port=5433;Database=school_admission_test;Username=admission_user;Password=local_dev_only_password"
dotnet test backend/SchoolAdmission.Tests/SchoolAdmission.Tests.csproj --logger "console;verbosity=normal"
```

Use the password matching your local PostgreSQL container. The API in terminal 1 **must** connect to `school_admission_test`, not the development database. The expiration test updates an individual test hold directly in PostgreSQL; do not point it at real data. `dotnet test` requires the SDK; running the **application itself** via Compose does not.

### Frontend checks

With the Compose stack running, manually verify:

- Welcome page lets you navigate to Student and Admin portals, including after refresh.
- The admin can create a class and see counts.
- A student can create, view, confirm, and cancel appropriate holds.
- Expired holds no longer allow payment and their seats return to availability.
- The class list refreshes without a full page reload.
- Entered student ID restores application history after reopening the browser.
- Network/API errors and invalid inputs appear as visible messages.

**Frontend automated tests are not yet included** in this repository; this is an optional assignment bonus, not part of the backend xUnit suite.

## Configuration

| Variable | Used by | Default / example |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Docker / PostgreSQL | `local_dev_only_password` (demo only) |
| `HOLD_DURATION_SECONDS` | Backend | `600` |
| `APPLY_MIGRATIONS` | Backend | `true` in Compose |
| `VITE_API_BASE_URL` | Frontend build | `/api` in Compose |
| `ConnectionStrings__DefaultConnection` | Backend | Set by Compose to the `db` service on port `5432` |

The admin and student views are **UI-only separation**. There is no real authentication or authorization in this assignment demo; don't use real personal data.

## Troubleshooting

- **Port already in use:** Stop any host .NET API on `8080` or other app on `3000`; PostgreSQL host port is `5433`.
- **Frontend loads, API fails:** Check `docker compose logs backend` and `docker compose logs frontend` and verify Nginx `/api` proxy settings.
- **Database access error:** Check `POSTGRES_PASSWORD` and note that a previously initialized volume retains its existing database password.
- **Tables are missing:** Check `APPLY_MIGRATIONS=true` and backend startup logs.
- **Stale Docker build files:** Keep `**/bin` and `**/obj` out of the Docker build context via `.dockerignore`.
- **Further details:** `docker compose ps` and `docker compose logs --tail=100 backend`.

## Notes and limitations

- Fee payment is **simulated**: there is no payment gateway integration.
- No lottery: seat allocation follows successful acquisition of the database lock in a first-come request processing model.
- This is an assignment demonstration, not a production-secured school admissions service.
- See `ASSUMPTIONS.md` for the interpretation of unspecified behaviors and `AI_USAGE.md` for the AI assistance disclosure.
