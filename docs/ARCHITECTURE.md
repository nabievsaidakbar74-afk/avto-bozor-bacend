# Architecture

Avto Bozor backend is a modular monolith. One Node.js process owns HTTP, authorization, and PostgreSQL access. Features are separated by module, not by deployable service.

## Request flow

```text
HTTP request
  -> security headers, CORS, body parser, request log
  -> rate limit on /api
  -> /api/v1/<module> router
  -> controller
  -> service
  -> PrismaService
  -> PostgreSQL
```

`src/app.ts` builds the Express application. `src/server.ts` listens and checks the database on startup. Tests import `createApp()` and do not open a port.

## Modules

Each feature module lives under `src/modules/<name>/` and separates:

| File | Responsibility |
| --- | --- |
| `*.routes.ts` | URL paths and middleware order |
| `*.controller.ts` | Read the request, call a service, write the response |
| `*.service.ts` | Business rules |
| `*.dto.ts` | TypeScript types for inputs and outputs |
| `*.validation.ts` | Zod schemas used by the validation middleware |

Mounted prefixes:

| Prefix | Module |
| --- | --- |
| `/api/v1/health` | Health |
| `/api/v1/auth` | Authentication |
| `/api/v1/users` | Users |
| `/api/v1/cars` | Cars |
| `/api/v1/listings` | Listings |
| `/api/v1/sales` | Sales |
| `/api/v1/rentals` | Rentals |
| `/api/v1/bookings` | Bookings |
| `/api/v1/payments` | Payments |
| `/api/v1/favorites` | Favorites |
| `/api/v1/reviews` | Reviews |
| `/api/v1/notifications` | Notifications |
| `/api/v1/reports` | Reports |
| `/api/v1/moderation` | Moderation |
| `/api/v1/admin` | Admin |
| `/api/v1/audit` | Audit |

Health, authentication, profiles, admin user management, the admin dashboard, audit logs, cars, car images, listings, listing moderation, user reports, car sales, rental bookings, payments, favorites, reviews, and notifications are implemented. Car image bytes go through a StorageProvider. Development uses local disk, and the same contract is ready for S3-compatible storage. PostgreSQL stores the image URL, storage key, and metadata. The other routers are registered so new endpoints stay on `/api/v1` inside their module. Guests can list and view public cars and published listings. Creating a car or listing sets the owner from the authenticated user. Deleting a car sets its status to `INACTIVE`. Listing publication and report resolution are moderation actions and write an `AuditLog` row.

## Identity and RBAC

There is one user account. Buying, selling, renting, and renting out a car are actions on that account, not separate account types.

Staff roles:

| Role | Access |
| --- | --- |
| `USER` | Own profile and own marketplace activity |
| `MODERATOR` | User permissions, plus listing moderation and reports |
| `ADMIN` | Moderator permissions, plus user status changes and audit |
| `SUPER_ADMIN` | Every permission |

Permission names live in `src/common/security/permissions.ts`. Route guards are `authenticate`, `requireActiveAccount`, and `authorize`. Public browsing routes must omit those guards. Private routes must use them. `requireActiveAccount` reloads the user and replaces the token role with the database role.

`GET /api/v1/users/me` and `PATCH /api/v1/users/me` use the authenticated user id. The profile DTO accepts only email, phone, first name, last name, and avatar. Owner, seller, buyer, and renter ids are derived in `src/common/security/ownership.ts` and are not taken from the client. Admin user routes are `GET /api/v1/admin/users`, `GET /api/v1/admin/users/:id`, and `PATCH /api/v1/admin/users/:id/status`. An admin can change `USER` and `MODERATOR` accounts. A super admin can change other accounts. Nobody can change their own status through that route.

Guest traffic has no token and cannot pass `authenticate`.

## Data access

`src/infrastructure/prisma/prisma.service.ts` owns the Prisma client. Services call `PrismaService` or the shared `prisma` instance from that module. Do not construct another `PrismaClient` in feature code.

The connection string is `DATABASE_URL`. The health check runs `SELECT 1` with a short timeout and strips connection strings from logs.

## Errors and validation

Operational failures throw `AppError`. The error middleware returns:

```json
{
  "success": false,
  "message": "Human readable message",
  "code": "ERROR_CODE"
}
```

Zod failures become HTTP 422 with `code` `VALIDATION_ERROR` and field `details`. Unexpected errors become HTTP 500. Outside development, the client message is `Internal server error`. Prisma unique conflicts become HTTP 409. Missing records become HTTP 404. Raw database messages are not returned.

Successful responses use:

```json
{
  "success": true,
  "message": "..."
}
```

## Security middleware

- Helmet on every response. Swagger UI disables the content security policy that would block its scripts.
- CORS origins come from `CORS_ORIGIN` (comma-separated).
- `express-rate-limit` covers `/api`, except `/api/docs` and the test environment.
- `x-powered-by` is disabled.
- Passwords are hashed with Argon2id.
- Access tokens are short-lived HS256 JWTs containing only `sub` and `role`. The secret is `JWT_SECRET`.
- Refresh tokens are random values stored only as an HMAC-SHA256 hash. The raw token is sent in an HttpOnly cookie. `JWT_REFRESH_SECRET` is the HMAC key.

## Logging

Pino writes structured logs. Authorization headers and password fields are redacted. `auditService.record` writes a structured log line. The `AuditLog` table is the persisted audit model for later use.

## Data model

PostgreSQL tables are owned by `prisma/schema.prisma`. Money uses `Decimal`. Timestamps use `timestamptz`. Passwords and refresh tokens are stored only as hashes.

Dependent rows cascade (`CarImage`, `Favorite`, `Notification`, `RefreshToken`). Financial and moderation history uses `Restrict` or `SetNull` so a delete cannot erase purchases, bookings, payments, or audit history. `Purchase.completedCarId` is unique and is set to the car id only for a `COMPLETED` purchase, so a car cannot have two completed purchases.

## API docs

Swagger UI is served at `/api/docs` from the OpenAPI document in `src/config/swagger.ts`.
