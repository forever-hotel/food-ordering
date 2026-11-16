# Forever Hotel Food Ordering System (FOSS)

The **Forever Hotel Food Ordering System (FOSS)** is the guest-facing digital dining and in-room services subsystem of the Forever Hotel Management System. It provides a mobile-first web application backed by a NestJS API service for QR-authenticated guest stays, in-room food ordering, housekeeping service requests, complaint submission, and real-time status updates with strict room and booking isolation.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Running Locally — Overview](#running-locally--overview)
- [Running the Complete Application Locally (Live API Mode — No Demo)](#running-the-complete-application-locally-live-api-mode--no-demo)
- [Running Frontend Demo Mode](#running-frontend-demo-mode)
- [Running FOSS with Docker Compose](#running-foss-with-docker-compose)
- [Environment Variable Configuration](#environment-variable-configuration)
- [External Subsystem Integration](#external-subsystem-integration)
- [API Documentation](#api-documentation)
- [Testing and Code Quality](#testing-and-code-quality)
- [Database Safety](#database-safety)
- [CI/CD and Deployment](#cicd-and-deployment)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Related Project Documentation](#related-project-documentation)

---

## Project Overview

FOSS serves checked-in hotel guests during their authorized stay window without requiring a separate guest account or mobile app installation. A guest scans a single-use room QR slip (or opens the activation link `/activate?token=...`) to establish a room-scoped session bounded by the Front Desk System (FDS) stay dates.

- **Primary Integration Branch:** `develop`
- **Repository:** `forever-hotel/food-ordering`
- **Detailed Subsystem Guides:**
  - [Backend Subsystem README](backend/README.md)
  - [Frontend Subsystem README](frontend/README.md)
  - [QA & Security Evidence README](documents/README.md)

---

## Features

Implemented guest-facing and operational capabilities verified in the codebase:

- **QR Session Activation & Stay Lifecycle:** Single-use 256-bit QR activation slips issued via internal FDS endpoints (`POST /guest-sessions/internal/qr/issue`), SHA-256 token hashing at rest, `HttpOnly` cookie session establishment (`foss_session`), stay-bound expiry (`stayStart` / `stayEnd`), session renewal (`POST /guest-sessions/renew`), logout (`POST /guest-sessions/logout`), and FDS checkout/room-reassignment revocation webhooks.
- **Menu Browsing & Meal Windows:** Categorized menu catalog (`GET /menu`), single item detail lookup (`GET /menu/items/:id`), and operational meal window enforcement in `Asia/Colombo` time (`BREAKFAST` 06:30–10:30, `LUNCH` 12:00–15:00, `DINNER` 18:30–22:30, `ALL_DAY` 06:00–23:00, plus dynamic KMS `orderingWindow` schedules) via `GET /menu/windows`.
- **Cart & Food Ordering:** Persistent in-session cart partitioned by room/stay, item quantity limits (`1–20` per line item and optional KMS `portionLimit`), order-level allergy notes (max `300` characters), server-authoritative pricing, idempotent submission (`Idempotency-Key` / `X-Idempotency-Key`), order history/tracking, and a 10-minute cancellation window before kitchen preparation begins (`POST /food-orders/:id/cancel`).
- **In-Room Service Requests:** Six active guest-facing categories (`ROOM_CLEANING`, `EXTRA_TOWELS`, `TOILETRIES`, `MAINTENANCE`, `LAUNDRY_PICKUP`, `OTHER`), notes up to `500` characters, idempotent submission, PostgreSQL persistence, and Worker Management System (WKMS) task dispatch.
- **Guest Complaints & Feedback:** Category and severity grading (`LOW`, `MEDIUM`, `HIGH`, and `URGENT` in mock/demo mode; `URGENT` is rejected in non-mock/non-demo mode pending cross-subsystem MAD enum approval), subject (`3–150` chars) and description (`10–1000` chars), optional linking to current-stay orders or service requests, `CMP-YYYYMMDD-XXXXXX` reference codes, and Manager Analytical Dashboard (MAD) escalation.
- **Real-Time Updates:** Fetch-based Server-Sent Events (`GET /realtime/events/stream`) with exponential-backoff reconnection and REST polling fallback (`GET /realtime/events/poll`), plus optional shared WebSocket ticket exchange (`POST /guest-sessions/realtime-ticket`) when `NEXT_PUBLIC_GATEWAY_URL` is configured.
- **Asynchronous Event Bus (RabbitMQ):** Topic exchange (`forever.events`) and Dead-Letter Queue (`forever.events.dlx` / `foss.events.dlq`) for HMAC-signed domain events (`kms.order.*`, `wkms.task.*`, `mad.complaint.*`, `fds.guest.*` inbound; `foss.*` outbound).
- **Optional Non-Authoritative Cache (Redis):** Disabled by default (`REDIS_ENABLED=false`) with transparent fail-open fallback to an in-memory TTL cache.

---

## System Architecture

```text
                 ┌──────────────────────────────────────────┐
                 │        Forever Hotel API Gateway         │
                 │           (Client /foss/* proxy)         │
                 └────────────────────┬─────────────────────┘
                                      │ HTTPS / REST / WS
                 ┌────────────────────▼─────────────────────┐
                 │        FOSS Frontend (Next.js 16)        │
                 │  React 19 · Ant Design 6 · Tailwind 4    │
                 │               (:3000)                    │
                 └────────────────────┬─────────────────────┘
                                      │ REST + SSE (or Gateway WS)
                 ┌────────────────────▼─────────────────────┐
                 │         FOSS Backend (NestJS 12)         │
                 │   Express · TypeORM · Swagger (/api/docs)│
                 │      (:4300, strips optional /foss)      │
                 └───┬───────────────┬───────────────┬──────┘
                     │               │               │
      ┌──────────────▼───┐    ┌──────▼──────┐    ┌───▼───────────────┐
      │   PostgreSQL 16  │    │  RabbitMQ   │    │  Redis (Optional) │
      │ (Local Docker /  │    │  AMQP 0-9-1 │    │  REDIS_ENABLED    │
      │  Neon Serverless)│    │  Broker     │    │  default: false   │
      └──────────────────┘    └─────────────┘    └───────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌───────────────┐             ┌───────────────┐             ┌───────────────┐
│      FDS      │             │      KMS      │             │   WKMS / MAD  │
│ Check-in/Stay │             │ Menu & Orders │             │ Tasks / Desk  │
└───────────────┘             └───────────────┘             └───────────────┘
```

### Real-Time Architecture Note (Design vs. Current Implementation)

The original System Design Specification (SDS) describes WebSocket delivery for real-time updates. In the current FOSS codebase:

- **Direct Local / Standalone Mode:** When `NEXT_PUBLIC_GATEWAY_URL` is unset (the default in `frontend/.env.example`), the frontend (`FossRealtimeClient`) connects to the backend using **fetch-based Server-Sent Events (`GET /realtime/events/stream`)** and automatically falls back to **authenticated REST polling (`GET /realtime/events/poll`)** if streaming fails.
- **Shared Gateway / Socket.IO Mode:** When `NEXT_PUBLIC_GATEWAY_URL` is configured, the frontend requests a short-lived ticket from `POST /guest-sessions/realtime-ticket` (requires `SHARED_WEBSOCKET_URL` and `WEBSOCKET_RELAY_KEY` on the backend) and connects via Socket.IO (`path: /realtime/socket.io`), while the backend publishes relay messages to the `hotel.realtime` RabbitMQ exchange.

---

## Technology Stack

| Layer                 | Technologies & Verified Versions                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**          | Next.js `16.4.1` (standalone output), React `19.2.8`, Ant Design `6.6.5`, Tailwind CSS `4`, `@zxing/browser` `0.2.1`, `socket.io-client` `4.8.4`                                        |
| **Backend**           | NestJS `12.0.1`, Express, TypeORM `1.1.1`, `pg` `8.23.0`, `amqplib` `2.2.1`, `ioredis` `5.11.1`, `@nestjs/swagger` `12.0.5`, `class-validator`, `class-transformer`                     |
| **Data & Messaging**  | PostgreSQL `16` (local container or Neon serverless), RabbitMQ `3` (`rabbitmq:3-management`), optional Redis `7` (`redis:7-alpine`)                                                     |
| **Testing & Quality** | Jest `30`, Node.js native test runner (`node --test`), React Testing Library `16.3.3`, Playwright `1.64.1` & `@axe-core/playwright` `4.14.0`, Oxlint `1.58.0`, ESLint `9`, Prettier `3` |

---

## Repository Structure

```text
food-ordering/
├── .github/workflows/ci.yml       # CI quality, security audit, container build, GHCR publish & staging deploy
├── backend/                       # NestJS 12 backend API subsystem
│   ├── src/
│   │   ├── common/                # Guards (RoomOwnershipGuard, InternalServiceGuard), filters, middleware
│   │   ├── database/              # TypeORM DataSources, 11 migrations, Neon/CI safety guards
│   │   ├── health/                # Liveness, readiness, and DB isolation diagnostics
│   │   ├── integrations/          # Typed mock & real HTTP adapters for FDS, KMS, WKMS, MAD
│   │   ├── messaging/             # RabbitMQ connection, topology, HMAC publisher & consumer
│   │   ├── modules/               # guest-sessions, menu, food-orders, service-requests, complaints
│   │   ├── realtime/              # SSE stream, polling fallback, and RabbitMQ realtime relay
│   │   └── redis/                 # Optional non-authoritative Redis cache with in-memory fallback
│   ├── test/                      # Backend Jest E2E & performance benchmark suites
│   ├── .env.example               # Backend environment template
│   ├── Dockerfile                 # Multi-stage Node 24 Alpine backend image
│   └── package.json
├── frontend/                      # Next.js 16 mobile-first guest SPA
│   ├── src/
│   │   ├── app/                   # Root SPA (/) and QR activation route (/activate)
│   │   ├── components/            # GuestShell, MobileBottomNav, feedback components, Dev toolbar
│   │   ├── features/              # auth, menu, cart, orders, services, complaints feature UIs
│   │   ├── lib/                   # API clients, data-mode provider factory, auth/cart/nav contexts, SSE/WS client
│   │   └── providers/             # AppProviders composition
│   ├── tests/                     # Node logic tests, Jest/RTL component tests, Playwright E2E specs
│   ├── .env.example               # Frontend environment template (defaults to NEXT_PUBLIC_DATA_MODE=api)
│   ├── Dockerfile                 # Multi-stage Node 24 Alpine standalone Next.js image
│   └── package.json
├── deploy/AUTOMATIC-STAGING.md    # Staging auto-deploy contract and guardrails
├── docs/                          # Architecture decision records (ADRs), contracts, change requests, UI references
├── documents/                     # QA evidence package (coverage, test register, OWASP, performance PDFs & notes)
├── docker-compose.yml             # Local container stack (backend, frontend, rabbitmq, profiles: local-db, redis)
└── README.md                      # This file
```

---

## Prerequisites

Install and verify the following tools before running FOSS locally:

| Tool               | Required Version                                              | Verification Command     |
| ------------------ | ------------------------------------------------------------- | ------------------------ |
| **Git**            | Any current version                                           | `git --version`          |
| **Node.js**        | `24.x` (CI and Dockerfiles use Node 24; tested on `v24.22.1`) | `node -v`                |
| **npm**            | `10+` (bundled with Node.js 24)                               | `npm -v`                 |
| **Docker**         | Docker Engine / Docker Desktop                                | `docker --version`       |
| **Docker Compose** | Compose v2 plugin (`docker compose`)                          | `docker compose version` |

---

## Running Locally — Overview

FOSS supports three local execution modes depending on your goal:

| Mode                                   | Frontend                     | Backend                                           | Local DB & Broker                               | Upstream Subsystems (FDS/KMS/WKMS/MAD)                                                   | Use Case                                                                                 |
| -------------------------------------- | ---------------------------- | ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **1. Live API Mode (Recommended)**     | `NEXT_PUBLIC_DATA_MODE=api`  | `DEMO_MODE=false`, `MOCK_EXTERNAL_SERVICES=false` | Local PostgreSQL 16 + RabbitMQ (Redis optional) | Real HTTP adapters (requires live upstream URLs/keys; fails closed with `503` if absent) | Real frontend-to-backend integration development                                         |
| **2. Backend Mock-Adapter Local Mode** | `NEXT_PUBLIC_DATA_MODE=api`  | `DEMO_MODE=false`, `MOCK_EXTERNAL_SERVICES=true`  | Local PostgreSQL 16 + RabbitMQ                  | Backend typed mock adapters simulate FDS/KMS/WKMS/MAD                                    | Testing real frontend → backend → DB/RabbitMQ without running the other 4 hotel services |
| **3. Frontend-Only Demo Mode**         | `NEXT_PUBLIC_DATA_MODE=demo` | Not required                                      | Not required                                    | In-memory `DemoStateStore` fixtures                                                      | UI evaluation and component/demo walkthroughs only                                       |

---

## Running the Complete Application Locally (Live API Mode — No Demo)

Follow this guide to run the actual Next.js frontend and NestJS backend locally with **no frontend demo fixtures (`NEXT_PUBLIC_DATA_MODE=api`)** and **no backend mocks (`DEMO_MODE=false`, `MOCK_EXTERNAL_SERVICES=false`)**, backed by local PostgreSQL and RabbitMQ.

> [!IMPORTANT]
> **Live API Mode vs. Full Integrated Live Mode:**
> Setting `NEXT_PUBLIC_DATA_MODE=api`, `DEMO_MODE=false`, and `MOCK_EXTERNAL_SERVICES=false` connects the real FOSS frontend to the real FOSS backend, PostgreSQL, and RabbitMQ with all mock providers disabled.
> However, FOSS is a subsystem of Forever Hotel: guest workflows that call **FDS** (QR issuance/stay verification), **KMS** (menu and food orders), **WKMS** (service request task dispatch), and **MAD** (complaint intake) **fail closed with `503 Service Unavailable`** unless those external hotel services are also running and configured. See [External Subsystem Integration](#external-subsystem-integration) for exact requirements.

### 1. Clone the repository

Clone the repository and stay on the primary integration branch (`develop`) for normal local development:

```bash
git clone https://github.com/forever-hotel/food-ordering.git
cd food-ordering
git switch develop
```

### 2. Install project dependencies

The backend and frontend are **separate Node.js applications** with independent `package.json` and `package-lock.json` lockfiles. Install each separately using `npm ci`:

```bash
# Terminal 1 (from repository root): install backend dependencies
cd backend
npm ci
```

```bash
# Terminal 2 (from repository root): install frontend dependencies
cd frontend
npm ci
```

### 3. Configure backend environment variables

Copy `backend/.env.example` to `backend/.env`:

**Windows PowerShell:**

```powershell
Copy-Item backend\.env.example backend\.env
```

**Linux / macOS Bash:**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` for **Live API Mode (no demo, no external mocks)** against local Docker services:

```env
NODE_ENV=development
PORT=4300
API_PREFIX=foss
FRONTEND_URL=http://localhost:3000

# Local PostgreSQL (matches docker-compose.yml postgres service)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/food_ordering

# RabbitMQ Event Broker
RABBITMQ_ENABLED=true
RABBITMQ_URL=amqp://localhost:5672

# Optional Redis Cache (disabled by default)
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
REDIS_TTL_SECONDS=300

# Disable demo and mock modes for real API operation
DEMO_MODE=false
MOCK_EXTERNAL_SERVICES=false
ENABLE_ORDER_DEMO_SIMULATION=false

# Local development cryptographic secrets (replace before any shared/staging use; min 32 chars)
QR_SIGNING_SECRET=local-dev-qr-signing-secret-replace-min-32-chars
SESSION_TTL_HOURS=24
INTERNAL_SERVICE_KEY=local-dev-internal-service-key-replace-32-chars
FDS_WEBHOOK_SECRET=local-dev-fds-webhook-secret-replace-min-32-chars

# Upstream hotel subsystems (required for FDS/KMS/WKMS/MAD workflows when MOCK_EXTERNAL_SERVICES=false)
FDS_BOOKING_SERVICE_URL=http://localhost:4100
FDS_BOOKING_SERVICE_API_KEY=local-dev-fds-api-key-replace-me
KMS_SERVICE_URL=http://localhost:4400
KMS_SERVICE_API_KEY=local-dev-kms-api-key-at-least-32-characters-long
WKMS_SERVICE_URL=http://localhost:4500
WKMS_SERVICE_API_KEY=local-dev-wkms-api-key-replace-me
MAD_SERVICE_URL=http://localhost:4600
MAD_SERVICE_API_KEY=local-dev-mad-api-key-replace-me
```

> [!WARNING]
>
> - Keep `backend/.env` untracked (it is ignored by `.gitignore`) and **never commit real secrets or production credentials**.
> - `KMS_SERVICE_API_KEY` must be **at least 32 characters** (`RealKmsAdapter.assertConfigured()` rejects shorter keys with `503`).
> - Do **not** point `DATABASE_URL` to a shared staging or production Neon database during local development.

### 4. Configure frontend environment variables

Copy `frontend/.env.example` to `frontend/.env.local`:

**Windows PowerShell:**

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

**Linux / macOS Bash:**

```bash
cp frontend/.env.example frontend/.env.local
```

Verify `frontend/.env.local` contains:

```env
PORT=3000

# Direct local NestJS backend URL (no /foss suffix needed; backend ingress middleware handles both /menu and /foss/menu)
NEXT_PUBLIC_API_URL=http://localhost:4300

# Live API mode: sends real HTTP requests to the NestJS backend instead of using DemoStateStore fixtures
NEXT_PUBLIC_DATA_MODE=api

# Local development environment tier
NEXT_PUBLIC_DEPLOYMENT_ENV=development

# Keep order demo simulation disabled
NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION=false
```

- **How `NEXT_PUBLIC_API_URL` works:** The frontend API providers (`frontend/src/lib/data-mode/api/*.ts`) call `${NEXT_PUBLIC_API_URL}/guest-sessions/qr`, `/menu`, `/food-orders`, `/service-requests`, `/complaints`, and `/realtime/events/stream`. Because the backend registers `createIngressPrefixMiddleware()`, `http://localhost:4300` (unprefixed) and `http://localhost:4300/foss` or `http://localhost:8080/foss` (API Gateway prefixed) both route cleanly.
- **`NEXT_PUBLIC_DATA_MODE=api` vs. `demo`:** In `api` mode, every action executes real `fetch()` requests with `credentials: 'include'` (`HttpOnly` `foss_session` cookie) against the NestJS backend, and the in-memory demo fixtures (`DemoStateStore`) and demo shortcut chips are disabled.

### 5. Start PostgreSQL locally

From the repository root, start the local PostgreSQL 16 container defined under the `local-db` profile in `docker-compose.yml`:

```bash
docker compose --profile local-db up -d postgres
```

Local container details (from `docker-compose.yml`):

| Setting                 | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| **Container Name**      | `foss-postgres` (`postgres:16`)                                           |
| **Host / Port**         | `127.0.0.1:5432`                                                          |
| **Database Name**       | `food_ordering`                                                           |
| **Username / Password** | `postgres` / `postgres` (development-only placeholder credentials)        |
| **Connection String**   | `postgresql://postgres:postgres@localhost:5432/food_ordering`             |
| **Persistence**         | Named Docker volume `postgres_data` mounted at `/var/lib/postgresql/data` |

### 6. Start RabbitMQ locally

Start the RabbitMQ broker independently from the repository root:

```bash
docker compose up -d rabbitmq
```

- **Container Name:** `foss-rabbitmq` (`rabbitmq:3-management`)
- **AMQP Port:** `127.0.0.1:5672` (`RABBITMQ_URL=amqp://localhost:5672`)
- **Management UI:** `http://localhost:15672` (default `rabbitmq:3-management` guest credentials `guest` / `guest` for local container evaluation)
- **Persistence:** Named Docker volume `rabbitmq_data` mounted at `/var/lib/rabbitmq`
- **Role in FOSS:** Required when `RABBITMQ_ENABLED=true` to assert the `forever.events` topic exchange, `foss.incoming.events` queue, `forever.events.dlx` / `foss.events.dlq` dead-letter topology, and `hotel.realtime` relay exchange, and to publish/consume signed cross-subsystem events (`kms.order.*`, `wkms.task.*`, `mad.complaint.*`, `fds.guest.*`). If RabbitMQ is unavailable at startup, the backend logs a warning and retries with exponential backoff, while `/health/ready` reports `messaging.status: "down"`.

### 7. Optional Redis setup

Redis is **optional** and **disabled by default** (`REDIS_ENABLED=false` in `backend/.env`). When disabled, `RedisService` uses an in-memory TTL fallback map automatically.

To run Redis locally with Docker Compose, start the `redis` profile and enable it in `backend/.env`:

```bash
docker compose --profile redis up -d redis
```

Then set in `backend/.env`:

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
REDIS_TTL_SECONDS=300
```

### 8. Database migrations & safety guards

TypeORM `synchronize` and `migrationsRun` are strictly `false` in all configurations (`backend/src/database/database.module.ts`, `data-source.ts`, `data-source.ci.ts`).

> [!CAUTION]
> **Important Behavior of `npm run migration:run` vs. Local Docker PostgreSQL:**
> Inspecting `backend/src/database/data-source.ts` and `backend/src/database/guards/assert-approved-database-identity.ts` shows that `npm run migration:run` enforces a **fail-closed Neon database identity guard** before running TypeORM migrations:
>
> - It requires `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, and `APPROVED_NEON_TEST_ENDPOINT_ID` to be set, **and** queries PostgreSQL `pg_settings` for `neon.project_id`, `neon.branch_id`, and `neon.endpoint_id`.
> - Standard local Docker `postgres:16` containers do **not** define Neon `pg_settings` parameters, so `npm run migration:run` will block with `MIGRATION SAFETY GATE BLOCKED: Neon branch identity verification failed` against a local Docker PostgreSQL container.
> - Conversely, `npm run migration:run:ci` (`backend/src/database/data-source.ci.ts`) enforces `assertCiDisposableDatabase()`, which requires `localhost`/`127.0.0.1`/`::1`, rejects Neon servers, and requires a database name ending in `_test` (e.g., `foss_test` or `food_ordering_test`; `food_ordering` itself is explicitly rejected by `assertCiDisposableDatabase()`).

**How to run migrations safely:**

1. **Confirm your target database** before running any migration command (`echo $env:DATABASE_URL` in PowerShell or `echo "$DATABASE_URL"` in Bash). Never run migrations against a shared Neon parent dev or production database.
2. **Option A — Against a local disposable `_test` database (for local Docker PostgreSQL):**
   Create a `_test` database (such as `foss_test`) inside `foss-postgres`, verify the target, inspect status, and run CI migrations against it:

   ```bash
   docker exec -it foss-postgres psql -U postgres -c "CREATE DATABASE foss_test;"
   ```

   **Windows PowerShell:**

   ```powershell
   cd backend
   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/foss_test"
   npm run verify:db:ci
   npm run migration:run:ci
   ```

   **Linux / macOS Bash:**

   ```bash
   cd backend
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/foss_test" npm run verify:db:ci
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/foss_test" npm run migration:run:ci
   ```

   _(If you use `foss_test` as your local database, update `DATABASE_URL` in `backend/.env` to match `postgresql://postgres:postgres@localhost:5432/foss_test` so the NestJS runtime connects to the migrated schema.)_

3. **Option B — Against an approved dedicated Neon test branch:**
   Configure `DATABASE_URL` and matching `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, `APPROVED_NEON_TEST_ENDPOINT_ID`, and `PARENT_DEV_BRANCH_ID` in `backend/.env`, then inspect and apply migrations:

   ```bash
   cd backend
   npm run migration:show
   npm run migration:run
   ```

4. **Verify tables initialized:** Confirm the 11 migrations (`1789224971217-BaselineDatabase` through `1791900000009-AddToiletriesToServiceRequestCategory`) created `foss_sessions`, `foss_qr_activations`, `foss_service_requests`, `foss_complaints`, and `typeorm_migrations`.

### 9. Start the backend

Open a dedicated terminal and start the NestJS backend in watch mode:

```bash
cd backend
npm run start:dev
```

Confirm successful startup:

- NestJS listens on port `4300` (`http://localhost:4300`).
- Verify liveness: `GET http://localhost:4300/health/live` (or `/foss/health/live`) returns `200 OK` with `{ "status": "ok", ... }`.
- Verify readiness (PostgreSQL + RabbitMQ status): `GET http://localhost:4300/health/ready` (or `/foss/health/ready`) returns `200 OK` with `"database": { "status": "up", "type": "postgres" }` and `"messaging": { "status": "up", "connected": true }`.
- Verify Swagger OpenAPI UI: open `http://localhost:4300/api/docs` (or `http://localhost:4300/foss/api/docs`).

### 10. Start the frontend

Open a second terminal and start the Next.js development server:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

### 11. Verify frontend-backend connectivity

1. **Confirm API Mode in UI:** On `http://localhost:3000`, the **Quick demo access codes** link should **not** appear beneath the manual entry form (it only renders when `demoTokens` are populated in `demo` mode). If you open the collapsed `⚙️ Dev` toolbar in the top-right corner, it displays **`🌐 LIVE API`** rather than `🎨 MOCK DEMO`.
2. **Inspect Browser Network Tab:**
   - Open DevTools → **Network** (`Fetch/XHR`).
   - Submitting a QR token triggers a real `POST http://localhost:4300/guest-sessions/qr` request with header `x-foss-client: foss-web` and `credentials: include`.
   - With `MOCK_EXTERNAL_SERVICES=false` and no FDS server running on `FDS_BOOKING_SERVICE_URL`, attempting QR activation returns a real HTTP error from the NestJS backend (`401` for unknown token hash or `503 Service Unavailable` when FDS is unreachable), rather than silently succeeding with in-memory demo data.
   - Check backend terminal logs to see the incoming HTTP request and correlation ID logged by NestJS.

### 12. Test real guest operations

Use the table below to understand which workflows work locally with FOSS + PostgreSQL + RabbitMQ alone versus which require live upstream subsystems (or `MOCK_EXTERNAL_SERVICES=true` in development):

| Guest Workflow                             | Backend Endpoint(s)                                                                             | Upstream Dependency Required (`MOCK_EXTERNAL_SERVICES=false`)                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Issue QR activation slip (internal)** | `POST /guest-sessions/internal/qr/issue` (requires `x-internal-service-key`)                    | **FDS** (`POST /api/v1/bookings/:id/verify` — must return `CHECKED_IN` + matching `roomNumber` + valid `stayStart`/`stayEnd`)                                                                             |
| **2. Redeem QR & establish session**       | `POST /guest-sessions/qr` (sets `HttpOnly` `foss_session` cookie)                               | **FDS** (re-verifies stay before redeeming `foss_qr_activations` row)                                                                                                                                     |
| **3. Session check & renewal**             | `GET /guest-sessions/me`, `POST /guest-sessions/renew`, `POST /guest-sessions/logout`           | **FDS** (re-verifies stay window on session validation/renewal)                                                                                                                                           |
| **4. Menu & meal windows**                 | `GET /menu`, `GET /menu/windows`, `GET /menu/items/:id`                                         | **KMS** (`GET /api/v1/guest/menu` — returns `503` if KMS is unreachable)                                                                                                                                  |
| **5. Place, track, & cancel food order**   | `POST /food-orders`, `GET /food-orders`, `GET /food-orders/:id`, `POST /food-orders/:id/cancel` | **KMS** (`POST/GET/cancel` under `/api/v1/guest/orders` + RabbitMQ `kms.order.*` for status updates)                                                                                                      |
| **6. Service requests**                    | `POST /service-requests`, `GET /service-requests`, `GET /service-requests/:id`                  | **WKMS** (`POST /api/v1/tasks` — returns `503` if WKMS is unreachable; RabbitMQ `wkms.task.*` for updates)                                                                                                |
| **7. Complaints**                          | `POST /complaints`, `GET /complaints`, `GET /complaints/:id`                                    | **MAD** (`POST /api/v1/complaints` — if MAD is unreachable and `SHARED_DATABASE_MODE !== 'true'`, logs warning and persists locally in `foss_complaints`; `URGENT` severity is rejected in non-mock mode) |
| **8. Real-time updates**                   | `GET /realtime/events/stream` (SSE), `GET /realtime/events/poll`                                | **FOSS Backend + RabbitMQ** (SSE/poll work directly with FOSS backend; status changes arrive via RabbitMQ or internal webhooks)                                                                           |

> [!NOTE]
> If you want to test the full UI-to-PostgreSQL-to-RabbitMQ flow locally **without** running the separate FDS, KMS, WKMS, and MAD repositories, keep the frontend in `NEXT_PUBLIC_DATA_MODE=api` and set `MOCK_EXTERNAL_SERVICES=true` (with `DEMO_MODE=false`) in `backend/.env` during local development only. This exercises real HTTP, cookies, TypeORM, PostgreSQL, and RabbitMQ while using typed mock adapters for the 4 external subsystems.

---

## Running Frontend Demo Mode

Demo Mode runs the Next.js frontend completely standalone using deterministic in-memory fixtures (`DemoStateStore` in `frontend/src/lib/data-mode/demo/demo-state-store.ts`).

- **Backend required?** No.
- **PostgreSQL / RabbitMQ / Redis required?** No.
- **Data persistence:** In-memory only (resets on page reload or via the **Reset Demo** button in the `⚙️ Dev` toolbar). Nothing is sent to or persisted in PostgreSQL or external subsystems.

### Configuration (`frontend/.env.local`)

```env
PORT=3000
NEXT_PUBLIC_DATA_MODE=demo
NEXT_PUBLIC_DEPLOYMENT_ENV=development
NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION=false
```

### Start Demo Mode

```bash
cd frontend
npm ci
npm run dev
```

1. Open `http://localhost:3000`.
2. Click **Quick demo access codes** below the manual entry field (or enter a demo room code such as `101`, `102`, `103`, `204` or click the `⚙️ Dev` toolbar).
3. Browse the menu, add items to the cart with allergy notes, place simulated orders, test the 10-minute cancellation flow, submit simulated service requests, and file complaints.

> [!WARNING]
> Demo Mode is **strictly blocked** when `NEXT_PUBLIC_DEPLOYMENT_ENV` is `staging` or `production` (`next.config.ts` throws a build error and `getDataMode()` unconditionally returns `'api'`).

---

## Running FOSS with Docker Compose

`docker-compose.yml` defines five services: `backend`, `frontend`, `rabbitmq`, `postgres` (profile `local-db`), and `redis` (profile `redis`).

> [!NOTE]
> `docker-compose.local.yml` does **not** exist in the `develop` repository. Use `docker-compose.yml` with Compose profiles (`--profile local-db`, `--profile redis`).

### Container & Port Reference

| Service    | Container Name  | Host Port Mapping                              | Compose Profile | Volumes / Notes                                                                           |
| ---------- | --------------- | ---------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `frontend` | `foss-frontend` | `127.0.0.1:3000:3000`                          | Default         | Next.js standalone image; `NEXT_PUBLIC_*` vars are build-time `ARG`s                      |
| `backend`  | `foss-backend`  | `127.0.0.1:4300:4300`                          | Default         | NestJS API; reads `./backend/.env` (`required: false`) + Compose `environment:` overrides |
| `rabbitmq` | `foss-rabbitmq` | `127.0.0.1:5672:5672`, `127.0.0.1:15672:15672` | Default         | `rabbitmq_data:/var/lib/rabbitmq`                                                         |
| `postgres` | `foss-postgres` | `127.0.0.1:5432:5432`                          | `local-db`      | `postgres_data:/var/lib/postgresql/data`; DB `food_ordering`, user/pass `postgres`        |
| `redis`    | `foss-redis`    | `127.0.0.1:6379:6379`                          | `redis`         | `redis_data:/data`; `redis-server --appendonly yes --maxmemory 256mb`                     |

### Important `docker-compose.yml` Behavior to Know Before Running

1. **Default mock/demo overrides:** In `docker-compose.yml`, `backend` sets `MOCK_EXTERNAL_SERVICES=${MOCK_EXTERNAL_SERVICES:-true}` and `DEMO_MODE=${DEMO_MODE:-true}` when those shell/Compose variables are unset. Simply running `docker compose up` starts the backend in mock/demo mode.
2. **`backend` does not auto-migrate or `depends_on: postgres`:** Start `postgres` and apply migrations to a local `_test` DB (or point `DATABASE_URL` to your target DB) before relying on database-backed endpoints.
3. **Compose service-to-service URLs:** Inside the Compose network, `backend` must reach `postgres` at `postgres:5432` and `rabbitmq` at `rabbitmq:5672` (not `localhost`), because `localhost` inside `foss-backend` refers to the backend container itself.
4. **Frontend build args:** `frontend/Dockerfile` defaults `ARG NEXT_PUBLIC_DATA_MODE=api` and `ARG NEXT_PUBLIC_API_URL=http://localhost:4300`. Notice `docker-compose.yml` sets `NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL:-http://localhost:8080}`, which causes `FossRealtimeClient` to attempt Socket.IO tickets (`POST /guest-sessions/realtime-ticket`) before falling back to polling unless `NEXT_PUBLIC_GATEWAY_URL=` (empty) is passed at build time.

### A. Full Local API Mode with Docker Compose

1. Ensure `backend/.env` exists with `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/foss_test` (or `food_ordering`), `RABBITMQ_URL=amqp://rabbitmq:5672`, `DEMO_MODE=false`, `MOCK_EXTERNAL_SERVICES=false`, and your upstream URLs/keys.
2. Export Compose overrides so `docker-compose.yml` does not default `DEMO_MODE` and `MOCK_EXTERNAL_SERVICES` back to `true`, then start the stack:

**Windows PowerShell:**

```powershell
$env:NODE_ENV="development"
$env:DEMO_MODE="false"
$env:MOCK_EXTERNAL_SERVICES="false"
$env:NEXT_PUBLIC_API_URL="http://localhost:4300"
docker compose --profile local-db up -d --build
```

**Linux / macOS Bash:**

```bash
NODE_ENV=development \
DEMO_MODE=false \
MOCK_EXTERNAL_SERVICES=false \
NEXT_PUBLIC_API_URL=http://localhost:4300 \
docker compose --profile local-db up -d --build
```

### B. Optional Redis Mode with Docker Compose

Add `--profile redis` and set `REDIS_ENABLED=true` and `REDIS_URL=redis://redis:6379`:

**Windows PowerShell:**

```powershell
$env:REDIS_ENABLED="true"
$env:REDIS_URL="redis://redis:6379"
docker compose --profile local-db --profile redis up -d --build
```

**Linux / macOS Bash:**

```bash
REDIS_ENABLED=true REDIS_URL=redis://redis:6379 docker compose --profile local-db --profile redis up -d --build
```

### Common Docker Compose Operations

```bash
# Check container status and health checks
docker compose ps

# Follow logs (all services or a specific service)
docker compose logs -f
docker compose logs -f backend

# Restart a single service
docker compose restart backend

# Stop and remove containers (preserves named volumes)
docker compose --profile local-db --profile redis down
```

---

## Environment Variable Configuration

### Backend (`backend/.env` — template: [`backend/.env.example`](backend/.env.example))

| Variable                                                                                                             | Required        | Default / Example                                             | Purpose                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                           | Yes             | `development`                                                 | Runtime mode (`development`, `test`, `production`)                                                                                |
| `PORT`                                                                                                               | No              | `4300`                                                        | HTTP server port                                                                                                                  |
| `HOST`                                                                                                               | No              | `::` (`0.0.0.0` in Docker)                                    | Bind interface                                                                                                                    |
| `API_PREFIX`                                                                                                         | No              | `foss`                                                        | Leading path prefix stripped by ingress middleware                                                                                |
| `FRONTEND_URL`                                                                                                       | Yes             | `http://localhost:3000`                                       | Allowed CORS & CSRF origin                                                                                                        |
| `DATABASE_URL`                                                                                                       | Yes*            | `postgresql://postgres:postgres@localhost:5432/food_ordering` | TypeORM PostgreSQL connection URL (*or `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_NAME`/`DB_SSL`)                        |
| `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, `APPROVED_NEON_TEST_ENDPOINT_ID`, `PARENT_DEV_BRANCH_ID` | Neon migrations | Placeholders in `.env.example`                                | Server-side Neon allowlist enforced by `data-source.ts` and `HealthService`                                                       |
| `RABBITMQ_ENABLED`                                                                                                   | No              | `true`                                                        | Enables RabbitMQ AMQP connection, topology, publisher & consumer                                                                  |
| `RABBITMQ_URL`                                                                                                       | If enabled      | `amqp://localhost:5672`                                       | AMQP 0-9-1 broker URI                                                                                                             |
| `REDIS_ENABLED`                                                                                                      | No              | `false`                                                       | Enables optional Redis cache (`false` uses in-memory fallback)                                                                    |
| `REDIS_URL`                                                                                                          | If enabled      | `redis://localhost:6379`                                      | Redis connection URI                                                                                                              |
| `REDIS_TTL_SECONDS`                                                                                                  | No              | `300`                                                         | Default cache TTL in seconds                                                                                                      |
| `MOCK_EXTERNAL_SERVICES`                                                                                             | Yes             | `false` (live) / `true` (`.env.example`)                      | Enables mock FDS/KMS/WKMS/MAD adapters (forbidden in `production`)                                                                |
| `DEMO_MODE`                                                                                                          | Yes             | `false` (live) / `true` (`.env.example`)                      | Enables demo behavior & mock adapters (forbidden in `production`)                                                                 |
| `ENABLE_ORDER_DEMO_SIMULATION`                                                                                       | No              | `false`                                                       | Gates `POST /food-orders/:id/status` (requires dev/test + `DEMO_MODE=true`)                                                       |
| `QR_SIGNING_SECRET`                                                                                                  | Yes             | Min 32-char secret                                            | Signs dev/test QR tokens (legacy `.` tokens are disabled in `production`)                                                         |
| `SESSION_TTL_HOURS`                                                                                                  | No              | `24`                                                          | Session TTL setting                                                                                                               |
| `INTERNAL_SERVICE_KEY` / `FDS_WEBHOOK_SECRET`                                                                        | Yes             | Min 32-char secret                                            | Authenticates internal webhooks (`InternalServiceGuard`) and signs/verifies RabbitMQ envelopes                                    |
| `FDS_BOOKING_SERVICE_URL`, `FDS_BOOKING_SERVICE_API_KEY`                                                             | Live FDS        | —                                                             | Front Desk HTTP endpoint & Bearer token                                                                                           |
| `KMS_SERVICE_URL`, `KMS_SERVICE_API_KEY`                                                                             | Live KMS        | —                                                             | Kitchen Management HTTP endpoint & Bearer token (`>= 32` chars)                                                                   |
| `WKMS_SERVICE_URL`, `WKMS_SERVICE_API_KEY`                                                                           | Live WKMS       | —                                                             | Worker Management HTTP endpoint & `X-WKMS-API-Key`                                                                                |
| `MAD_SERVICE_URL`, `MAD_SERVICE_API_KEY`                                                                             | Live MAD        | —                                                             | Manager Dashboard HTTP endpoint & `X-MAD-API-Key`                                                                                 |
| `SHARED_DATABASE_MODE`                                                                                               | Optional        | unset (`false`)                                               | Enables shared-database repositories/adapters (`SharedFoodOrderRepository`, `SharedWkmsAdapter`) when coordinating on a shared DB |
| `SHARED_WEBSOCKET_URL`, `WEBSOCKET_RELAY_KEY`                                                                        | Optional        | —                                                             | Enables `POST /guest-sessions/realtime-ticket` relay integration                                                                  |

### Frontend (`frontend/.env.local` — template: [`frontend/.env.example`](frontend/.env.example))

| Variable                                   | Required     | Default / Example       | Purpose                                                                                                                            |
| ------------------------------------------ | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                     | No           | `3000`                  | Local Next.js server port                                                                                                          |
| `NEXT_PUBLIC_API_URL`                      | Yes          | `http://localhost:4300` | Base URL for backend HTTP/SSE requests (`http://localhost:8080/foss` when routed via API Gateway)                                  |
| `NEXT_PUBLIC_GATEWAY_URL`                  | Optional     | unset                   | When set, switches `FossRealtimeClient` from direct SSE to Socket.IO (`/realtime/socket.io`) via `/guest-sessions/realtime-ticket` |
| `NEXT_PUBLIC_DATA_MODE`                    | Yes          | `api`                   | `api` for live backend HTTP requests; `demo` for in-memory fixtures (blocked in staging/production)                                |
| `NEXT_PUBLIC_DEPLOYMENT_ENV`               | Yes          | `development`           | `development`, `preview`, `staging`, or `production`                                                                               |
| `NEXT_PUBLIC_ALLOW_DEMO_PREVIEW`           | Preview only | `false`                 | Required to allow `demo` mode in `preview` builds                                                                                  |
| `NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION` | No           | `false`                 | Enables dev-only order status simulation UI (blocked in staging/production)                                                        |

---

## External Subsystem Integration

When `MOCK_EXTERNAL_SERVICES=false` and `DEMO_MODE=false`, FOSS instantiates real HTTP adapters (`backend/src/integrations/internal-services/`) that **fail closed** if upstream URLs, required keys, or services are unavailable:

| Subsystem                   | Adapter                                    | Env Configuration                                        | Upstream Endpoints & Auth Used by FOSS                                                                                                                  | Responsibility                                                                                                                                             |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FDS** (Front Desk)        | `RealBookingAdapter`                       | `FDS_BOOKING_SERVICE_URL`, `FDS_BOOKING_SERVICE_API_KEY` | `GET /api/v1/bookings/:id`, `POST /api/v1/bookings/:id/verify` (`Authorization: Bearer`)                                                                | Authoritative check-in verification, room assignment, `stayStart`/`stayEnd` bounds; FDS also pushes checkout/reassignment webhooks or `fds.guest.*` events |
| **KMS** (Kitchen)           | `RealKmsAdapter`                           | `KMS_SERVICE_URL`, `KMS_SERVICE_API_KEY` (`>= 32` chars) | `GET /api/v1/guest/menu`, `POST /api/v1/guest/orders`, `GET /api/v1/guest/orders/:id`, `POST /api/v1/guest/orders/:id/cancel` (`Authorization: Bearer`) | Authoritative menu catalog, meal windows, order submission/cancellation; kitchen status transitions owned strictly by KMS (`kms.order.*`)                  |
| **WKMS** (Worker)           | `RealWkmsAdapter` (or `SharedWkmsAdapter`) | `WKMS_SERVICE_URL`, `WKMS_SERVICE_API_KEY`               | `POST /api/v1/tasks`, `GET /api/v1/tasks/:id`, `POST /api/v1/tasks/:id/cancel` (`X-WKMS-API-Key`)                                                       | Worker task dispatch for in-room service requests; task status updates owned by WKMS (`wkms.task.*` or internal webhook)                                   |
| **MAD** (Manager Dashboard) | `RealMadComplaintAdapter`                  | `MAD_SERVICE_URL`, `MAD_SERVICE_API_KEY`                 | `POST /api/v1/complaints`, `GET /api/v1/complaints/:id` (`X-MAD-API-Key`)                                                                               | Complaint escalation and managerial triage/resolution (`mad.complaint.*` or internal webhook)                                                              |

For contract specifications, see [`docs/contracts/upstream-contracts-spec.md`](docs/contracts/upstream-contracts-spec.md) and [`docs/contracts/fds-qr-activation-contract.md`](docs/contracts/fds-qr-activation-contract.md).

---

## API Documentation

When the backend is running (`npm run start:dev`), interactive Swagger/OpenAPI 3.0 documentation is available at:

- **Direct:** `http://localhost:4300/api/docs`
- **Prefixed (`API_PREFIX=foss`):** `http://localhost:4300/foss/api/docs`

Health and readiness probes:

- **Liveness:** `GET http://localhost:4300/health/live` (or `/foss/health/live`)
- **Readiness (PostgreSQL + RabbitMQ):** `GET http://localhost:4300/health/ready` (or `/foss/health/ready`)

See [`backend/README.md`](backend/README.md#api-endpoints) for the full controller-verified endpoint inventory.

---

## Testing and Code Quality

### Commands

```bash
# Backend verification (from backend/)
cd backend
npm run lint
npm run format:check
npm run test:cov -- --runInBand
npm run test:e2e
npm run build
```

```bash
# Frontend verification (from frontend/)
cd frontend
npm run lint
npm run format:check
npm run test:coverage
npm run build
```

Playwright browser E2E specs (`frontend/tests/e2e/*.spec.ts`) are isolated from `npm test` and CI:

```bash
cd frontend
npm run test:e2e:mock   # Runs Playwright against demo mode (host network required)
npm run test:e2e:api    # Runs Playwright with NEXT_PUBLIC_DATA_MODE=api
```

### Verified QA Evidence Snapshot (Historical Reference)

The most recent consolidated QA evidence package in [`documents/README.md`](documents/README.md) and [`documents/testing/coverage-notes.md`](documents/testing/coverage-notes.md) was executed on **9 November 2026** against commit `b4b19df` (`fix/issue-116-fds-stay-expiry`):

- **Backend Unit/Integration (Jest):** 67 suites, 670/670 passed — **88.36%** statements, **83.43%** branches, **79.54%** functions, **88.78%** lines.
- **Backend Critical Business Logic Core (13 modules):** **92.00%** branch coverage (955 of 1,038 critical branches).
- **Backend E2E (`backend/test/`):** 18 suites, 231 passed, 5 skipped.
- **Frontend Logic Tier (`node --test`):** 88 suites, 295 passed, 1 skipped — **93.19%** lines, **81.34%** branches.
- **Frontend Presentation Tier (Jest / RTL):** 10 suites, 141 passed — **91.65%** lines, **80.17%** branches.
- **Performance Benchmark ([`documents/testing/performance-report.pdf`](documents/testing/performance-report.pdf)):** 8 isolated local mock scenarios (1,490 HTTP requests, 0.00% error rate, p95 `70.5–484.3 ms`).

> [!NOTE]
> These metrics reflect the recorded **9 November 2026** (`b4b19df`) QA run and not an automated run of subsequent commits on `develop` (such as PRs #136–#139). Always run the commands above after code changes to verify current results.

---

## Database Safety

- `synchronize: false` and `migrationsRun: false` are enforced across all TypeORM configurations.
- `assertApprovedDatabaseIdentity()` (`backend/src/database/guards/assert-approved-database-identity.ts`) fails closed unless `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, and `APPROVED_NEON_TEST_ENDPOINT_ID` match PostgreSQL `pg_settings` and rejects `PARENT_DEV_BRANCH_ID`.
- `assertCiDisposableDatabase()` (`backend/src/database/guards/assert-ci-disposable-database.ts`) guarantees CI/disposable runs target only local loopback/Docker bridge `_test` databases with no Neon settings and no shared-subsystem tables (`bookings`, `rooms`, `staff_users`, `kms_food_orders`, `kms_menu_items`).
- `GET /health/internal/database-isolation` (protected by `InternalServiceGuard`) reports non-sensitive database isolation classification without printing credentials.

---

## CI/CD and Deployment

The GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on `workflow_dispatch`, `pull_request` (`develop`, `main`), and `push` (`develop`, `main`):

1. **`backend-quality`:** Provisions a disposable PostgreSQL 16 service (`foss_test`), runs `verify:db:ci`, `migration:run:ci`, `lint`, `format:check`, `test:cov -- --runInBand`, `test:e2e`, and `build`.
2. **`frontend-quality`:** Runs `test:coverage`, `lint`, `format:check`, and `build`.
3. **`security`:** Runs `npm audit --audit-level=high` (backend) and `npm audit --omit=dev --audit-level=high` (frontend).
4. **`container-build-verification`:** Builds both `backend/Dockerfile` and `frontend/Dockerfile`.
5. **`publish-images` (on `push` to `develop` only):** Verifies peer-reviewed PR approval on the final commit SHA, validates HTTPS `PUBLIC_API_ORIGIN` / `PUBLIC_SOCKET_ORIGIN` repository variables, compiles the frontend image with `NEXT_PUBLIC_DATA_MODE=api` and `NEXT_PUBLIC_ALLOW_DEMO_PREVIEW=false`, pushes immutable commit-tagged `linux/amd64` images to GHCR, and uploads `release-images.json`.
6. **`deploy-staging` (on `push` to `develop` when `vars.SERVICE_STAGING_ENABLED == 'true'`):** Deploys the published `release-images` artifact to the `staging` environment via the SHA-pinned shared `forever-hotel/infra/.github/actions/deploy-service` action and retains `foss-staging-receipt`.

As documented in [`deploy/AUTOMATIC-STAGING.md`](deploy/AUTOMATIC-STAGING.md):

- The staging action only updates FOSS containers; it does **not** apply SQL migrations or modify env files, Caddy, or broker topology.
- **Production deployment is not configured or automated by this workflow.**

---

## Security

Key security controls implemented in FOSS:

- **HttpOnly Cookie & Bearer Auth:** `POST /guest-sessions/qr` sets an `HttpOnly`, `SameSite` `foss_session` cookie and omits the raw `sessionToken` from the JSON response for public callers. Cookie-authenticated state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) enforce origin/referer CSRF validation (`GuestAuthGuard`).
- **Stay-Bound & Single-Use QR Credentials:** QR activation slips are 256-bit tokens stored strictly as SHA-256 hashes (`foss_qr_activations`), consumed atomically inside a TypeORM transaction, and bounded by FDS `stayStart`/`stayEnd`. Legacy signed QR tokens (containing `.`) are rejected in `NODE_ENV=production`.
- **Room & Booking Isolation (IDOR Protection):** `RoomOwnershipGuard` and service-layer filters scope orders, service requests, complaints, and realtime channels to the authenticated guest's `bookingId` and `roomNumber`.
- **Input Validation & Sanitization:** Global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`), strict DTO length/enum bounds, and plain-text sanitization before persistence.
- **Internal Service & Broker Authentication:** `InternalServiceGuard` uses SHA-256 `crypto.timingSafeEqual` on `x-internal-service-key` / `x-fds-signature`; RabbitMQ events use HMAC-signed envelopes verified against `INTERNAL_SERVICE_KEY`.

For detailed OWASP Top 10 analysis, see [`documents/security/owasp-notes.md`](documents/security/owasp-notes.md).

---

## Known Limitations

- **External Subsystems Required for Full End-to-End Live Flows:** With `MOCK_EXTERNAL_SERVICES=false`, FOSS fails closed (`503`) on FDS, KMS, WKMS, and MAD operations unless those external services are deployed and configured.
- **Local Docker Postgres vs. `npm run migration:run`:** `data-source.ts` requires Neon `pg_settings` allowlist values, so standard local Docker Postgres containers require `npm run migration:run:ci` against a `_test` database (such as `foss_test`) rather than `npm run migration:run`.
- **Automated Playwright E2E & WCAG Verification:** 5 Playwright/axe-core specs exist under `frontend/tests/e2e/`, but are not executed in mandatory CI and encounter `connect EACCES 127.0.0.1:3000` inside restricted Windows sandboxes; full WCAG 2.1 AA conformance is not claimed without host-network browser verification.
- **Transactional Outbox Not Implemented:** RabbitMQ publishes directly with publisher confirms and logs warnings when disconnected; a PostgreSQL transactional outbox remains unimplemented pending [`docs/change-requests/CR-outbox-foss.md`](docs/change-requests/CR-outbox-foss.md).
- **Production Deployment Unverified:** CI/CD covers `develop` image publication and conditional staging deployment only.

---

## Related Project Documentation

- [Backend Subsystem README](backend/README.md)
- [Frontend Subsystem README](frontend/README.md)
- [QA Evidence README](documents/README.md)
- [Database Schema Specification](docs/DATABASE_SCHEMA.md)
- [Automatic Staging Deployment Guide](deploy/AUTOMATIC-STAGING.md)
- [Upstream Contracts Specification](docs/contracts/upstream-contracts-spec.md)
- [FDS QR Activation Contract](docs/contracts/fds-qr-activation-contract.md)
- [ADR-002: Upstream Contracts & Service Boundaries](docs/adr/ADR-002-upstream-contracts-and-service-boundaries.md)
- [CR-outbox-foss](docs/change-requests/CR-outbox-foss.md) & [CR-redis-foss](docs/change-requests/CR-redis-foss.md)
