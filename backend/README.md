# FOSS Backend API Subsystem

The **Forever Hotel Food Ordering System (FOSS) Backend** is a NestJS 12 enterprise microservice powering guest dining, room service requests, management feedback, and real-time order tracking.

---

## 1. Architecture & Module Structure

The backend follows modular Domain-Driven Design principles organized under `src/`:

```
backend/src/
├── app.module.ts                   # Root application module registering all submodules
├── main.ts                         # Bootstrap entry point, global filters, Swagger docs
├── common/                         # Global exception filters, logging interceptors
├── config/                         # Configuration service schemas
├── database/                       # TypeORM data sources, identity assertion guards
│   ├── migrations/                 # 11 formal TypeORM migrations (1789... to 1791...)
│   └── scripts/                    # Disposable CI verification scripts
├── health/                         # Health checks and Neon isolation evaluator
├── integrations/                   # Subsystem adapters (FDS, KMS, WKMS, MAD)
│   └── internal-services/          # Mock and real HTTP client implementations
├── messaging/                      # RabbitMQ connection, topology, publisher, consumer
├── modules/
│   ├── guest-sessions/             # QR activation, token signing, session lifecycle
│   ├── menu/                       # Meal periods, catalog caching, meal windows
│   ├── food-orders/                # Cart checkout, ordering, 10-min cancellation
│   ├── service-requests/           # Housekeeping, maintenance, WKMS reconciliation
│   └── complaints/                 # Management feedback, MAD escalation
├── realtime/                       # Fetch-based SSE stream & room event multiplexer
└── redis/                          # Optional Redis client and caching service
```

---

## 2. API Endpoints Overview

The backend exposes **36 HTTP REST endpoints** across 9 controllers with global prefix `/${API_PREFIX}` (default: `/foss`):

- **Guest Sessions (`/foss/guest-sessions`):** QR redemption (`POST /activate`), current session (`GET /me`), session refresh (`POST /refresh`), demo token resolver (`GET /demo-tokens`), checkout revocation webhook (`POST /revoke`), sign-out (`POST /logout`).
- **Menu (`/foss/menu`):** Catalog retrieval (`GET /`), meal period windows (`GET /meal-windows`), single dish lookup (`GET /:id`).
- **Food Orders (`/foss/orders`):** Order placement (`POST /`), order status tracking (`GET /:id`), guest stay order history (`GET /`), order cancellation (`POST /:id/cancel`).
- **Service Requests (`/foss/service-requests`):** Request creation (`POST /`), stay requests list (`GET /`), single request lookup (`GET /:id`), worker status webhook (`POST /events`).
- **Complaints (`/foss/complaints`):** File complaint (`POST /`), list complaints (`GET /`), complaint detail (`GET /:id`), manager resolution webhook (`POST /events`).
- **Realtime (`/foss/realtime`):** Authenticated SSE event stream (`GET /stream`), short-polling fallback (`GET /poll`).
- **Health & Readiness (`/foss/health`):** Liveness (`GET /`), database isolation check (`GET /ready`).

---

## 3. Database Architecture & Safety Guards

FOSS uses **TypeORM** connected to PostgreSQL (Neon Cloud or local Docker):

- **Synchronize Disabled:** `synchronize: false` is enforced in all environments. Schema changes occur exclusively via migrations.
- **Server-Side Isolation Guard:** [`HealthService`](src/health/health.service.ts) verifies PostgreSQL `pg_settings` (`neon.project_id`, `neon.branch_id`, `neon.endpoint_id`) to ensure tests never write to shared development or production databases.
- **Migration Scripts:**
  ```bash
  npm run migration:run       # Runs migrations against local DATABASE_URL
  npm run migration:revert    # Reverts the latest migration batch
  npm run migration:show      # Displays applied vs pending migration status
  ```

> [!CAUTION]
> Never execute migrations or truncation tests against shared Neon databases without explicit approval.

---

## 4. Messaging & Real-Time Security

- **RabbitMQ (AMQP 0-9-1):**
  - Exchange: `forever.hotel.events` (Topic).
  - Queues: Dedicated durable queues with Dead-Letter Exchanges (`forever.hotel.dlx`) and DLQ routing.
  - Controlled via `RABBITMQ_ENABLED` (default: `true`).
- **Real-time SSE:**
  - Uses fetch-based authentication passing `Authorization: Bearer <token>`.
  - URL query parameters are strictly forbidden for transmitting session tokens.
  - Clients receive only events partitioned to their verified room and booking.

---

## 5. Development & Testing Commands

```bash
# Install dependencies
npm install

# Run backend linter (Oxlint: 240 files)
npm run lint

# Check formatting (Prettier)
npm run format:check

# Run unit tests and measure coverage
npm run test:cov -- --runInBand

# Run backend E2E tests
npm run test:e2e

# Compile production build
npm run build
```

---

## 6. Known Limitations

- Live staging endpoints for external hotel services (FDS, KMS, WKMS, MAD) are simulated using typed mock adapters.
- Critical branch coverage currently stands at **84.21%** against the 90% stretch target.
- Redis caching is optional and disabled by default (`REDIS_ENABLED=false`).
- The PostgreSQL transactional outbox is NOT implemented and remains subject to architectural change request approval (`CR-outbox-foss.md`).
