# FOSS Subsystem — Lead Developer Handover Guide

**Repository:** `forever-hotel/food-ordering`  
**Current Milestone:** CIT-05 Baseline (Post-CIT-04, Post-DDP-146)  
**Target Base Branch:** `develop` (`b78094c418e557f0053de275011673d9d5f3910d`)  
**Tracking Issues:** [#106](https://github.com/forever-hotel/food-ordering/issues/106) (CIT-05), [#108](https://github.com/forever-hotel/food-ordering/issues/108) (Cleanup & Handover)  
**Date:** 4 November 2026  

---

## 1. Project Status Summary

The Forever Hotel Food Ordering System (FOSS) is **stable, demonstrable, and regression-tested** across all core guest-facing milestones:

* **CIT-01 (DDP-121–127):** Core data architecture, TypeORM schema, FDS booking/room verification, KMS menu ingestion, and WKMS/MAD integration boundaries.
* **CIT-02 (DDP-128–134):** Neon PostgreSQL database branching, database isolation guards (`HealthService`), and cross-domain foreign key elimination.
* **CIT-03 (DDP-135–144):** Full guest UI fidelity (Figures 31–39), QR activation flow, meal period scheduling, cart portion caps (1–20), 300-char allergy notes, and 10-minute order cancellation.
* **CIT-04 (DDP-158–163):** Shared RabbitMQ messaging topology (`forever.hotel.events`), dead-letter exchange, fetch-based authenticated SSE realtime, and optional Redis caching layer. Merged in PR [#105](https://github.com/forever-hotel/food-ordering/pull/105).
* **CIT-05 (DDP-146–149, DDP-165):** Backend API test register (36 endpoints), critical business-logic coverage hardening, and frontend Playwright E2E scaffolding. Merged in PR [#107](https://github.com/forever-hotel/food-ordering/pull/107).

---

## 2. System Architecture & Component Responsibilities

### Backend Subsystem (`backend/`)
* **Framework:** NestJS 12.0.1 on Express with TypeORM 1.1.1.
* **Listening Port:** `4300` (configurable via `PORT`).
* **Route Prefix:** Default `/${API_PREFIX}` = `/foss` matching API Gateway rewrites.
* **Controllers & Endpoints:** 9 controllers exposing 36 REST endpoints.
* **Database Isolation:** [`HealthService.evaluateDatabaseIsolation()`](backend/src/health/health.service.ts) verifies PostgreSQL `pg_settings` against an allowlist of Neon branch IDs (`APPROVED_NEON_PROJECT_ID`, `APPROVED_NEON_TEST_BRANCH_ID`, `APPROVED_NEON_TEST_ENDPOINT_ID`). It fails closed if tests target the shared development branch (`PARENT_DEV_BRANCH_ID`) or production.

### Frontend Subsystem (`frontend/`)
* **Framework:** Next.js 16.4.1 (Webpack runtime), React 19.2.8, Ant Design 6.6.5, Tailwind CSS 4.
* **Port:** `3000`.
* **Architecture:** Mobile-first SPA. Unauthenticated guests view Figure 31 Scan Card; authenticated guests access 4 primary tabs (`menu`, `orders`, `services`, `complaints`).
* **Dual-Mode Provider Architecture:** Centralized in [`src/lib/data-mode/`](frontend/src/lib/data-mode/):
  * `DATA_MODE=demo`: Deterministic, in-memory simulated stay store (`DemoStateStore`) with one-tap access codes for Rooms 101, 102, 103, and 204.
  * `DATA_MODE=api`: Real HTTP REST + SSE calls to the NestJS backend.

### Asynchronous Messaging & Realtime
* **RabbitMQ:** Shared exchange `forever.hotel.events`. Dead-Letter Queue (DLQ) topology (`forever.hotel.dlq`) and poisoned message isolation are implemented. Consumers listen on durable queues:
  * `kms.order.status_changed` -> updates food order status in FOSS.
  * `wkms.task.status_changed` -> updates service request status in FOSS.
  * `mad.complaint.status_changed` -> updates complaint status in FOSS.
* **Server-Sent Events (SSE):** `GET /foss/realtime/stream` authenticated via `Authorization: Bearer <token>` header. Strictly room-scoped; disconnects upon checkout revocation. Short-polling fallback (`GET /foss/realtime/poll`) is supported.
* **Optional Redis Cache:** Transparent, non-authoritative cache layer, disabled by default (`REDIS_ENABLED=false`).
* **Transactional Outbox:** The PostgreSQL transactional outbox is NOT implemented and remains subject to architectural approval (`CR-outbox-foss.md`).

---

## 3. Developer Quick Start

### Prerequisites
* Node.js v24.x and npm v10+.
* Docker Desktop (optional, for local PostgreSQL and RabbitMQ).

### Environment Configuration
1. **Backend:** Copy `backend/.env.example` to `backend/.env`.
   * For local Docker testing: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/food_ordering`.
   * Keep `MOCK_EXTERNAL_SERVICES=true` and `DEMO_MODE=true` for local development.
2. **Frontend:** Copy `frontend/.env.example` to `frontend/.env.local`.
   * For evaluator demo: `NEXT_PUBLIC_DATA_MODE=demo` and `NEXT_PUBLIC_DEPLOYMENT_ENV=development`.

### Running the Services
```bash
# Terminal 1: Backend
cd backend
npm install
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## 4. Verified Test Evidence Baseline

All quality gates pass 100% cleanly on the latest base commit:

| Verification Gate | Command | Measured Outcome |
|---|---|---|
| **Backend Unit Tests** | `npm --prefix backend run test:cov -- --runInBand` | **557/557 tests passed, 63 suites, 0 failed** (55.0s) |
| **Backend Statement Coverage** | `npm --prefix backend run test:cov` | **84.92% Global / 96.10% Critical Logic** |
| **Backend Branch Coverage** | `npm --prefix backend run test:cov` | **78.68% Global / 84.21% Critical Logic** |
| **Backend Linter** | `npm --prefix backend run lint` | **0 errors, 0 warnings** (Oxlint, 240 files) |
| **Backend Formatter** | `npm --prefix backend run format:check` | **100% Prettier compliant** |
| **Backend Build** | `npm --prefix backend run build` | **`nest build` exit code 0** |
| **Frontend Unit Tests** | `npm --prefix frontend test` | **270 tests, 81 suites** (269 passed, 0 failed, 1 skipped) |
| **Frontend Linter** | `npm --prefix frontend run lint` | **0 errors, 0 warnings** (ESLint 9) |
| **Frontend Formatter** | `npm --prefix frontend run format:check` | **100% Prettier compliant** |
| **Frontend Build** | `npm --prefix frontend run build -- --webpack` | **Next.js compiled in 12.0s** (`/`, `/_not-found`, `/activate`) |
| **GitHub Actions CI** | Push to `develop` | **Run #41833172660: All 4 jobs passed** |

---

## 5. Known Limitations & Acceptance Gaps

1. **Critical Branch Coverage Target (DDP-146):**
   * Critical logic branch coverage is **84.21%**, below the 90% stretch target.
2. **Automated Playwright E2E Browser Tests (DDP-147):**
   * 5 test specifications are scaffolded in `frontend/tests/e2e/`. Running them inside Windows sandboxes encounters loopback socket isolation (`connect EACCES 127.0.0.1:3000`). Run on host network with `npm run test:e2e:mock`.
3. **WCAG Accessibility Audit (DDP-147):**
   * Axe-core WCAG 2.1 AA rules and responsive viewports (320px, 375px, 390px, 768px) are authored. Automated headless execution is pending; full WCAG conformance is not claimed.
4. **Live Upstream Subsystem Integration (DDP-165):**
   * Physical staging integration with FDS, KMS, WKMS, and MAD is deferred. All communication is verified using typed mock adapters.
5. **Security & Performance (DDP-148, DDP-149):**
   * Formal OWASP penetration audits, rate-limiting audits, and k6/Artillery stress tests remain open.
6. **Architectural Change Requests (CRs):**
   * `CR-outbox-foss.md` (PostgreSQL Transactional Outbox — not implemented) and `CR-redis-foss.md` (Redis cache) remain **Proposed** pending organization-wide review.

---

## 6. Lead Developer Handover Checklist

- [ ] **Infrastructure Setup:** Review `docker-compose.yml` and local infrastructure scripts.
- [ ] **Production Neon Secrets:** When deploying to production, configure production Neon credentials via secure secret store. Omit `APPROVED_NEON_TEST_*` variables.
- [ ] **RabbitMQ Topology:** Ensure RabbitMQ credentials in production match the shared broker. DLQ routing is pre-configured.
- [ ] **Database Migrations:** Never set `synchronize: true`. Review migrations in `backend/src/database/migrations/` before deploying.
- [ ] **Dual-Mode Safety:** Ensure `NEXT_PUBLIC_DEPLOYMENT_ENV=production` is set in production frontend builds to lock down Mock Demo Mode.
- [ ] **Cross-Service Contracts:** Coordinate with FDS, KMS, WKMS, and MAD teams when transitioning from mock adapters to real HTTP endpoints.

