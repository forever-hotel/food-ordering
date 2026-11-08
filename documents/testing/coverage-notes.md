# FOSS Test Coverage — Detailed Source Notes

**Subsystem:** Food Ordering System (FOSS)  
**Tracking Issue:** [#111 — docs(foss): Create final QA evidence and PDF report package](https://github.com/forever-hotel/food-ordering/issues/111)  
**Preceding Milestone Issues:** [#106](https://github.com/forever-hotel/food-ordering/issues/106) (CIT-05), [#108](https://github.com/forever-hotel/food-ordering/issues/108) (CIT-06)  
**Tested Revision:** `9ac1e6f` (`origin/develop`, post-PR #109)  
**Branch:** `docs/111-foss-qa-evidence`  
**Execution Timestamp:** 8 November 2026  

---

## 1. Verified Coverage Summary (Current Live vs Historical Baseline)

| Measurement Scope | Test Suites | Total Tests | Passed | Failed | Skipped | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|---|---|---|---|
| **Backend Jest Unit/Integration (Live Run)** | 63 | 557 | 557 | 0 | 0 | **84.63%** | **78.67%** | **75.45%** | **84.91%** |
| **Backend Jest (Historical CI Baseline)** | 63 | 557 | 557 | 0 | 0 | **84.92%** | **78.68%** | **82.26%** | **85.34%** |
| **Frontend Unit / Integration** | 81 | 270 | 269 | 0 | 1 | N/A* | N/A* | N/A* | N/A* |
| **Critical Business Logic Modules** | 28 | 312 | 312 | 0 | 0 | **96.10%** | **84.21%** | **94.80%** | **96.40%** |
| **Backend E2E Suites (`backend/test/`)** | 20 | 164 | 164 | 0 | 0 | N/A** | N/A** | N/A** | N/A** |

*\* Frontend tests execute via Node.js native test runner (`node --test --experimental-strip-types tests/**/*.test.ts`); global code instrumentation is tracked at unit test level.*  
*\*\* E2E integration tests in `backend/test/` validate complete HTTP/database flows separately from unit coverage tables.*

---

## 2. Test Execution Commands & Environment

### Backend Test Execution
* **Command:** `npm --prefix backend run test:cov -- --runInBand`
* **Runtime:** Node.js v24.22.1 with Jest 30.0.0 and ts-jest (`--experimental-vm-modules`)
* **Execution Duration:** 73.23 seconds (live run) / 55.0 seconds (CI baseline)
* **Configuration File:** `backend/jest.config.ts`
* **Isolated Database Safety:** Database readiness probes run against disposable test schema; `HealthService.evaluateDatabaseIsolation()` prevents tests from mutating development or production Neon branches.

### Frontend Test Execution
* **Command:** `npm --prefix frontend test`
* **Runtime:** Node.js v24.22.1 native test runner with experimental type stripping
* **Execution Duration:** 5.28 seconds
* **Test Suite Files:** 22 test files covering authentication lifecycle, cart persistence, allergy notes, 10-minute cancellation timers, pricing precision, SSE reconnection, service requests, complaints, and dual-mode data isolation.

---

## 3. Coverage Gates & Threshold Compliance

Configured in `backend/jest.config.ts`:

| Coverage Metric | Configured Gate | Live Result | Status |
|---|---|---|---|
| **Global Statements** | 80.00% | **84.63%** | **MET (PASS)** |
| **Global Lines** | 80.00% | **84.91%** | **MET (PASS)** |
| **Global Functions** | 75.00% | **75.45%** | **MET (PASS)** |
| **Global Branches** | 70.00% | **78.67%** | **MET (PASS)** |
| **Critical Logic Branch Target** | 90.00% (stretch) | **84.21%** | **UNMET (Documented Gap)** |

---

## 4. Module-Level Coverage Breakdown (Backend Core)

| Module / Directory | Statements | Branches | Functions | Lines | Status |
|---|---|---|---|---|---|
| `src/modules/guest-sessions/` | 95.80% | 88.50% | 94.10% | 96.20% | High Coverage |
| `src/modules/food-orders/` | 93.40% | 85.20% | 92.30% | 93.80% | High Coverage |
| `src/modules/service-requests/` | 94.60% | 87.80% | 95.00% | 95.20% | High Coverage |
| `src/modules/complaints/` | 92.80% | 86.40% | 91.70% | 93.10% | High Coverage |
| `src/modules/menu/` | 91.20% | 84.00% | 90.00% | 91.50% | High Coverage |
| `src/realtime/` | 88.29% | 85.41% | 86.66% | 88.76% | Satisfactory |
| `src/common/auth/` | 96.50% | 91.30% | 100.00% | 96.50% | High Coverage |
| `src/health/` | 82.50% | 76.20% | 85.70% | 83.30% | Satisfactory |
| `src/messaging/` | 89.10% | 81.50% | 88.20% | 89.50% | Satisfactory |
| `src/redis/` | 49.58% | 50.00% | 50.00% | 49.57% | Optional (Disabled by default) |

---

## 5. Instrumented Scope & Excluded Files

### Instrumented Files
* All business logic, controllers, services, repositories, DTOs, guards, middleware, and utility functions located under `backend/src/`.

### Excluded Files (`collectCoverageFrom` exclusions)
* `backend/src/main.ts` (Application bootstrap)
* `backend/src/**/*.module.ts` (NestJS dependency injection module declarations)
* `backend/src/database/data-source.ts` (TypeORM CLI migration configuration)
* `backend/src/database/data-source.ci.ts` (CI TypeORM data source)
* `backend/src/database/migrations/*` (Database migration scripts)
* `backend/src/**/*.interface.ts` (TypeScript compile-time type definitions)

---

## 6. CI Evidence & Artifact Retention

* **GitHub Actions Workflow:** [Push to develop / run #41833172660](https://github.com/forever-hotel/food-ordering/actions/runs/41833172660)
* **CI Execution Date:** 4 November 2026 UTC
* **Jobs Executed:**
  * Backend Lint & Format (Oxlint / Prettier) — PASS
  * Backend Unit & Coverage (Jest) — PASS
  * Frontend Lint & Format (ESLint / Prettier) — PASS
  * Frontend Unit Tests (Node test runner) — PASS
  * Backend Build (`nest build`) — PASS
  * Frontend Build (`next build --webpack`) — PASS

---

## 7. Known Coverage Gaps & Follow-Up Actions

1. **Critical Branch Target:** Branch coverage across core business rules is **84.21%**, falling short of the 90% stretch target. Uncovered branches relate to rare database connection loss recoveries and fallback error handlers.
2. **Playwright E2E Coverage:** 5 Playwright E2E browser tests in `frontend/tests/e2e/` provide full user journey coverage but are excluded from unit coverage calculations.
3. **Multi-Subsystem Consolidation:** This report reflects FOSS subsystem testing. The organization repository (`forever-hotel/documents`) will aggregate coverage across all six subsystems for the final university submission.

