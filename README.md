# Forever Hotel Food Ordering System (FOSS)

[![FOSS CI](https://github.com/forever-hotel/food-ordering/actions/workflows/ci.yml/badge.svg)](https://github.com/forever-hotel/food-ordering/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: UNLICENSED](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)

The **Forever Hotel Food Ordering System (FOSS)** is the guest-facing digital dining and in-room services subsystem of the Forever Hotel Management System. It delivers an authenticated mobile web application for in-stay dining, room service requests, and management feedback with real-time order tracking and strict guest stay isolation.

---

## 1. Project Overview & Implemented Features

FOSS provides a complete end-to-end guest journey adhering to approved Final Design Report specifications (Figures 31–39):

- **Guest Session Activation & Security (Figure 31):** Cryptographic QR code redemption (`/activate`), single-use token consumption, timing-safe SHA-256 session tokens, 24-hour TTL, and strict room/stay data isolation.
- **Menu Browsing & Meal Windows (Figure 32):** Real-time meal period scheduling synchronized with Colombo time (Asia/Colombo) for Breakfast, Lunch, Dinner, and High Tea. Live service countdowns, dietary flags, and allergen badges.
- **Cart Operations & Kitchen Notes (Figure 34):** Dynamic portion limits (1–20), 300-character allergy note bounds, and subtotal/total calculations with zero unapproved surcharges.
- **Order Placement & Status Tracking (Figure 35):** Idempotent food order submission, double-tap prevention, automated kitchen dispatch, 25–35 minute ETA range, and a 10-minute order cancellation countdown window.
- **In-Room Service Requests (Figure 38):** 6 canonical service categories (Towels, Toiletries, Cleaning, Maintenance, Laundry Pickup, Other), Worker Management Subsystem (WKMS) event reconciliation, and active request tracking.
- **Guest Complaints & Feedback (Figure 39):** Manager Dashboard (MAD) escalation, severity grading (Low, Medium, High, Urgent), and unique `CMP-...` reference code tracking.
- **Asynchronous Messaging:** RabbitMQ event publishing and consumption (`kms.order.status_changed`, `wkms.task.status_changed`, `mad.complaint.status_changed`) with Dead-Letter Queues (DLQ) and poisoned message isolation.
- **Real-time Updates:** Fetch-based Server-Sent Events (SSE) with authenticated Bearer tokens and resilient short-polling fallback.
- **Optional Redis Cache:** Transparent, non-authoritative caching layer with graceful degradation when Redis is unavailable (`REDIS_ENABLED=false`).
- **Dual-Mode Operation:** Built-in seamless switching between deterministic **Mock Demo Mode** (for grading and standalone evaluation) and **Live API Mode** (for gateway integration).

---

## 2. High-Level Architecture

```
                    ┌────────────────────────────────────────┐
                    │      Forever Hotel API Gateway         │
                    │         (:8080/foss/*)                 │
                    └──────────────────┬─────────────────────┘
                                       │ (Client traffic)
                    ┌──────────────────▼─────────────────────┐
                    │       Next.js 16 Mobile SPA            │
                    │   React 19 · Ant Design · Tailwind 4   │
                    │              (:3000)                   │
                    └──────────────────┬─────────────────────┘
                                       │ (REST + SSE)
                    ┌──────────────────▼─────────────────────┐
                    │         NestJS 12 Backend API          │
                    │   TypeORM · Express · OpenAPI Swagger  │
                    │         (:4300 / API_PREFIX)           │
                    └──────┬─────────────┬─────────────┬─────┘
                           │             │             │
        ┌──────────────────▼──┐   ┌──────▼──────┐   ┌──▼────────────────┐
        │  PostgreSQL / Neon  │   │  RabbitMQ   │   │  Optional Redis   │
        │  Database (Cloud/   │   │  3.13 AMQP  │   │  Cache Layer      │
        │  Local Container)   │   │  Broker     │   │  (REDIS_ENABLED)  │
        └─────────────────────┘   └─────────────┘   └───────────────────┘
```

### Upstream Service Integrations (Simulated via Typed Adapters)

- **Front Desk Subsystem (FDS):** Authoritative room assignment, guest check-in verification, and checkout session revocation.
- **Kitchen Management Subsystem (KMS):** Authoritative menu item catalog and kitchen preparation state transitions.
- **Worker Management Subsystem (WKMS):** Room service dispatch, worker assignment, and completion events.
- **Manager Dashboard (MAD):** Complaint escalation, resolution notes, and manager notifications.

---

## 3. Technology Stack

- **Frontend:** Next.js 16.4.1 (Webpack runtime), React 19.2.8, Ant Design 6.6.5, Tailwind CSS 4, `@playwright/test`, `@axe-core/playwright`.
- **Backend:** NestJS 12.0.1, Express, TypeORM 1.1.1, PostgreSQL driver `pg` 8.23.0, `amqplib` 2.2.1, `ioredis` 5.11.1, `class-validator`, `class-transformer`.
- **Testing:** Jest 30 (with experimental VM modules for ESM), Node.js native test runner (`node:test`), Playwright test scaffolding.
- **Code Quality:** Oxlint (backend linter), ESLint 9 (frontend), Prettier 3.

---

## 4. Local Prerequisites

- **Node.js:** v24.x or later (tested on Node v24.22.1).
- **Package Manager:** `npm` (v10+).
- **Docker & Docker Compose:** Required only if running local PostgreSQL, RabbitMQ, or Redis containers.

---

## 5. Environment Configuration

### Backend Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```env
NODE_ENV=development
PORT=4300
HOST=127.0.0.1
API_PREFIX=foss
FRONTEND_URL=http://localhost:3000

# Database (TypeORM)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/food_ordering

# Server-Side Neon Isolation Guard (Required only when using Neon Cloud)
# APPROVED_NEON_PROJECT_ID=project-id-placeholder
# APPROVED_NEON_TEST_BRANCH_ID=br-test-branch-placeholder
# APPROVED_NEON_TEST_ENDPOINT_ID=ep-test-endpoint-placeholder
# PARENT_DEV_BRANCH_ID=br-parent-dev-branch-placeholder

# RabbitMQ Event Broker
RABBITMQ_ENABLED=true
RABBITMQ_URL=amqp://localhost:5672

# Optional Redis Cache (disabled by default)
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379

# Service Integration Controls
MOCK_EXTERNAL_SERVICES=true
DEMO_MODE=true

# Cryptographic QR & Session Signing Secret
QR_SIGNING_SECRET=development-demo-qr-signing-secret-at-least-32-chars-long
SESSION_TTL_HOURS=24
INTERNAL_SERVICE_KEY=development-internal-service-key-at-least-32-chars
FDS_WEBHOOK_SECRET=development-fds-webhook-secret-at-least-32-chars
```

### Frontend Configuration (`frontend/.env.local`)

Copy `frontend/.env.example` to `frontend/.env.local`:

```env
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:4300
NEXT_PUBLIC_DATA_MODE=demo
NEXT_PUBLIC_DEPLOYMENT_ENV=development
```

> [!IMPORTANT]
> If `NEXT_PUBLIC_DEPLOYMENT_ENV=production` is set in `frontend/.env.local`, Demo Mode is **strictly locked down** for security. Keep it set to `development` for local grading and demonstration.

---

## 6. Quick Start & Execution Modes

### Mode A: Deterministic Mock Demo (Standalone Evaluation)

Demo mode runs purely on pre-configured, realistic fixtures with no external database or message broker required:

```bash
# Terminal 1: Start Frontend
cd frontend
npm install
npm run dev
```

1. Navigate to `http://localhost:3000`.
2. Click **Quick demo access codes** on the landing screen.
3. Select **Room 101 (John Doe)** to log in immediately.
4. Browse menu, add dishes to cart, enter allergy notes, and place an order.
5. Watch order progression, cancel an order within 10 minutes, request towels, or submit a complaint.

---

### Mode B: Full Local Stack (Backend + Local Infrastructure)

```bash
# 1. Start Local Supporting Services (PostgreSQL + RabbitMQ)
docker compose -f docker-compose.local.yml up -d

# 2. Run Database Migrations
cd backend
npm install
npm run migration:run

# 3. Start Backend API
npm run start:dev

# 4. In a separate terminal, start Frontend
cd ../frontend
npm install
npm run dev
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:4300/foss](http://localhost:4300/foss)
- **Swagger OpenAPI Docs:** [http://localhost:4300/foss/api-docs](http://localhost:4300/foss/api-docs)
- **RabbitMQ Management UI:** [http://localhost:15672](http://localhost:15672) (User: `foreverhotel_dev`)

---

## 7. Testing & Quality Verification

Run each application's verification independently from its directory:

```bash
# Backend Quality Verification
cd backend
npm run lint                  # Oxlint (240 files, 0 errors, 0 warnings)
npm run format:check          # Prettier style check
npm run test:cov -- --runInBand # 557 tests, 63 suites, branch & statement coverage
npm run build                 # NestJS production build

# Frontend Quality Verification
cd frontend
npm run lint                  # ESLint (0 errors, 0 warnings)
npm run format:check          # Prettier style check
npm test                      # 270 tests, 81 suites (Node test runner)
npm run build -- --webpack    # Next.js production build

# Playwright E2E Verification (Host / Non-Sandboxed environments only)
npm run test:e2e:mock         # Executes Playwright E2E against mock server
```

---

## 8. Database Safety & Neon Branching

When connecting to Neon PostgreSQL, the backend's [`HealthService`](backend/src/health/health.service.ts) queries `pg_settings` for `neon.project_id`, `neon.branch_id`, and `neon.endpoint_id`:

- **Rejects Shared Parent Dev:** If connected to `PARENT_DEV_BRANCH_ID`, write-capable test migrations are blocked.
- **Enforces Allowlist:** Requires `APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, and `APPROVED_NEON_TEST_ENDPOINT_ID` to match exactly.
- **Fails Closed:** Any unconfigured or mismatched cloud database connection is classified as untrusted.

---

## 9. Known Limitations & Acceptance Status

- **Automated Playwright Execution:** E2E browser tests are scaffolded in `frontend/tests/e2e/`. Automated execution remains unverified due to Windows sandbox loopback TCP restrictions (`connect EACCES 127.0.0.1:3000`).
- **WCAG Accessibility Conformance:** Axe-core WCAG 2.1 AA rules and responsive viewports (320px, 375px, 390px, 768px) are authored in `frontend/tests/e2e/accessibility-wcag-axe.spec.ts`. Full WCAG conformance is not claimed until automated browser testing is verified.
- **Live Upstream Systems:** Direct integration with live FDS, KMS, WKMS, and MAD staging servers is deferred. All flows are verified against typed mock adapters.
- **Critical Branch Coverage Target:** Critical branch coverage stands at **84.21%** against the 90% stretch target (statement coverage is at **96.10%**).
- **Redis & Transactional Outbox:** Redis is optional and disabled by default (`REDIS_ENABLED=false`). The PostgreSQL transactional outbox is NOT implemented and remains subject to architectural change request approval (`CR-outbox-foss.md`).

---

## 10. Issue & Branch Tracking

- **Current Ticket:** Issue [#108](https://github.com/forever-hotel/food-ordering/issues/108) (`chore: Safe repository cleanup`)
- **Active Branch:** `chore/108-final-cleanup-handover`
- **Base Branch:** `develop` (`b78094c418e557f0053de275011673d9d5f3910d`)
- **Previous Merged PRs:**
  - CIT-04: PR [#105](https://github.com/forever-hotel/food-ordering/pull/105) (RabbitMQ, SSE & Redis)
  - CIT-05: PR [#107](https://github.com/forever-hotel/food-ordering/pull/107) (Backend Testing & E2E Scaffolding)
