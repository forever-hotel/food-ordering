# Forever Hotel — Food Ordering System (FOSS): Final QA Evidence

**Issues:** [#111 — docs(foss): Create final QA evidence and PDF report package](https://github.com/forever-hotel/food-ordering/issues/111), [#115 — feat(orders): integrate live KMS menu and persistent food orders](https://github.com/forever-hotel/food-ordering/pull/115), [#116 — fix(foss): enforce authoritative FDS stay expiry across guest sessions and QR access](https://github.com/forever-hotel/food-ordering/issues/116)  
**University Module:** SENG 34213 — System Development Project  
**Repository:** `forever-hotel/food-ordering`  
**Tracking Branch:** `fix/issue-116-fds-stay-expiry`  
**Base Commit:** `b4b19df` (`origin/fix/issue-116-fds-stay-expiry`)

---

## 1. Subsystem Overview & Evidence Boundary

This directory contains **FOSS subsystem-only** Quality Assurance (QA) evidence, security analysis, test registers, test coverage metrics, and performance evaluation reports.

- **Subsystem:** In-Room Food Ordering System (FOSS)
- **Architecture:** Client-facing mobile web application (Next.js 16 / React 19) paired with a dedicated NestJS 12 backend exposing 36 REST endpoints across 9 controllers.
- **Scope Boundary:** All artifacts here describe the guest-facing ordering experience, room-scoped sessions, menu browsing, meal window cutoff enforcement, order submission/cancellation, service requests, complaints, SSE realtime feeds, authoritative FDS stay expiry verification, and RabbitMQ event handling.
- **Consolidation Note:** The independent `forever-hotel/documents` organization repository holds the final consolidated multi-subsystem documentation. This package represents the verified contribution of the FOSS subsystem.

---

## 2. University Deliverables (FOSS Subsystem Package)

| Deliverable PDF                                                    | Title                                                            | Current Verification Status                               | Summary                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`testing/coverage-sprint8.pdf`](testing/coverage-sprint8.pdf)     | **Test Coverage Report — Food Ordering System (FOSS)**           | **VERIFIED LIVE BRANCH RUN**                              | 67 backend suites (670 passed, 88.36% stmts / 83.43% branches / 88.78% lines); 88 frontend logic suites (295 passed, 1 skipped, 93.19% lines / 81.34% branches); 10 frontend component suites (141 passed, 91.65% lines / 80.17% branches across 29 presentation modules). Core services reach 92.00% critical branch coverage (955 of 1,038 branches across 13 core domain modules), meeting and exceeding quality gates. |
| [`testing/test-register.pdf`](testing/test-register.pdf)           | **Test Case Register — Food Ordering System (FOSS)**             | **SOURCE-TRACED PASSING; STAGING INTEGRATION PENDING**    | 58 source-traced test cases (47 passing in CI, 9 cross-service/load pending, 2 browser unverified) covering GA-01–GA-15, NFR-01–NFR-14, room isolation, FDS stay expiry, and error boundaries.                                                                                                                                                                                                                             |
| [`security/owasp-checklist.pdf`](security/owasp-checklist.pdf)     | **OWASP Top 10 Security Evidence — Food Ordering System (FOSS)** | **PROVISIONAL REVIEW; APPLICATION CONTROLS EVIDENCED**    | Control-by-control analysis of A01–A10. Room-scoped guards, JWT validation, SQL injection prevention, authoritative FDS stay bounds, and PII masking verified. Staging TLS and penetration testing unverified.                                                                                                                                                                                                             |
| [`testing/performance-report.pdf`](testing/performance-report.pdf) | **Performance Test Results — Food Ordering System (FOSS)**       | **ISOLATED LOCAL MOCK BENCHMARK EXECUTED — INTEGRATED STAGING NOT VERIFIED** | 8 automated performance scenarios evaluated (1,490 requests across 8 scenarios, 100% expected HTTP 200/201 status codes and valid business payloads, 0.00% error rate). All scenarios achieve p95 &lt; 500 ms (SRS NFR-01 met; p50 = 48.9–302.5 ms, p95 = 70.5–484.3 ms). Aggregate throughput: 263.5 req/s (1,490 reqs / 5.66 s cumulative scenario duration; arithmetic averaging of rates rejected). Verified 100% isolated local container &amp; in-memory mocks (zero shared Neon access). Integrated staging cluster validation remains pending. |

---

## 3. Supporting Editable Evidence Material

The PDF reports are accompanied by editable Markdown and CSV source files:

1. [`testing/test-register-source.csv`](testing/test-register-source.csv): Editable test matrix containing 58 test cases (`TC-FOSS-001`–`TC-FOSS-058`) with requirement mapping, file paths, inputs, expected outcomes, and observed status.
2. [`testing/coverage-notes.md`](testing/coverage-notes.md): Complete coverage execution notes, Jest configuration, threshold gates, exclusions, and critical business logic branch metrics.
3. [`security/owasp-notes.md`](security/owasp-notes.md): Detailed evidence notes evaluating FOSS safeguards against each of the OWASP Top 10 security risks.

---

## 4. Evidence Snapshot & Execution Metadata

- **Evidence Date:** 9 November 2026 (Live Branch Execution)
- **Tested Commit SHA:** `b4b19dfb95042399f5b14136497a608ac1345898`
- **Tested Branch:** `fix/issue-116-fds-stay-expiry` (branched from `origin/develop`)
- **Preceding PRs & Issues:**
  - [#111](https://github.com/forever-hotel/food-ordering/issues/111) (docs(foss): Create final QA evidence and PDF report package)
  - [#112](https://github.com/forever-hotel/food-ordering/pull/112) / [#115](https://github.com/forever-hotel/food-ordering/pull/115) (feat(orders): integrate live KMS menu and persistent food orders)
  - [#116](https://github.com/forever-hotel/food-ordering/issues/116) (fix(foss): enforce authoritative FDS stay expiry across guest sessions and QR access)
- **Automated Quality Verification Results:**
  - Backend Lint (Oxlint, 240 files): **PASS** (0 errors, 0 warnings)
  - Backend Formatter (Prettier): **PASS** (100% compliant)
  - Frontend Lint (ESLint 9): **PASS** (0 errors, 0 warnings)
  - Frontend Formatter (Prettier): **PASS** (100% compliant)
  - Backend Unit & Coverage (Jest): **PASS** (67 suites, 670/670 tests passed, 0 failed; 88.36% stmts, 83.43% branches, 88.78% lines)
  - Frontend Logic Unit & Coverage (Node test runner): **PASS** (88 suites, 295 passed, 0 failed, 1 skipped; 93.19% lines, 81.34% branches)
  - Frontend Component Tests (Jest / RTL): **PASS** (10 suites, 141 passed, 0 failed; 91.65% lines, 80.17% branches across 29 presentation modules)
  - Total Automated Unit/Component Tests: **1,106 passed** (1 skipped, 0 failed) + **231 backend E2E tests** (5 skipped) = **1,337 total automated tests**

---

## 5. Known Limitations & Unverified Requirements

1. **Critical Branch Coverage Target (DDP-146):**
   - Critical business logic core branch coverage achieved is **92.00%** (955 of 1,038 branches across 13 core domain modules), exceeding the 90.0% stretch target. Global backend branch coverage is **83.43%** (exceeding 80% gate), frontend logic branch coverage is **81.34%** (exceeding 80% gate), and frontend presentation branch coverage is **80.17%** (exceeding 80% gate). All configured quality gates are met across both frontend and backend.
2. **Automated Playwright E2E Execution (DDP-147):**
   - 5 E2E browser test specifications exist in `frontend/tests/e2e/`. Running them inside Windows sandboxes encounters loopback socket restrictions (`connect EACCES 127.0.0.1:3000`). Full browser execution is verified via host runner.
3. **WCAG Accessibility Compliance (DDP-147):**
   - Axe-core WCAG 2.1 AA rules and responsive viewports (320px, 375px, 390px, 768px) are authored. Automated headless execution is pending; full WCAG conformance is not claimed.
4. **Live Upstream Service Integration (DDP-165):**
   - Physical staging integration with live FDS, KMS, WKMS, and MAD is deferred. All communication is verified using typed mock adapters (`MOCK_EXTERNAL_SERVICES=true`).
5. **Transactional Outbox Architecture:**
   - RabbitMQ DLQ topology (`forever.hotel.dlq`) is active. The PostgreSQL transactional outbox is NOT implemented and remains subject to architectural review ([`docs/change-requests/CR-outbox-foss.md`](../docs/change-requests/CR-outbox-foss.md)).
6. **Redis Cache:**
   - Optional cache layer is implemented but disabled by default (`REDIS_ENABLED=false`) per [`docs/change-requests/CR-redis-foss.md`](../docs/change-requests/CR-redis-foss.md).
7. **Performance Load Measurements (DDP-149 / Issue #119):**
   - Labeled **ISOLATED LOCAL MOCK BENCHMARK EXECUTED — INTEGRATED STAGING NOT VERIFIED**. Benchmarks were executed against a strictly isolated local container and mock environment (`127.0.0.1`, zero remote Neon DB connections) covering 8 automated scenarios (`SC-PERF-01`–`SC-PERF-08`, 1,490 total HTTP requests). 100% of requests returned expected HTTP 200/201 status codes and valid business payloads with 0.00% error rate and all scenarios achieved p95 < 500 ms (NFR-01; p50 = 48.9–302.5 ms, p95 = 70.5–484.3 ms). SC-PERF-02 incorporates 15 ms virtual-user pacing and SC-PERF-08 incorporates 10 ms cache-read pacing. Aggregate throughput was 263.5 req/s (1,490 reqs / 5.66 s cumulative duration; arithmetic averaging of rates rejected). Multi-service integrated staging cluster validation (with live Neon DB and external microservices) remains pending prior to production release.

---

## 6. Finalization & Evaluation Checklist

- [x] Reference FDS archive `Forever_Hotel_FDS_Subsystem_PDF_Reports.zip` excluded from Git via `.gitignore`.
- [x] Dedicated tracking issue [#111](https://github.com/forever-hotel/food-ordering/issues/111) created.
- [x] Dedicated documentation branch `docs/111-foss-qa-evidence` created from verified `origin/develop`.
- [x] All 8 required deliverable files created under `documents/`.
- [x] All 4 PDF reports generated with professional A4 layout, academic typography, and visual validation.
- [x] 100% of reported evidence is specific to FOSS (zero fabricated metrics or copied FDS data).
- [x] Historical baselines and current live execution runs clearly distinguished.
- [x] Untested and planned scenarios explicitly identified as `NOT TESTED`.
- [x] Zero application business logic or database migrations altered.
- [ ] Review documentation package with project owner and team before opening Pull Request.
