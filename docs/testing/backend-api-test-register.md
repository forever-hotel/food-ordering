# FOSS Backend API Test Traceability Register (CIT-05 / DDP-146)

> **Specification Authority:** Approved SRS §4.4, SDS §1.4, §5, §6; DDP-146; CIT-05.  
> **Baseline Commit:** `2e27c0d91a43b1b46743068f620993a27936aa01`  
> **Coverage Goal:** 100% route coverage across all implemented REST controllers with positive, negative, authorization, idempotency, and upstream-failure test cases.

---

## 1. Controller & Endpoint Inventory Matrix

| Endpoint | Method | Auth Level | Controller Path | Service Handler | Unit Test Suite | E2E Integration Suite |
|---|---|---|---|---|---|---|
| `/` | `GET` | Public | [`AppController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/app.controller.ts) | `getHello()` | N/A | `test/app.e2e-spec.ts` |
| `/health` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkHealth()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| `/health/live` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkLiveness()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| `/health/ready` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkReadiness()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| `/health/internal/database-isolation` | `GET` | Internal Key | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `getDatabaseIsolation()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| `/guest-sessions/qr-activate` | `POST` | Public / QR | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `activateQrSession()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts`, `test/qr-activation-lifecycle.e2e-spec.ts` |
| `/guest-sessions/verify-room` | `POST` | Public / Code | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `verifyRoomCode()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts`, `test/qr-activation-lifecycle.e2e-spec.ts` |
| `/guest-sessions/current` | `GET` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `getCurrentSession()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts` |
| `/guest-sessions/revoke` | `POST` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `revokeSession()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts` |
| `/guest-sessions/dev-issue-token` | `POST` | Demo Only | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `issueDevToken()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts` |
| `/menu` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getMenu()` | `src/modules/menu/menu.controller.spec.ts` | `test/menu.e2e-spec.ts` |
| `/menu/categories` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getCategories()` | `src/modules/menu/menu.controller.spec.ts` | `test/menu.e2e-spec.ts` |
| `/menu/:id` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getItemById()` | `src/modules/menu/menu.controller.spec.ts` | `test/menu.e2e-spec.ts` |
| `/food-orders` | `POST` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `createOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts` | `test/food-orders.e2e-spec.ts` |
| `/food-orders` | `GET` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `getOrders()` | `src/modules/food-orders/food-orders.controller.spec.ts` | `test/food-orders.e2e-spec.ts` |
| `/food-orders/:id` | `GET` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `getOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts` | `test/food-orders.e2e-spec.ts` |
| `/food-orders/:id/cancel` | `POST` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `cancelOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts` | `test/food-orders.e2e-spec.ts` |
| `/food-orders/demo/status-advance` | `POST` | Guest / Demo | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `advanceStatus()` | `src/modules/food-orders/food-orders.controller.spec.ts` | `test/food-orders.e2e-spec.ts` |
| `/service-requests` | `POST` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `createRequest()` | `src/modules/service-requests/service-requests.controller.spec.ts` | `test/service-requests.e2e-spec.ts` |
| `/service-requests` | `GET` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `getRequests()` | `src/modules/service-requests/service-requests.controller.spec.ts` | `test/service-requests.e2e-spec.ts` |
| `/service-requests/:id` | `GET` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `getRequest()` | `src/modules/service-requests/service-requests.controller.spec.ts` | `test/service-requests.e2e-spec.ts` |
| `/service-requests/:id/cancel` | `POST` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `cancelRequest()` | `src/modules/service-requests/service-requests.controller.spec.ts` | `test/service-requests.e2e-spec.ts` |
| `/service-requests/internal/events/status-updated` | `POST` | Internal Key | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `handleWkmsStatusEvent()` | `src/modules/service-requests/service-requests.controller.spec.ts` | `test/service-requests.e2e-spec.ts` |
| `/complaints` | `POST` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `createComplaint()` | `src/modules/complaints/complaints.controller.spec.ts` | `test/complaints.e2e-spec.ts` |
| `/complaints` | `GET` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `getComplaints()` | `src/modules/complaints/complaints.controller.spec.ts` | `test/complaints.e2e-spec.ts` |
| `/complaints/:id` | `GET` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `getComplaint()` | `src/modules/complaints/complaints.controller.spec.ts` | `test/complaints.e2e-spec.ts` |
| `/complaints/:id/status` | `PATCH` | Demo Only | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `advanceComplaintStatus()` | `src/modules/complaints/complaints.controller.spec.ts` | `test/complaints.e2e-spec.ts` |
| `/complaints/internal/events/status-updated` | `POST` | Internal Key | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `handleMadStatusEvent()` | `src/modules/complaints/complaints.controller.spec.ts` | `test/complaints.e2e-spec.ts` |
| `/realtime/events/stream` | `GET` | Guest Bearer / SSE | [`RealtimeController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/realtime/realtime.controller.ts) | `streamEvents()` | `src/realtime/realtime.service.spec.ts` | `test/realtime.e2e-spec.ts` |
| `/realtime/events/poll` | `GET` | Guest Bearer | [`RealtimeController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/realtime/realtime.controller.ts) | `pollEvents()` | `src/realtime/realtime.service.spec.ts` | `test/realtime.e2e-spec.ts` |
| `/booking/verify` | `POST` | Internal Key | [`BookingController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/integrations/internal-services/booking/booking.controller.ts) | `verifyBooking()` | `src/integrations/internal-services/booking/adapters/mock-booking.adapter.spec.ts` | `test/booking-verification.e2e-spec.ts` |

---

## 2. Test Case ID Mapping (TC-DDP-146)

### TC-DDP-146-AC1: Successful Workflow & Authorized Routes
- **`TC-DDP-146-AC1.1`**: QR session activation returns valid Bearer session token and stay context ([`guest-sessions.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/guest-sessions.e2e-spec.ts)).
- **`TC-DDP-146-AC1.2`**: Categorized menu catalog returned with active Colombo meal periods ([`menu.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/menu.e2e-spec.ts)).
- **`TC-DDP-146-AC1.3`**: Food order submitted atomically with server-calculated pricing, ETA and idempotency ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC1.4`**: Service request created with category and dispatched to WKMS ([`service-requests.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/service-requests.e2e-spec.ts)).
- **`TC-DDP-146-AC1.5`**: Complaint filed with severity and order reference ([`complaints.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/complaints.e2e-spec.ts)).
- **`TC-DDP-146-AC1.6`**: Realtime SSE stream establishes and receives room-scoped updates ([`realtime.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/realtime.e2e-spec.ts)).

### TC-DDP-146-AC2: Negative / Error Cases & IDOR Boundaries
- **`TC-DDP-146-AC2.1`**: Missing or malformed `Authorization: Bearer <token>` header returns `401 Unauthorized` on all protected endpoints ([`room-scoped-auth.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/room-scoped-auth.e2e-spec.ts)).
- **`TC-DDP-146-AC2.2`**: Cross-room order retrieval / cancellation attempt returns `404 Not Found` or `403 Forbidden` ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC2.3`**: Cross-room service request access returns `403 Forbidden` without leaking resource existence ([`service-requests.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/service-requests.e2e-spec.ts)).
- **`TC-DDP-146-AC2.4`**: Cross-room complaint access returns `404 Not Found` ([`complaints.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/complaints.e2e-spec.ts)).
- **`TC-DDP-146-AC2.5`**: Invalid item quantity (< 1 or > 20) returns `400 Bad Request` ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC2.6`**: Expired meal window item ordering returns `400 Bad Request` ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC2.7`**: Sold-out / unavailable item ordering returns `409 Conflict` ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC2.8`**: Upstream KMS/WKMS failure returns safe `503 Service Unavailable` with sanitized error envelope ([`api-validation-and-errors.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/api-validation-and-errors.e2e-spec.ts)).

### TC-DDP-146-AC3: Boundary, Concurrency & Idempotency
- **`TC-DDP-146-AC3.1`**: Order cancellation permitted at 9m 59s; strictly rejected with `409 Conflict` at 10m 00s boundary ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC3.2`**: Idempotent replay of order submission returns existing order without creating duplicate KMS ticket or charging twice ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC3.3`**: Reuse of idempotency key across different rooms is rejected with `403 Forbidden` ([`food-orders.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/food-orders.e2e-spec.ts)).
- **`TC-DDP-146-AC3.4`**: Service request idempotent replay returns cached response without duplicate worker task creation ([`service-requests.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/service-requests.e2e-spec.ts)).
- **`TC-DDP-146-AC3.5`**: QR replay / expired token rejection prevents session hijacking ([`qr-activation-lifecycle.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/qr-activation-lifecycle.e2e-spec.ts)).

### TC-DDP-146-AC4: Contract Compliance & Database Safety
- **`TC-DDP-146-AC4.1`**: No foreign keys to external subsystem tables (FDS bookings/rooms, KMS orders, WKMS tasks) exist ([`1791900000008-RemoveCrossDomainForeignKeys.spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/database/1791900000008-RemoveCrossDomainForeignKeys.spec.ts)).
- **`TC-DDP-146-AC4.2`**: Disposable CI database guard strictly blocks test migrations or resets against production Neon ([`assert-ci-disposable-database.spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/database/guards/assert-ci-disposable-database.spec.ts)).
- **`TC-DDP-146-AC4.3`**: Inbound webhooks require `x-internal-service-key`; missing or invalid keys return `401 Unauthorized` / `403 Forbidden` ([`service-requests.e2e-spec.ts`](file:///d:/ForeverHotel-Development/food-ordering/backend/test/service-requests.e2e-spec.ts)).

