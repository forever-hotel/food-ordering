# FOSS Backend API Subsystem

The **Forever Hotel Food Ordering System (FOSS) Backend** is a NestJS `12.0.1` service (Express + TypeORM `1.1.1`) powering QR-authenticated guest sessions, menu browsing with Colombo-time meal windows, idempotent food ordering, room service requests, guest complaints, and real-time updates.

For full-stack local setup (PostgreSQL, RabbitMQ, frontend, and Live API Mode), see the [root README](../README.md#running-the-complete-application-locally-live-api-mode--no-demo).

---

## 1. Architecture & Module Structure

`src/main.ts` bootstraps the NestJS application on `HOST || '::'` and `PORT ?? 4300` with:

- CORS enabled for `FRONTEND_URL` (default `http://localhost:3000`) with `credentials: true`
- Global `correlationMiddleware`
- Global `createIngressPrefixMiddleware()` stripping an optional leading `/${API_PREFIX}` segment (default `foss`) so both `/menu` and `/foss/menu` route identically to unprefixed NestJS controllers
- Global `HttpExceptionFilter` with correlation IDs and log sanitization
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Graceful shutdown hooks (`app.enableShutdownHooks()`)
- Swagger/OpenAPI documentation mounted at `/api/docs` (also reachable at `/foss/api/docs`)

```text
backend/src/
├── app.module.ts                   # Root module importing ConfigModule, DatabaseModule, domain & integration modules
├── app.controller.ts               # Root health/hello endpoint (GET /)
├── main.ts                         # Express bootstrap, CORS, ingress middleware, global pipes/filters, Swagger
├── common/
│   ├── auth/                       # RoomOwnershipGuard, InternalServiceGuard, room-scope utilities
│   ├── filters/                    # HttpExceptionFilter
│   ├── logging/                    # Log sanitization helpers
│   └── middleware/                 # correlationMiddleware, createIngressPrefixMiddleware
├── database/
│   ├── data-source.ts              # Standard TypeORM CLI DataSource (enforces Neon identity guard)
│   ├── data-source.ci.ts           # CI/disposable TypeORM DataSource (enforces local _test DB guard)
│   ├── database.module.ts          # TypeORM async config (DB_HOST* or DATABASE_URL; synchronize: false)
│   ├── guards/                     # assertApprovedDatabaseIdentity, assertCiDisposableDatabase
│   ├── migrations/                 # 11 TypeORM migrations (1789224971217 through 1791900000009)
│   └── scripts/                    # verify-ci-database.ts
├── health/                         # HealthController & HealthService (liveness, readiness, DB isolation)
├── integrations/
│   ├── contracts/                  # Versioned DTOs, signed event envelopes, UpstreamServiceUnavailableException
│   └── internal-services/          # Typed mock & real HTTP adapters for FDS (booking), KMS, WKMS, MAD
├── messaging/                      # RabbitMQ connection, topology, HMAC publisher & consumer (amqplib)
├── modules/
│   ├── guest-sessions/             # QR issuance/redemption, HttpOnly cookie & Bearer auth, FDS webhooks
│   ├── menu/                       # KMS menu catalog, Asia/Colombo HotelClockService, MealWindowService
│   ├── food-orders/                # Idempotent order placement, 10-min cancellation, dev-only status sim
│   ├── service-requests/           # 6 active categories, PostgreSQL persistence, WKMS dispatch & webhooks
│   └── complaints/                 # Complaint intake, CMP-* references, MAD escalation & webhooks
├── realtime/                       # SSE stream, REST polling fallback, and RabbitMQ hotel.realtime relay
└── redis/                          # Optional RedisService (REDIS_ENABLED=false by default) with memory fallback
```

---

## 2. API Endpoints

All controllers register unprefixed routes, and `createIngressPrefixMiddleware()` strips a leading `/${API_PREFIX}` (`foss` by default) when present. Across the 9 controllers (`AppController`, `HealthController`, `BookingController`, `GuestSessionsController`, `MenuController`, `FoodOrdersController`, `ServiceRequestsController`, `ComplaintsController`, and `RealtimeController`), the backend exposes the following routes:

### Root & Health

| Method | Path                                  | Auth / Guard           | Purpose                                                                                                |
| ------ | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/`                                   | Public                 | Basic service greeting (`AppController`)                                                               |
| `GET`  | `/health`                             | Public                 | Process liveness probe                                                                                 |
| `GET`  | `/health/live`                        | Public                 | Container liveness probe                                                                               |
| `GET`  | `/health/ready`                       | Public                 | Readiness probe (`SELECT 1`, optional `SHARED_DATABASE_MODE` schema check, RabbitMQ connection status) |
| `GET`  | `/health/internal/database-isolation` | `InternalServiceGuard` | Reports non-sensitive Neon/local DB isolation classification                                           |

### Internal Booking Verification

| Method | Path                           | Auth / Guard        | Purpose                                                                                 |
| ------ | ------------------------------ | ------------------- | --------------------------------------------------------------------------------------- |
| `POST` | `/integrations/booking/verify` | Public/Internal DTO | Delegates stay verification (`bookingId`, `roomNumber`) to `BookingVerificationService` |

### Guest Sessions (`/guest-sessions`)

| Method | Path                                            | Auth / Guard                                             | Purpose                                                                                                        |
| ------ | ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST` | `/guest-sessions/internal/qr/issue`             | `InternalServiceGuard`                                   | Issues single-use 256-bit QR slip (`Cache-Control: no-store`); stores SHA-256 hash only                        |
| `POST` | `/guest-sessions/internal/qr-issue`             | `InternalServiceGuard`                                   | Alias for FDS QR issuance                                                                                      |
| `POST` | `/guest-sessions/qr`                            | Public (returns token only to verified internal callers) | Redeems single-use opaque QR token (or legacy `.` token in non-prod) and sets `HttpOnly` `foss_session` cookie |
| `GET`  | `/guest-sessions/me`                            | `GuestAuthGuard`                                         | Returns active guest stay context (`Cache-Control: no-store`)                                                  |
| `GET`  | `/guest-sessions/realtime-session`              | `GuestAuthGuard`                                         | Returns normalized guest claims for shared realtime authentication                                             |
| `POST` | `/guest-sessions/realtime-ticket`               | `GuestAuthGuard`                                         | Exchanges session for a short-lived ticket from `SHARED_WEBSOCKET_URL`                                         |
| `GET`  | `/guest-sessions/rooms/:roomNumber`             | `GuestAuthGuard`, `RoomOwnershipGuard`                   | Verifies room scope; rejects cross-room access with `403`                                                      |
| `GET`  | `/guest-sessions/bookings/:bookingId`           | `GuestAuthGuard`, `RoomOwnershipGuard`                   | Verifies booking scope; rejects cross-booking access with `403`                                                |
| `POST` | `/guest-sessions/logout`                        | `GuestAuthGuard`                                         | Clears `foss_session` cookie and invalidates session                                                           |
| `POST` | `/guest-sessions/renew`                         | `GuestAuthGuard`                                         | Renews active stay session without rescanning QR                                                               |
| `POST` | `/guest-sessions/internal/events/checkout`      | `InternalServiceGuard`                                   | Revokes active session and unredeemed QR slips on FDS checkout                                                 |
| `POST` | `/guest-sessions/internal/events/room-reassign` | `InternalServiceGuard`                                   | Revokes prior room session on FDS room reassignment                                                            |
| `GET`  | `/guest-sessions/internal/events/:eventId`      | `InternalServiceGuard`                                   | Checks processed internal FDS event status                                                                     |

### Menu (`/menu`)

| Method | Path              | Auth / Guard     | Purpose                                                                        |
| ------ | ----------------- | ---------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/menu`           | `GuestAuthGuard` | Retrieves guest menu catalog with `Asia/Colombo` meal windows and cutoff flags |
| `GET`  | `/menu/windows`   | `GuestAuthGuard` | Returns meal window schedules and cutoff countdowns                            |
| `GET`  | `/menu/items/:id` | `GuestAuthGuard` | Retrieves a single menu item by ID (`404` if not found)                        |

### Food Orders (`/food-orders`)

| Method | Path                      | Auth / Guard                                 | Purpose                                                                                                                                                               |
| ------ | ------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/food-orders`            | `GuestAuthGuard`                             | Idempotently validates items/meal windows, computes server-side prices, and submits to KMS                                                                            |
| `GET`  | `/food-orders`            | `GuestAuthGuard`                             | Lists food orders for the authenticated stay                                                                                                                          |
| `GET`  | `/food-orders/:id`        | `GuestAuthGuard`                             | Retrieves a single stay order with timeline and cancellation eligibility                                                                                              |
| `POST` | `/food-orders/:id/cancel` | `GuestAuthGuard`                             | Cancels an eligible order within 10 minutes before kitchen preparation begins                                                                                         |
| `POST` | `/food-orders/:id/status` | `GuestAuthGuard`, `OrderDemoSimulationGuard` | Dev/test-only deterministic status simulation (blocked unless `ENABLE_ORDER_DEMO_SIMULATION=true`, `DEMO_MODE=true`, non-prod, and `SHARED_DATABASE_MODE !== 'true'`) |

### Service Requests (`/service-requests`)

| Method | Path                                               | Auth / Guard           | Purpose                                                                       |
| ------ | -------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `POST` | `/service-requests`                                | `GuestAuthGuard`       | Creates a room-bound request (6 active categories) and dispatches a WKMS task |
| `GET`  | `/service-requests`                                | `GuestAuthGuard`       | Lists service requests for the current stay                                   |
| `GET`  | `/service-requests/:id`                            | `GuestAuthGuard`       | Retrieves request details and timeline (`403` on cross-stay access)           |
| `POST` | `/service-requests/:id/status`                     | `GuestAuthGuard`       | Demo-only status advancement (`DEMO_MODE=true` required)                      |
| `POST` | `/service-requests/internal/events/status-updated` | `InternalServiceGuard` | Internal webhook consuming WKMS task status updates                           |

### Complaints (`/complaints`)

| Method  | Path                                         | Auth / Guard           | Purpose                                                                    |
| ------- | -------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `POST`  | `/complaints`                                | `GuestAuthGuard`       | Files a room-bound complaint with `CMP-...` reference and escalates to MAD |
| `GET`   | `/complaints`                                | `GuestAuthGuard`       | Lists complaints for the current stay                                      |
| `GET`   | `/complaints/:id`                            | `GuestAuthGuard`       | Retrieves complaint details and timeline                                   |
| `PATCH` | `/complaints/:id/status`                     | `GuestAuthGuard`       | Demo/mock manager status advancement                                       |
| `POST`  | `/complaints/internal/events/status-updated` | `InternalServiceGuard` | Internal webhook consuming MAD complaint status updates                    |

### Real-Time Events (`/realtime`)

| Method      | Path                      | Auth / Guard     | Purpose                                                                                               |
| ----------- | ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `GET` (SSE) | `/realtime/events/stream` | `GuestAuthGuard` | Server-Sent Events stream scoped strictly to `${bookingId}:${roomNumber}`                             |
| `GET`       | `/realtime/events/poll`   | `GuestAuthGuard` | Buffered event polling fallback (`sinceVersion`, `sinceTimestamp`; `recommendedPollIntervalMs: 3000`) |

---

## 3. Database & Safety Guards

- **TypeORM Connection (`src/database/database.module.ts`):** Uses `DB_HOST` (+ `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`) if `DB_HOST` is defined; otherwise reads `DATABASE_URL`. Both `synchronize` and `migrationsRun` are strictly `false`.
- **Migrations (`src/database/migrations/`):** 11 formal migrations (`1789224971217-BaselineDatabase.ts` through `1791900000009-AddToiletriesToServiceRequestCategory.ts`). Notably, `1791900000007-DropFossDemoOrders.ts` removed `foss_demo_orders` (KMS owns canonical food orders per ADR-003), and `1791900000008-RemoveCrossDomainForeignKeys.ts` removed cross-subsystem foreign keys.
- **Neon & CI Migration Guards:**
  - `npm run migration:run` (`src/database/data-source.ts`) hooks `AppDataSource.initialize()` with [`assertApprovedDatabaseIdentity`](src/database/guards/assert-approved-database-identity.ts), requiring `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, and `APPROVED_NEON_TEST_ENDPOINT_ID` to match PostgreSQL `pg_settings` (`neon.project_id`, `neon.branch_id`, `neon.endpoint_id`) and rejecting `PARENT_DEV_BRANCH_ID`. **Standard local Docker PostgreSQL containers lack Neon `pg_settings`, so `npm run migration:run` fails closed against them.**
  - `npm run migration:run:ci` (`src/database/data-source.ci.ts`) hooks `CiAppDataSource.initialize()` with [`assertCiDisposableDatabase`](src/database/guards/assert-ci-disposable-database.ts), requiring `localhost`/`127.0.0.1`/`::1`, zero Neon `pg_settings`, zero shared hotel tables, and a database name ending in `_test` (such as `foss_test` or `food_ordering_test`; `food_ordering` and `postgres` are explicitly rejected).

```bash
# Against an approved Neon test branch (with APPROVED_NEON_* set in backend/.env)
npm run migration:show
npm run migration:run
npm run migration:revert

# Against a local disposable _test PostgreSQL database (e.g., foss_test)
npm run verify:db:ci
npm run migration:run:ci
```

> [!CAUTION]
> Never execute migrations, schema resets, or destructive tests against shared Neon development or production databases.

---

## 4. Messaging (RabbitMQ) & Optional Redis

### RabbitMQ (`src/messaging/`)

Controlled by `RABBITMQ_ENABLED` (default `true` when set or when `RABBITMQ_URL` is non-empty) and `RABBITMQ_URL`:

- **Primary Exchange:** `forever.events` (`topic`, durable)
- **Dead-Letter Exchange (DLX):** `forever.events.dlx` (`direct`, durable)
- **Incoming Queue:** `foss.incoming.events` (durable, dead-lettered to `forever.events.dlx` with routing key `foss.events.dlq`)
- **Dead-Letter Queue (DLQ):** `foss.events.dlq` (durable)
- **Consumer Bindings:** `kms.order.*`, `wkms.task.*`, `mad.complaint.*`, `fds.guest.*`
- **Publisher Routing Keys (`FOSS_ROUTING_KEYS`):** `foss.order.created`, `foss.service_request.created`, `foss.complaint.submitted`, `foss.session.revoked`
- **Reliability & Security:** Uses `ConfirmChannel` for publisher confirms, HMAC-SHA256 envelope signing/verification using `INTERNAL_SERVICE_KEY` (tampered signatures are rejected to DLQ), in-memory event ID deduplication (capped at 5,000 entries), and `RABBITMQ_MAX_RETRIES = 3` before dead-lettering.

### Real-Time Behavior (Design vs. Implementation)

While the original SDS specifies WebSockets, the current FOSS backend implements:

1. **Authenticated SSE & Polling (`src/realtime/`):** `RealtimeService` buffers up to 100 events per `${bookingId}:${roomNumber}` channel with monotonic version numbers, pushes live updates over `GET /realtime/events/stream`, and serves missed events via `GET /realtime/events/poll`.
2. **Optional Shared WebSocket Relay Bridge:** When RabbitMQ is connected, `RealtimeService` also asserts durable topic exchange `hotel.realtime` and publishes `foss.guest.event` and `mad.notifications.changed`; `GuestSessionsController` exposes `GET /guest-sessions/realtime-session` and `POST /guest-sessions/realtime-ticket` (forwarding to `SHARED_WEBSOCKET_URL` with `WEBSOCKET_RELAY_KEY`).

### Optional Redis (`src/redis/`)

- Disabled by default (`REDIS_ENABLED=false`).
- When disabled or unreachable, `RedisService` transparently falls back (fail-open) to an in-memory cache map with a 60-second expiration sweep (`REDIS_TTL_SECONDS` defaults to `300`).

---

## 5. External Service Adapters (`src/integrations/`)

Each upstream subsystem (`booking`/FDS, `kms`, `wkms`, `mad`) uses a NestJS factory provider:

- If `MOCK_EXTERNAL_SERVICES === 'true'` or `DEMO_MODE === 'true'`, mock adapters are injected (startup throws in `NODE_ENV=production`).
- Otherwise (`MOCK_EXTERNAL_SERVICES=false` and `DEMO_MODE=false`), real HTTP adapters are injected:
  - `RealBookingAdapter` (`FDS_BOOKING_SERVICE_URL`, `FDS_BOOKING_SERVICE_API_KEY`)
  - `RealKmsAdapter` (`KMS_SERVICE_URL`, `KMS_SERVICE_API_KEY` >= 32 chars)
  - `RealWkmsAdapter` or `SharedWkmsAdapter` when `SHARED_DATABASE_MODE=true` (`WKMS_SERVICE_URL`, `WKMS_SERVICE_API_KEY`)
  - `RealMadComplaintAdapter` (`MAD_SERVICE_URL`, `MAD_SERVICE_API_KEY`)
- All real adapters fail closed (`503` / `UpstreamServiceUnavailableException`) when unconfigured or unreachable.

---

## 6. Security Controls

- **Session Authentication (`GuestAuthGuard`):** Accepts `Authorization: Bearer <token>`, `HttpOnly` cookie `foss_session` (or legacy `foss_guest_session`), or `?token=` strictly for `/realtime/events/stream` SSE requests. Cookie-authenticated mutations (`POST`/`PUT`/`PATCH`/`DELETE`) enforce CSRF origin/referer validation against `FRONTEND_URL` / `ALLOWED_ORIGINS` (or `x-foss-client`/`x-requested-with` when origin is absent).
- **Room & Booking Isolation (`RoomOwnershipGuard`):** Rejects cross-room or cross-booking requests with `403 Forbidden`.
- **Single-Use QR Credentials (`QrActivationService`):** Stores only SHA-256 digests of 256-bit tokens in `foss_qr_activations`, redeems atomically inside a PostgreSQL transaction, and disables legacy `.` signed QR tokens in `NODE_ENV=production`.
- **Internal Service Auth (`InternalServiceGuard`):** Validates `x-internal-service-key` or `x-fds-signature` via SHA-256 `crypto.timingSafeEqual`.
- **Sanitized Logging & Validation:** Global `ValidationPipe` strips/rejects unknown properties, DTOs bound free-text lengths, and `log-sanitizer.util.ts` redacts sensitive headers/tokens.

---

## 7. Development & Verification Commands

All scripts below are defined in [`package.json`](package.json):

```bash
# Install dependencies
npm ci

# Run NestJS development server (watch mode on PORT=4300)
npm run start:dev

# Compile production build (dist/)
npm run build

# Run production build
npm run start:prod

# Linting (Oxlint) & Formatting (Prettier)
npm run lint
npm run format:check

# Unit/integration tests & Jest coverage (--experimental-vm-modules)
npm test
npm run test:cov -- --runInBand

# Backend E2E suites (requires configured test DB)
npm run test:e2e

# Performance benchmark suite
npm run test:perf
```

---

## 8. Known Limitations & Historical QA Reference

- **External Subsystems Required in Real Mode:** With `DEMO_MODE=false` and `MOCK_EXTERNAL_SERVICES=false`, operations calling FDS, KMS, WKMS, or MAD fail closed unless live upstream services are running.
- **Transactional Outbox Not Implemented:** RabbitMQ publishing occurs directly with publisher confirms; a PostgreSQL transactional outbox remains unimplemented pending [`docs/change-requests/CR-outbox-foss.md`](../docs/change-requests/CR-outbox-foss.md).
- **QA Coverage Snapshot (9 November 2026, commit `b4b19df`):** Older documentation cited an earlier baseline of 557 tests and 84.21% critical branch coverage. The verified **9 November 2026** run recorded in [`documents/README.md`](../documents/README.md) and [`documents/testing/coverage-notes.md`](../documents/testing/coverage-notes.md) measured **670/670** backend Jest tests passing across 67 suites (**88.36%** statements, **83.43%** branches, **79.54%** functions, **88.78%** lines), **92.00%** critical branch coverage across 13 core domain modules, and **231** passing backend E2E tests (5 skipped). Re-run `npm run test:cov -- --runInBand` and `npm run test:e2e` to verify current `develop` commits.
