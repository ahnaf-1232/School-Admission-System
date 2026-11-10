# AI Usage Disclosure

> **Review before submission.** This is a draft based on the ChatGPT-assisted steps followed in this project. Keep only claims that accurately describe your own work, verification, and debugging. The assignment asks for transparency about which AI tools were used, where, what they got wrong, and how you corrected the issues.

## Tool used

- **ChatGPT (OpenAI)** — used as a programming assistant during planning, implementation, explanation, and debugging of the School Admission System.

## Areas where AI assisted

1. **Project setup:** GitHub repository structure; ASP.NET Core 8 Web API scaffold; PostgreSQL Docker Compose configuration; Entity Framework Core packages, entities, migrations, and connection strings.
2. **Backend design and implementation:** Layered folders, controllers, DTOs, services, seat-count calculations, hold creation, state transitions, and background expiration.
3. **Concurrency discussion:** Explaining the race condition for limited seats and suggesting PostgreSQL transactions, `SELECT ... FOR UPDATE`, and a partial unique index against duplicate active applications.
4. **Testing:** Suggesting and drafting xUnit integration tests for 50 simultaneous requests competing for 5 seats, duplicate applications, repeated confirmation, and automatic hold expiration.
5. **Frontend:** Generating a React + TypeScript interface, then restructuring it into a welcome landing page, a Student Portal, and an Admin Portal, with API calls and polling.
6. **Deployment:** Generating frontend/backend Dockerfiles, Nginx reverse-proxy configuration, and Docker Compose orchestration, and discussing automatic EF Core migrations at startup.
7. **Documentation:** Preparing draft README content, assumptions, and this AI usage disclosure.

## AI-generated or AI-assisted code

Code and configuration in the areas above were created or changed with AI assistance. The project author remains responsible for understanding, reviewing, testing, and validating the final code. AI recommendations should not be treated as evidence that an implementation is correct without testing.

## Example of an AI suggestion that required correction

During the initial Docker build, the backend failed at `dotnet publish` with `NETSDK1064`, reporting that `Microsoft.CodeAnalysis.Analyzers` could not be found. The build output showed that `dotnet restore` had succeeded before the project files were copied into the container. This exposed a likely issue with Windows-generated `obj` files overwriting Linux-generated restore artifacts. The Docker setup was revised to exclude local build outputs (`bin/`, `obj/`) and restore/publish cleanly inside Docker. **The project author reported that Docker was fixed after this debugging step.**

## How the project was checked

- Executed API requests manually to create classes, create holds, check seat counts, confirm admissions, and cancel holds.
- Used xUnit tests for critical backend cases, including simultaneous admission requests and expiration.
- Built and ran the Docker deployment locally; checked that the services run together.
- Reviewed error output and adjusted configuration rather than assuming generated code was correct.

**Author review before submitting:** Confirm that each item above was actually performed, note any further changes you personally made, and explicitly record any additional tools you used or any bugs you fixed. Do not claim unperformed tests or independent verification.

## Limitations

The generated code and AI explanations may contain mistakes or omit production concerns. This demo has no real payment provider and no administrator/student authentication. The project should not be deployed with real student data without additional security and privacy work.
