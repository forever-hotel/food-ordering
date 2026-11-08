# FOSS OWASP Top 10 Security Checklist — Editable Evidence Notes

**Subsystem:** Food Ordering System (FOSS)  
**Repository:** `forever-hotel/food-ordering`  
**Tracking Issue:** [#111](https://github.com/forever-hotel/food-ordering/issues/111)  
**Reviewed Commit:** `9ac1e6f` (Merge PR #109, post-CIT-05 / CIT-06)  
**Evidence Date:** 8 November 2026  

---

## A01 Broken Access Control

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * Guest requests require valid Bearer JWT issued upon QR activation.
  * Server-side `RoomOwnershipGuard` verifies that the `roomNumber` and `bookingId` inside the guest session token match the target resource.
  * Room and booking isolation routes (`GET /guest-sessions/rooms/:roomNumber`, `GET /guest-sessions/bookings/:bookingId`) return 403 Forbidden on IDOR attempts.
  * Immediate session revocation upon FDS checkout event (`POST /guest-sessions/internal/events/checkout`).
* **Test & Source References:**
  * `backend/src/common/auth/room-ownership.guard.ts`
  * `backend/src/common/auth/room-ownership.guard.spec.ts`
  * `backend/test/room-scoped-auth.e2e-spec.ts`
  * `backend/test/fds-checkout-session-revocation.e2e-spec.ts`
  * `frontend/tests/fui-02-room-isolation.test.ts`
* **Verified Test Results:**
  * Unit tests pass verifying cross-room access rejection (Room 101 attempting to read/order for Room 102 receives 403).
  * E2E tests confirm expired or revoked sessions receive 401 Unauthorized.
* **Unverified Controls:**
  * Automated penetration testing across all 36 endpoints with fuzzing inputs.
  * Gateway-level rate limiting on access attempts per IP.
* **Residual Risk / Findings:**
  * Potential brute-force room probing if API Gateway rate limiting is bypassed.
* **Required Follow-up:**
  * Coordinate with API Gateway team to enforce rate limits on `/foss/guest-sessions/qr` and execute full multi-tenant penetration tests.

---

## A02 Cryptographic Failures

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * QR activation tokens signed using HMAC-SHA256 (`JWT_SECRET` / `QR_HMAC_SECRET`).
  * Session tokens passed strictly via `Authorization: Bearer <token>` header; never exposed in query parameters, URLs, or browser access logs.
  * Realtime SSE connection uses fetch-based streaming with Authorization header, avoiding token leakage in EventSource URLs.
  * Transport layer encryption (TLS 1.3) enforced at Neon PostgreSQL database level via TLS configuration.
* **Test & Source References:**
  * `backend/src/modules/guest-sessions/services/qr-activation.service.ts`
  * `backend/src/modules/guest-sessions/services/qr-activation.service.spec.ts`
  * `backend/test/qr-activation-lifecycle.e2e-spec.ts`
  * `frontend/tests/realtime-client-security.test.ts`
* **Verified Test Results:**
  * Tests verify that token forgery, tampered signatures, or expired tokens are rejected.
  * Frontend unit tests verify SSE connects via fetch headers without URL token exposure.
* **Unverified Controls:**
  * Production TLS termination and certificate management are external API Gateway responsibilities.
  * At-rest database encryption verification in production Neon environment.
* **Residual Risk / Findings:**
  * Development `.env` secrets must never be used in staging or production.
* **Required Follow-up:**
  * Audit production API Gateway TLS cipher suites and ensure key rotation procedures are documented.

---

## A03 Injection

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * TypeORM repositories use parameterized SQL queries exclusively; no raw string concatenation is used in query builders.
  * Global NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` strips unexpected payload properties.
  * Free-text inputs are strictly bounded:
    * Allergy / dietary notes: capped at 300 characters (`GA-05`).
    * Complaint description: capped at 500 characters (`GA-13`).
    * Service request description: capped at 500 characters (`GA-10`).
  * Text sanitization utility (`sanitizePlainText`) strips HTML/script tags before storage or upstream dispatch.
* **Test & Source References:**
  * `backend/src/modules/food-orders/dto/create-order.dto.ts`
  * `backend/src/modules/complaints/dto/create-complaint.dto.ts`
  * `backend/src/modules/service-requests/dto/create-service-request.dto.ts`
  * `backend/test/api-validation-and-errors.e2e-spec.ts`
  * `frontend/tests/pricing-and-quantity.test.ts`
* **Verified Test Results:**
  * Payloads with SQL injection characters (`' OR 1=1 --`) and XSS tags (`<script>`) are rejected by DTO validation or sanitized.
  * Input length boundaries (301 chars in allergy notes) trigger 400 Bad Request.
* **Unverified Controls:**
  * Automated DAST fuzzing using OWASP ZAP or Burp Suite.
* **Residual Risk / Findings:**
  * Low risk of SQL injection given TypeORM parameterization, but second-order injection in external services (KMS/WKMS/MAD) must be guarded upstream.
* **Required Follow-up:**
  * Run automated OWASP ZAP baseline API scan against local containerized backend.

---

## A04 Insecure Design

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * High-entropy idempotency keys (`Idempotency-Key` header) prevent duplicate order placement and duplicate service requests from double-taps or network retries.
  * Meal window scheduling and strict cutoffs prevent ordering unavailable meal categories (e.g. breakfast orders during dinner hours).
  * 10-minute order cancellation window (`GA-07`) strictly enforced on both frontend and backend; status advances beyond `SUBMITTED` lock out cancellation.
  * Server-calculated pricing: client totals are discarded; backend recalculates total from authoritative item catalog prices.
  * Cart portion cap: maximum 20 items per line item prevents resource exhaustion.
* **Test & Source References:**
  * `backend/src/modules/food-orders/food-orders.service.ts`
  * `backend/src/modules/food-orders/food-orders.service.spec.ts`
  * `backend/test/food-orders.e2e-spec.ts`
  * `frontend/tests/cart.test.ts`
  * `frontend/tests/pricing-and-quantity.test.ts`
* **Verified Test Results:**
  * Idempotency tests verify replay of identical key returns original order without re-billing.
  * Order cancellation after 10 minutes returns 409 Conflict.
  * Price tampering tests verify client amount override is completely ignored.
* **Unverified Controls:**
  * Formal threat modeling sign-off by hotel security architect.
* **Residual Risk / Findings:**
  * Transactional outbox is not yet implemented (`CR-outbox-foss.md` proposed); dual-write between DB and RabbitMQ poses eventual consistency risk during broker outage.
* **Required Follow-up:**
  * Formalize architectural review for `CR-outbox-foss.md` and obtain cross-subsystem consensus.

---

## A05 Security Misconfiguration

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * Strict environment validation via `class-validator` at NestJS bootstrap (`backend/src/config/env.validation.ts`).
  * Database safety guards in `HealthService` and `assertApprovedDatabaseIdentity`:
    * Rejects execution if test suite runs against development or production Neon branch.
    * Rejects `synchronize: true` in non-development environments.
  * Frontend dual-mode safety: `DATA_MODE=demo` is strictly blocked when `NEXT_PUBLIC_DEPLOYMENT_ENV=production`.
  * Standardized exception filter (`HttpExceptionFilter`) prevents internal stack trace disclosure in HTTP error responses.
* **Test & Source References:**
  * `backend/src/config/env.validation.ts`
  * `backend/src/health/health.service.ts`
  * `backend/src/health/health.service.spec.ts`
  * `backend/src/common/filters/http-exception.filter.ts`
  * `backend/src/database/guards/assert-approved-database-identity.spec.ts`
* **Verified Test Results:**
  * Missing required environment keys cause immediate application startup failure.
  * Health service verifies DB isolation and returns 503 if connected to unauthorized DB branch.
  * Error responses return clean JSON `{ statusCode, message, timestamp, path, correlationId }` without stack traces.
* **Unverified Controls:**
  * Production Docker container hardening (running as non-root user in production cluster).
  * Security header inspection (Content-Security-Policy, Strict-Transport-Security) at API Gateway reverse proxy.
* **Residual Risk / Findings:**
  * Default development keys in `.env.example` must be replaced with high-entropy vault secrets during deployment.
* **Required Follow-up:**
  * Validate gateway security headers and non-root Docker deployment in staging environment.

---

## A06 Vulnerable and Outdated Components

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * Automated linting via Oxlint (240 backend files) and ESLint 9 (frontend).
  * Exact version pinning in `package.json` and strict commit of `package-lock.json`.
  * Dependencies reviewed and cleaned in CIT-06 / Issue #108.
* **Test & Source References:**
  * `backend/package.json`
  * `frontend/package.json`
  * CI Workflow: `.github/workflows/`
* **Verified Test Results:**
  * Backend and frontend lint and format checks pass with 0 errors and 0 warnings.
  * Production build compilation succeeds for both NestJS and Next.js.
* **Unverified Controls:**
  * Full real-time vulnerability scanning against live npm registry during air-gapped CI evaluation.
* **Residual Risk / Findings:**
  * Development dependencies (such as `@types/*` or build tooling) require continuous Dependabot monitoring.
* **Required Follow-up:**
  * Configure automated weekly Dependabot security scanning and document accepted residual risks.

---

## A07 Identification and Authentication Failures

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * QR slip activation flow verifies guest booking reference, room number, and temporary access code.
  * JWT session tokens issued with 24-hour expiration (`SESSION_TTL_HOURS=24`).
  * Immediate session invalidation upon reception checkout via `GuestSessionsController.handleCheckoutEvent()`.
  * Token verification rejects expired tokens, malformed headers, or tampered signatures.
* **Test & Source References:**
  * `backend/src/modules/guest-sessions/guest-sessions.service.ts`
  * `backend/src/modules/guest-sessions/services/qr-activation.service.spec.ts`
  * `backend/test/guest-sessions.e2e-spec.ts`
  * `backend/test/fds-checkout-session-revocation.e2e-spec.ts`
* **Verified Test Results:**
  * QR activation with valid code returns active session.
  * QR activation with invalid room/code returns 401 Unauthorized.
  * Checkout event marks session `REVOKED`; subsequent calls with same Bearer token return 401.
* **Unverified Controls:**
  * Brute-force protection / progressive delays on QR redemption endpoint (delegated to API Gateway).
* **Residual Risk / Findings:**
  * Short-lived access codes on printed QR slips could be guessed if entropy is insufficient. FOSS uses high-entropy UUIDs.
* **Required Follow-up:**
  * Verify rate limiting rules for `/foss/guest-sessions/qr` on the API Gateway.

---

## A08 Software and Data Integrity Failures

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * RabbitMQ inter-service messages require signed event envelopes with HMAC-SHA256 signatures (`SignedEventEnvelope`).
  * Event deduplication: duplicate message IDs are discarded using memory cache / Redis deduplication.
  * Dead-letter queue (`forever.hotel.dlq`) captures poisoned or malformed payloads without crashing consumers.
  * Safe TypeORM migrations: `synchronize: false` enforced; schema changes must be versioned migrations.
* **Test & Source References:**
  * `backend/src/integrations/contracts/signed-event-envelope.ts`
  * `backend/src/integrations/contracts/signed-event-envelope.spec.ts`
  * `backend/src/messaging/rabbitmq-consumer.service.ts`
  * `backend/src/messaging/rabbitmq-consumer.service.spec.ts`
  * `backend/test/rabbitmq-live-integration.e2e-spec.ts`
* **Verified Test Results:**
  * Messages with invalid or missing HMAC signatures are rejected and acknowledged to prevent infinite requeue.
  * Duplicate events (same event ID) are processed idempotently.
  * Unparseable messages are routed to DLQ.
* **Unverified Controls:**
  * Cryptographic code signing of production Docker images in CI registry.
* **Residual Risk / Findings:**
  * Unauthenticated RabbitMQ broker access would compromise event stream; requires dedicated vhost and network isolation.
* **Required Follow-up:**
  * Enforce RabbitMQ TLS and per-service credentials in production broker configuration.

---

## A09 Security Logging and Monitoring Failures

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * Distributed tracing via `CorrelationMiddleware` attaches unique `X-Correlation-ID` to all HTTP requests.
  * Log sanitization utility (`LogSanitizerUtil`) strips passwords, JWT tokens, Bearer headers, and guest PII before console logging.
  * Structured NestJS logging across all service modules with contextual tags (`[GuestSessions]`, `[FoodOrders]`, `[Messaging]`).
  * Explicit audit logs for security-relevant lifecycle events (QR activation, session revocation, order cancellation).
* **Test & Source References:**
  * `backend/src/common/middleware/correlation.middleware.ts`
  * `backend/src/common/middleware/correlation.middleware.spec.ts`
  * `backend/src/common/logging/log-sanitizer.util.ts`
  * `backend/src/common/logging/log-sanitizer.util.spec.ts`
* **Verified Test Results:**
  * Tests verify that logs containing `Authorization: Bearer eyJ...` or guest email/phone are masked to `[REDACTED]`.
  * Correlation IDs are correctly propagated from inbound headers to outbound responses.
* **Unverified Controls:**
  * Centralized log shipping to SIEM / Elasticsearch / Grafana Loki.
  * Real-time automated alerting on suspicious 401/403 spikes.
* **Residual Risk / Findings:**
  * Local container logs may be lost upon pod restart without centralized log aggregation.
* **Required Follow-up:**
  * Integrate FOSS container stdout with hotel infrastructure log aggregator (Elasticsearch/Loki).

---

## A10 Server-Side Request Forgery (SSRF)

* **Status:** **PARTIALLY EVIDENCED**
* **Relevant FOSS Controls:**
  * All outbound HTTP calls to external hotel subsystems (FDS, KMS, WKMS, MAD) use strictly preconfigured, validated base URLs from environment variables (`FDS_BASE_URL`, `KMS_BASE_URL`, `WKMS_BASE_URL`, `MAD_BASE_URL`).
  * No user-supplied URLs, webhooks, or IP addresses are accepted or fetched by FOSS backend services.
  * Outbound service clients do not follow HTTP redirects automatically.
* **Test & Source References:**
  * `backend/src/integrations/internal-services/booking/adapters/real-booking.adapter.ts`
  * `backend/src/integrations/internal-services/kms/adapters/real-kms.adapter.ts`
  * `backend/src/integrations/internal-services/wkms/adapters/real-wkms.adapter.ts`
  * `backend/src/integrations/internal-services/mad/adapters/real-mad-complaint.adapter.ts`
* **Verified Test Results:**
  * Adapter unit tests verify requests target only hardcoded service paths (`/api/v1/bookings/verify`, `/api/v1/menu`, etc.) on configured base URLs.
* **Unverified Controls:**
  * Network-level egress filtering / IP allowlisting in Kubernetes or Docker network topology.
* **Residual Risk / Findings:**
  * Low risk due to absence of user-controlled outbound URL features.
* **Required Follow-up:**
  * Enforce egress network policies preventing container access to internal cloud metadata endpoints (e.g. `169.254.169.254`).

