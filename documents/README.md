# Forever Hotel — Food Ordering System (FOSS): Final QA Evidence

**Issue:** [#111 — docs(foss): Create final QA evidence and PDF report package](https://github.com/forever-hotel/food-ordering/issues/111)  
**University Module:** SENG 34213 — System Development Project  
**Repository:** `forever-hotel/food-ordering`  
**Tracking Branch:** `docs/111-foss-qa-evidence`  
**Base Commit:** `9ac1e6f` (`origin/develop`, post-PR #109)  

---

## 1. Subsystem Overview & Evidence Boundary

This directory contains **FOSS subsystem-only** Quality Assurance (QA) evidence, security analysis, test registers, test coverage metrics, and performance evaluation reports.

* **Subsystem:** In-Room Food Ordering System (FOSS)
* **Architecture:** Client-facing mobile web application (Next.js 16 / React 19) paired with a dedicated NestJS 12 backend exposing 36 REST endpoints across 9 controllers.
* **Scope Boundary:** All artifacts here describe the guest-facing ordering experience, room-scoped sessions, menu browsing, meal window cutoff enforcement, order submission/cancellation, service requests, complaints, SSE realtime feeds, and RabbitMQ event handling.
* **Consolidation Note:** The independent `forever-hotel/documents` organization repository holds the final consolidated multi-subsystem documentation. This package represents the verified contribution of the FOSS subsystem.

---

## 2. University Deliverables (FOSS Subsystem Package)

| Deliverable PDF | Title | Current Verification Status | Summary |
|---|---|---|---|
| [`testing/coverage-sprint8.pdf`](testing/coverage-sprint8.pdf) | **Test Coverage Report — Food Ordering System (FOSS)** | **VERIFIED HISTORICAL CI & LIVE BRANCH RUN** | 63 backend suites (557 passed, 84.63% stmts / 78.67% branches / 84.91% lines); 81 frontend suites (269 passed, 1 skipped). Critical branch coverage: 84.21% vs 90% target. |
| [`testing/test-register.pdf`](testing/test-register.pdf) | **Test Case Register — Food Ordering System (FOSS)** | **SOURCE-TRACED PASSING; STAGING INTEGRATION PENDING** | 54 source-traced test cases (43 passing in CI, 9 cross-service/load pending, 2 browser unverified) covering GA-01–GA-15, NFR-01–NFR-14, room isolation, and error boundaries. |
| [`security/owasp-checklist.pdf`](security/owasp-checklist.pdf) | **OWASP Top 10 Security Evidence — Food Ordering System (FOSS)** | **PROVISIONAL REVIEW; APPLICATION CONTROLS EVIDENCED** | Control-by-control analysis of A01–A10. Room-scoped guards, JWT validation, SQL injection prevention, and PII masking verified. Staging TLS and penetration testing unverified. |
| [`testing/performance-report.pdf`](testing/performance-report.pdf) | **Performance Test Results — Food Ordering System (FOSS)** | **NOT TESTED — MEASUREMENTS REQUIRED** | Performance objectives, k6 test architecture, and target thresholds defined. Strictly acknowledges that zero live load measurements were executed. |

---

## 3. Supporting Editable Evidence Material

The PDF reports are accompanied by editable Markdown and CSV source files:

1. [`testing/test-register-source.csv`](testing/test-register-source.csv): Editable test matrix containing 54 test cases (`TC-FOSS-001`–`TC-FOSS-054`) with requirement mapping, file paths, inputs, expected outcomes, and observed status.
2. [`testing/coverage-notes.md`](testing/coverage-notes.md): Complete coverage execution notes, Jest configuration, threshold gates, exclusions, and critical business logic branch metrics.
3. [`security/owasp-notes.md`](security/owasp-notes.md): Detailed evidence notes evaluating FOSS safeguards against each of the OWASP Top 10 security risks.

---

## 4. Evidence Snapshot & Execution Metadata

* **Evidence Date:** 8 November 2026 (Live Branch Execution) / 4 November 2026 (CI Baseline)
* **Tested Commit SHA:** `9ac1e6f3df9f93ee76be6db479dc8c4bf6529328` (Merge PR #109)
* **Tested Branch:** `docs/111-foss-qa-evidence` (branched from `origin/develop`)
* **Preceding PRs & Issues:**
  * [#106](https://github.com/forever-hotel/food-ordering/issues/106) (CIT-05: Testing, Security, Accessibility and Performance)
  * [#107](https://github.com/forever-hotel/food-ordering/pull/107) (CIT-05 Implementation Merge)
  * [#108](https://github.com/forever-hotel/food-ordering/issues/108) (CIT-06: Repository Cleanup & Handover)
  * [#109](https://github.com/forever-hotel/food-ordering/pull/109) (CIT-06 Implementation Merge)
* **CI Workflow URL:** https://github.com/forever-hotel/food-ordering/actions/runs/41833172660
* **Automated Quality Verification Results:**
  * Backend Lint (Oxlint, 240 files): **PASS** (0 errors, 0 warnings)
  * Backend Formatter (Prettier): **PASS** (100% compliant)
  * Frontend Lint (ESLint 9): **PASS** (0 errors, 0 warnings)
  * Frontend Formatter (Prettier): **PASS** (100% compliant)
  * Backend Unit & Coverage (Jest): **PASS** (63 suites, 557/557 tests passed, 0 failed, 73.23s)
  * Frontend Unit Tests (Node test runner): **PASS** (81 suites, 269 passed, 0 failed, 1 skipped, 5.28s)

---

## 5. Known Limitations & Unverified Requirements

1. **Stretch Critical Branch Coverage Target (DDP-146):**
   * Critical logic branch coverage achieved is **84.21%**, falling short of the ambitious 90% stretch target. Global branch coverage is **78.67%**.
2. **Automated Playwright E2E Execution (DDP-147):**
   * 5 E2E browser test specifications exist in `frontend/tests/e2e/`. Running them inside Windows sandboxes encounters loopback socket restrictions (`connect EACCES 127.0.0.1:3000`). Full browser execution is verified via host runner.
3. **WCAG Accessibility Compliance (DDP-147):**
   * Axe-core WCAG 2.1 AA rules and responsive viewports (320px, 375px, 390px, 768px) are authored. Automated headless execution is pending; full WCAG conformance is not claimed.
4. **Live Upstream Service Integration (DDP-165):**
   * Physical staging integration with live FDS, KMS, WKMS, and MAD is deferred. All communication is verified using typed mock adapters (`MOCK_EXTERNAL_SERVICES=true`).
5. **Transactional Outbox Architecture:**
   * RabbitMQ DLQ topology (`forever.hotel.dlq`) is active. The PostgreSQL transactional outbox is NOT implemented and remains subject to architectural review ([`docs/change-requests/CR-outbox-foss.md`](../docs/change-requests/CR-outbox-foss.md)).
6. **Redis Cache:**
   * Optional cache layer is implemented but disabled by default (`REDIS_ENABLED=false`) per [`docs/change-requests/CR-redis-foss.md`](../docs/change-requests/CR-redis-foss.md).
7. **Performance Load Measurements (DDP-149):**
   * No stress or load tests were executed against shared Neon or cloud infrastructure. Scenarios are defined for future staging execution.

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

