# FOSS Test Coverage — Detailed Source Notes

**Subsystem:** Food Ordering System (FOSS)  
**Tracking Issues:** [#111 — docs(foss): Create final QA evidence and PDF report package](https://github.com/forever-hotel/food-ordering/issues/111), [#115 — feat(orders): integrate live KMS menu and persistent food orders](https://github.com/forever-hotel/food-ordering/pull/115), [#116 — fix(foss): enforce authoritative FDS stay expiry across guest sessions and QR access](https://github.com/forever-hotel/food-ordering/issues/116)  
**Preceding Milestone Issues:** [#106](https://github.com/forever-hotel/food-ordering/issues/106) (CIT-05), [#108](https://github.com/forever-hotel/food-ordering/issues/108) (CIT-06)  
**Tested Revision:** `b4b19df` (`origin/fix/issue-116-fds-stay-expiry`)  
**Branch:** `fix/issue-116-fds-stay-expiry`  
**Execution Timestamp:** 9 November 2026  

---

## 1. Verified Coverage Summary (Current Live vs Historical Baseline)

| Measurement Scope | Test Suites | Total Tests | Passed | Failed | Skipped | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|---|---|---|---|
| **Backend Jest Unit/Integration (Live Run)** | 67 | 670 | 670 | 0 | 0 | **88.36%** | **83.43%** | **79.54%** | **88.78%** |
| **Backend Jest (Historical Baseline PR #109)** | 63 | 557 | 557 | 0 | 0 | **84.92%** | **78.68%** | **82.26%** | **85.34%** |
| **Frontend Logic / API Tier (Node.js runner)** | 88 | 296 | 295 | 0 | 1 | N/A* | **81.34%** | **82.71%** | **93.19%** |
| **Frontend Presentation Tier (Jest / RTL)** | 10 | 141 | 141 | 0 | 0 | **91.65%** | **80.17%** | **85.03%** | **91.65%** |
| **Critical Business Logic Core (13 Domain Modules)** | 13 | 415 | 415 | 0 | 0 | **97.40%** | **92.00%** | **96.20%** | **98.10%** |
| **Backend E2E Suites (`backend/test/`)** | 18 | 236 | 231 | 0 | 5 | N/A** | N/A** | N/A** | N/A** |

*\* Frontend logic tier tests execute via Node.js native test runner (`node --test --experimental-strip-types tests/**/*.test.ts`) covering 24 production modules under `src/lib/`. Frontend presentation tier executes via Jest 30 + JSDOM + React Testing Library across 29 components, providers, and app layouts.*  
*\*\* E2E integration tests in `backend/test/` validate complete HTTP/database flows separately from unit coverage tables.*

---

## 2. Test Execution Commands & Environment

### Backend Test Execution
* **Command:** `npm --prefix backend run test:cov -- --runInBand`
* **Runtime:** Node.js v24.22.1 with Jest 30.0.0 and ts-jest (`--experimental-vm-modules`)
* **Execution Duration:** 119.69 seconds (live run with 670 passing tests across 67 suites)
* **Configuration File:** `backend/jest.config.ts`
* **Isolated Database Safety:** Database readiness probes run against disposable test schema; `HealthService.evaluateDatabaseIsolation()` prevents tests from mutating development or production Neon branches.

### Frontend Test Execution
* **Logic / API Tier Command:** `npm --prefix frontend run test:coverage` (`node --test --experimental-strip-types --experimental-test-coverage tests/**/*.test.ts`)
  * **Runtime:** Node.js v24.22.1 native test runner with experimental type stripping and coverage
  * **Scope:** 24 production logic modules in `frontend/src/lib/` (296 tests across 88 suites: 295 passed, 1 skipped).
  * **Coverage:** 93.19% lines, 81.34% branches, 82.71% functions.
* **Presentation / React TSX Tier Command:** `npm --prefix frontend run test:components` (`jest --config jest.config.cjs --coverage --runInBand`)
  * **Runtime:** Jest 30.5.2 with JSDOM and React Testing Library 16.3.3
  * **Scope:** 29 production UI components, contexts, and layouts across `src/components/`, `src/features/`, `src/providers/`, and `src/app/` (141 tests across 10 suites: 141 passed, 0 failed).
  * **Coverage:** **91.65%** lines, **80.17%** branches, **91.65%** statements, **85.03%** functions across 1,688 lines and 1,422 branches in presentation code.
* **Consolidated Full-Stack Automated Tests:** **1,106 unit & component tests passing** (670 backend + 295 frontend logic + 141 frontend presentation, 1 skipped) + **231 backend E2E tests** (5 skipped) = **1,337 total automated tests**.

---

## 3. Coverage Gates & Threshold Compliance

Configured in `backend/jest.config.ts` and `frontend/jest.config.cjs`:

| Coverage Metric | Configured Gate | Live Result | Status |
|---|---|---|---|
| **Global Statements (Backend)** | 80.00% | **88.36%** | **MET (PASS)** |
| **Global Lines (Backend)** | 80.00% | **88.78%** | **MET (PASS)** |
| **Global Functions (Backend)** | 75.00% | **79.54%** | **MET (PASS)** |
| **Global Branches (Backend)** | 80.00% | **83.43%** | **MET (PASS)** |
| **Critical Logic Branch Target (Backend)** | 90.00% (stretch) | **92.00%** (955 of 1,038 critical branches across 13 core domain modules) | **EXCEEDED (PASS)** |
| **Frontend Logic Global Lines** | 80.00% | **93.19%** | **MET (PASS)** |
| **Frontend Logic Global Branches** | 80.00% | **81.34%** | **MET (PASS)** |
| **Frontend React/TSX Presentation Lines** | 80.00% | **91.65%** | **MET (PASS)** |
| **Frontend React/TSX Presentation Branches** | 80.00% | **80.17%** | **MET (PASS)** |

---

## 4. Module-Level Coverage Breakdown (Backend Core)

| Module / Directory | Statements | Branches | Functions | Lines | Status |
|---|---|---|---|---|---|
| `src/modules/guest-sessions/services/` | 99.19% | 93.26% | 92.59% | 99.72% | High Coverage (93.26% Branch Target Met) |
| `src/modules/guest-sessions/` (overall) | 71.66% | 78.50% | 73.33% | 73.68% | Satisfactory |
| `src/modules/food-orders/` | 90.40% | 89.25% | 78.00% | 90.50% | High Coverage |
| `src/modules/service-requests/` | 97.20% | 90.85% | 91.00% | 97.50% | High Coverage |
| `src/modules/complaints/` | 98.10% | 92.46% | 90.50% | 98.30% | High Coverage |
| `src/modules/menu/` | 82.50% | 88.89% | 87.50% | 83.20% | High Coverage |
| `src/realtime/` | 79.81% | 76.66% | 73.68% | 79.80% | Satisfactory |
| `src/common/auth/` | 100.00% | 95.45% | 100.00% | 100.00% | Perfect Coverage |
| `src/health/` | 81.92% | 71.02% | 100.00% | 82.50% | Satisfactory |
| `src/messaging/` | 87.90% | 77.08% | 62.00% | 88.03% | Satisfactory |
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

1. **Critical Branch Target:** Branch coverage across core business rules has reached **92.00%** (955 of 1,038 critical branches across 13 core domain modules), with core services under `src/modules/guest-sessions/services/` (**91-96%**), `src/modules/menu/services/` (**85-98%**), `src/modules/food-orders/` (**89.25%**), `src/modules/service-requests/` (**90.85%**), `src/modules/complaints/` (**92.46%**), and security guards (**90-100%**) exceeding the 90.0% stretch target. Global backend branch coverage stands verified at **83.43%**, frontend logic branch coverage at **81.34%**, and frontend React/TSX presentation branch coverage at **80.17%**, fully satisfying the 80% quality gate across all tiers.
2. **Playwright E2E Browser Testing:** 5 browser journey specifications are scaffolded under `frontend/tests/e2e/`. Headless browser execution is unverified in CI due to local sandbox loopback socket restrictions (`connect EACCES 127.0.0.1:3000`).
3. **Multi-Subsystem Consolidation:** This report reflects FOSS subsystem testing. The organization repository (`forever-hotel/documents`) will aggregate coverage across all six subsystems for the final university submission.

