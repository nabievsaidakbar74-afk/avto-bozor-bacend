# Avto Bozor Backend

API for the Avto Bozor automotive marketplace. Guests can browse cars. A signed-in user can buy, sell, rent, and rent out cars from the same account. Staff access is controlled with roles.

This repository is the backend only.

## Stack

- Node.js and Express
- TypeScript (strict)
- PostgreSQL and Prisma ORM
- Zod validation
- JWT access tokens and Argon2id password hashing
- Helmet, CORS, and express-rate-limit
- Swagger UI / OpenAPI
- Vitest and Supertest

## Prerequisites

- Node.js 20 or newer
- PostgreSQL running locally
- Database `avto_bozor`, owned by the `avto_bozor` role

## Setup

```bash
npm install
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`.

Edit `.env` and set `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`. Do not commit `.env`.

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The initial migration is `prisma/migrations/20260927000000_init`. `prisma:migrate` runs `prisma migrate dev` and applies pending migrations. It asks for a migration name only when `schema.prisma` has new changes.

## URLs

| Purpose | URL |
| --- | --- |
| Health | http://localhost:3000/api/v1/health |
| Swagger | http://localhost:3000/api/docs |

A healthy response is:

```json
{
  "success": true,
  "message": "API is healthy"
}
```

The health check runs `SELECT 1` against PostgreSQL. If the database is unreachable, the API responds with HTTP 503 and does not include the connection string.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the API with reload |
| `npm run build` | Generate the Prisma client and compile TypeScript |
| `npm start` | Run the compiled server |
| `npm test` | Prepare `avto_bozor_test`, generate the Prisma client, and run unit and integration tests |
| `npm run test:watch` | Re-run tests on change |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate the Prisma client and typecheck |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run prisma:migrate` | Create and apply a development migration |
| `npm run prisma:deploy` | Apply existing migrations. Use this in production |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run seed` | Load development sample data |

`npm run prisma:migrate` runs `prisma migrate dev`. Use it only while developing. Production applies the committed migrations with `npm run prisma:deploy` (`prisma migrate deploy`). Do not use `prisma db push` in production.

## Production

Copy `.env.example` to a secret store or a host environment file that is not committed. Replace every `CHANGE_ME` and `replace-with` value. The process reads:

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP port, default 3000 |
| `HOST` | Bind address, default `0.0.0.0` |
| `NODE_ENV` | `production` enables the secure refresh cookie |
| `JWT_SECRET` | Access-token signing key, at least 32 characters |
| `JWT_REFRESH_SECRET` | Refresh-token hash key, at least 32 characters |
| `JWT_EXPIRES_IN` | Access-token lifetime, such as `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token and cookie lifetime, such as `7d` |
| `CORS_ORIGIN` | Comma-separated site origins. A wildcard is rejected |
| `RATE_LIMIT_WINDOW_MS` | API rate-limit window |
| `RATE_LIMIT_MAX` | Maximum API requests per window per IP |
| `TRUST_PROXY` | `true` only behind a trusted reverse proxy |
| `LOG_LEVEL` | Pino level. `info` is the production default |
| `STORAGE_LOCAL_ROOT` | Writable directory for the local image driver |

The refresh cookie is `refreshToken`, path `/api/v1/auth`, and `HttpOnly`. Production sets `Secure` and `SameSite=None`. Development sets `SameSite=Lax`.

On the server:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

`npm start` runs `node dist/server.js`. `SIGTERM` and `SIGINT` stop accepting HTTP connections, disconnect Prisma, and exit. A second signal waits for the same shutdown. If closing the listener exceeds 10 seconds, the process still disconnects the database and exits with an error.

Logs omit passwords, password hashes, access tokens, refresh tokens, authorization headers, cookies, card data, payment secrets, and database connection strings.

`GET /api/v1/health` runs `SELECT 1`. HTTP 200 means the API and PostgreSQL are reachable:

```json
{
  "success": true,
  "message": "API is healthy"
}
```

HTTP 503 with code `DATABASE_UNAVAILABLE` means the connectivity check failed. The body does not include credentials, host details, or SQL.

Do not run the development seed in production.

## Docker

The image does not contain `.env` or development uploads. Build it from a clean tree:

```bash
docker build -t avto-bozor-api .
```

Apply migrations, then start the API with the real environment supplied at runtime:

```bash
docker run --rm --env-file .env avto-bozor-api npx prisma migrate deploy
docker run --rm --env-file .env -p 3000:3000 avto-bozor-api
```

The container listens on `PORT` (3000 by default) and runs as the `node` user. Docker's health check calls `GET /api/v1/health`.

## Layout

```text
src/
├── config/             environment, logging, OpenAPI
├── common/             errors, middleware, guards, validation, security
├── modules/            feature modules
├── infrastructure/     Prisma client
├── app.ts
└── server.ts
```

Feature modules keep routes, controllers, services, DTOs, and validation in separate files. Controllers stay thin. Business rules belong in services. Database access goes through `PrismaService`.

Further detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md).

## Development seed

`npm run seed` loads local sample data. Every seeded account uses the same password:

`DevOnly#AvtoBozor1`

This password and the `@avtobozor.local` accounts are development-only. Never use them in production.

| Email | Role |
| --- | --- |
| super.admin@avtobozor.local | SUPER_ADMIN |
| admin@avtobozor.local | ADMIN |
| moderator@avtobozor.local | MODERATOR |
| ali.seller@avtobozor.local | USER |
| malika.seller@avtobozor.local | USER |
| jasur.buyer@avtobozor.local | USER |
| nodira.renter@avtobozor.local | USER |

The seed also creates cars, listings, one completed purchase, one pending purchase, rental bookings, and notifications. Passwords are Argon2id hashes.

## Data model

The Prisma schema covers users, cars, images, listings, purchases, rental bookings, payments, favorites, reviews, notifications, reports, audit logs, and refresh tokens. Refresh tokens and passwords are stored as hashes only.

## Tests

```bash
npm test
```

Tests use the local database `avto_bozor_test`. They do not use the application database named in `DATABASE_URL`.

Unit tests cover configuration, RBAC, password hashing, JWT, validation, logging redaction, shutdown, and the health service. Integration tests cover the HTTP modules against PostgreSQL.
