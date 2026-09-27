# Project rules

These rules apply to `avto-bozor-backend` only. Do not change `avto-bozor-admin`, `avto-bozor-dizayin`, or files outside this backend project unless that work is explicitly requested.

## Product boundaries

- Guests may browse, search, filter, sort, and view car details once those endpoints exist.
- Guests may not buy, rent, publish listings, create bookings, or call private user APIs.
- One `USER` account can buy, sell, rent, and rent out cars. Do not add separate buyer, seller, renter, or owner account types.
- Staff roles are `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, and `USER`.
- Private routes use `authenticate` and `authorize`. Routes that act as a user also use `requireActiveAccount`. Public routes do not.
- `SUPER_ADMIN` bypasses role and permission checks in `authorize`.
- Permission checks go through `authorize` and `hasPermission`. Do not hardcode them in controllers.
- A user updates only their own profile. The profile DTO cannot set role, status, passwordHash, createdAt, or updatedAt.
- Do not trust `ownerId`, `sellerId`, `buyerId`, or `renterId` from the client. Derive the caller's id from the authenticated user, and load the other party from the database.
- An admin can change the status of `USER` and `MODERATOR` accounts. A super admin can change other accounts. Status changes cannot assign a role, and nobody can change their own status.

## API

- Every HTTP endpoint is under `/api/v1`.
- Health is `GET /api/v1/health`.
- Swagger UI is `/api/docs`.
- Success responses are `{ "success": true, "message": "..." }`.
- Error responses include `success: false`, `message`, and `code`.
- Validate request bodies, query strings, and params with Zod before they reach a service.

## Code

- TypeScript is strict. Do not use `any` unless it is unavoidable and isolated.
- Controllers stay thin. Business rules belong in services.
- Prisma access stays in `src/infrastructure/prisma`. Feature modules do not create their own `PrismaClient`.
- Keep each module split into routes, controllers, services, DTOs, and validation.
- Do not put database credentials, JWT secrets, or other secrets in source. Read them from the environment. `.env` stays untracked. `.env.example` keeps placeholders only.
- Do not return connection strings, password hashes, or raw database errors to clients.
- Password storage uses Argon2id. Access tokens use HS256 JWT signed with `JWT_SECRET` and contain only `sub` and `role`.
- Refresh tokens use `JWT_REFRESH_SECRET`. Store only the hash. Send the raw token in an HttpOnly cookie.
- Refresh tokens are stored only as a hash. Never persist the raw token.

## Database

- Change the database by editing `prisma/schema.prisma` and creating a migration.
- Generate the client with `npm run prisma:generate`.
- Apply a development migration with `npm run prisma:migrate`.
- The marketplace schema lives in `prisma/schema.prisma`. Change it with a Prisma migration, not `db push`.

## Tests

- Add unit tests for services, guards, and validation.
- Add API tests for new endpoints, including auth failures and validation failures.
- Run `npm test`, `npm run typecheck`, and `npm run build` before considering a change complete.

## Logging

- Use the shared Pino logger.
- Record security-sensitive state changes through `auditService` until a persisted audit model exists.
- Do not log secrets or full authorization headers.
