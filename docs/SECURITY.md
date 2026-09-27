# Security

Avto Bozor keeps marketplace trust in the API. Prices, owners, and status changes are decided on the server. This document describes the controls in the backend and the limits that remain.

## Authentication

- Passwords are hashed with Argon2id. Login compares a hash even when the email does not exist, so missing accounts do not return faster.
- Access tokens are short-lived HS256 JWTs. The payload is `sub` and `role`. Verification accepts only HS256.
- Refresh tokens are 32 random bytes. The database stores an HMAC-SHA256 of the token, keyed with `JWT_REFRESH_SECRET`.
- Refresh rotates the token and revokes the previous one. Reuse of a revoked token revokes the rest of that user's active refresh tokens.
- Logout revokes the presented refresh token and clears the cookie.
- The refresh cookie is `HttpOnly`, `Secure` in production, and scoped to `/api/v1/auth`. Production uses `SameSite=None` so the separate web app can refresh a session. Development uses `SameSite=Lax`.
- `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout` require `Content-Type: application/json`. A cross-site form post cannot set that header without a CORS preflight, and CORS allows only the configured origins.
- Login and registration share a limiter of 10 attempts per 15 minutes per IP. The rest of `/api` uses `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.
- `requireActiveAccount` reloads the user from PostgreSQL. A blocked or suspended account cannot keep calling the API with an old access token. The role used for authorization is the database role, not a stale token claim.
- Access tokens stay valid until they expire. Logout does not revoke an access token that was already issued. Keep `JWT_EXPIRES_IN` short.

## Authorization

- Roles are `USER`, `MODERATOR`, `ADMIN`, and `SUPER_ADMIN`. Permissions live in `src/common/security/permissions.ts`.
- `SUPER_ADMIN` passes permission checks. Other roles must have the permission, and staff routes also require the staff role.
- Moderators can moderate listings and reports. They cannot read the dashboard, audit log, or change account status.
- Administrators can change `USER` and `MODERATOR` status. They cannot change an administrator or a super administrator. Nobody can change their own status. The status body cannot set a role.
- Profile updates accept email, phone, name, and avatar. Role, status, and `passwordHash` are rejected.
- Ownership checks use the authenticated user. `ownerId`, `sellerId`, `buyerId`, and `renterId` from the client are rejected or ignored. A stranger receives 404 for another person's purchase, booking, payment, notification, favorite, or report.

## Business rules

- Purchase and booking prices are copied from the listing inside a transaction. The client cannot send `price`, `dailyPrice`, `totalPrice`, or a payment amount.
- Creating a purchase locks the car, requires an available car and a published sale listing, and rejects a second open or completed purchase.
- A confirmed or active rental blocks a new purchase. An open or completed purchase blocks a new booking and blocks confirming a pending booking. Both checks run after the car row is locked.
- Owners cannot set a listing to `PUBLISHED`, `SOLD`, or `RENTED`. Publication is a moderation action.
- Owners cannot set a car to `RESERVED`, `SOLD`, or `RENTED`. After a sale reserves the car, the owner cannot change that status through the car API.

## Database

- Foreign keys, unique constraints, and check constraints live in Prisma migrations. Completed purchases are unique per car. Open payments are unique per purchase and per booking.
- Queries use Prisma's parameterized API, including `$queryRaw` tagged templates used for row locks. Sort fields are allowlists.
- Audit logs and report lists are paginated.
- Unexpected Prisma errors return a generic message. Connection strings are removed from error text that is logged or returned.

## File uploads

- Image bytes are stored through `StorageProvider`. Development writes them under the local storage root. PostgreSQL stores the URL, storage key, and metadata.
- The server sniffs JPEG, PNG, and WebP, checks the declared MIME type and extension, and limits size and dimensions. The stored name is a UUID. Storage keys that leave `car-images/` are rejected.
- `/uploads` is served with dotfiles denied. The client filename is not used as a path.

## Web headers and logging

- Helmet sets the usual browser headers. Swagger disables the content security policy on `/api/docs` so the UI can load.
- CORS allows the explicit `CORS_ORIGIN` list with credentials. A wildcard origin is rejected at startup.
- Request logs redact authorization headers, cookies, refresh tokens, and password fields.

## Audit logging

Important actions are stored in `audit_logs` with the actor, action, resource, metadata, IP, and user agent. Administrators can list them with filters and pagination. Passwords and card data are not written to metadata.

## Threat model

The API assumes:

- The browser or mobile client can be modified. Every price, owner, and status rule is enforced again on the server.
- Access tokens can be stolen until they expire. Refresh tokens are rotated and can be revoked.
- Staff accounts are trusted to refund purchases and change user status within the role hierarchy.
- PostgreSQL and the server host are trusted. The database password and JWT secrets are deployment secrets.

Out of scope for this service: a real card processor, malware scanning of images, and revocation of an access token before its expiry.

## Known limitations

- Logout does not invalidate an access token that is already in the attacker's hands. Expiry is the bound.
- Login and registration limits are per IP. A distributed client can spread attempts. The limiter is skipped during automated tests unless the request sets `x-test-rate-limit: enforce`.
- Image uploads are not scanned for malware. Only JPEG, PNG, and WebP signatures are accepted.
- The local storage driver is for development. Production object storage should implement `StorageProvider` with a private bucket and a separate public URL.
- Development seed accounts use a documented password and must not be used outside local databases.
- `.env` is gitignored. `.env.example` contains placeholders only.
