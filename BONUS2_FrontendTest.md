# Bonus 2 — Automated React Frontend Tests

These tests are designed for the React 19 + TypeScript + Vite 8 frontend.

## Tests implemented

- Landing page presents Student and Admin portals
- Student portal hides admin controls and requires 17 digits before reserving
- Admin portal hides student controls and can submit a class creation request
- Student applications are loaded using the locally remembered student ID
- Confirming an admission updates the portal state and hides payment action
- Cancelling a hold updates the portal state and hides cancellation action
- Expired holds disable payment and cancellation
- Backend errors are visible to the user

## Testing approach

Vitest runs React Testing Library against jsdom. The API client is mocked, so the tests are fast, repeatable, and do not alter PostgreSQL. These tests do **not** replace the backend integration tests. They also do not prove that PostgreSQL transactions prevent overbooking.

Test files are outside `src` so the existing production TypeScript build configuration does not include Vitest-only code.

## CI / Docker

The production frontend Dockerfile uses `npm ci` and `npm run build`. Installing the new development dependencies and updating `package-lock.json` ensures the Docker build remains reproducible.
