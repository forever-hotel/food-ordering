# FOSS Backend API Test Traceability Register (CIT-05 / DDP-146)

> **Specification Authority:** Approved SRS §4.4; SDS §1.4, §5, §6; DDP-146; CIT-05.  
> **Baseline Commit:** `2e27c0d91a43b1b46743068f620993a27936aa01`  
> **Status:** Verified Active Register (35 exposed endpoints across 9 controllers)

---

## 1. Complete Controller & Endpoint Inventory Matrix

| # | Endpoint | Method | Auth Level | Controller Path | Service Handler | Unit Test Suite | E2E Integration Suite |
|---|---|---|---|---|---|---|---|
| 1 | `/` | `GET` | Public | [`AppController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/app.controller.ts) | `getHello()` | N/A (trivial) | `test/app.e2e-spec.ts` |
| 2 | `/health` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkHealth()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| 3 | `/health/live` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkLiveness()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| 4 | `/health/ready` | `GET` | Public | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `checkReadiness()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| 5 | `/health/internal/database-isolation` | `GET` | Internal Key | [`HealthController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/health/health.controller.ts) | `getDatabaseIsolation()` | `src/health/health.controller.spec.ts` | `test/health.e2e-spec.ts` |
| 6 | `/guest-sessions/internal/qr/issue` | `POST` | Internal Key | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `issueGuestQrSlip()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/qr-activation-lifecycle.e2e-spec.ts` |
| 7 | `/guest-sessions/internal/qr-issue` | `POST` | Internal Key | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `issueGuestQrSlipAlias()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/qr-activation-lifecycle.e2e-spec.ts` |
| 8 | `/guest-sessions/qr` | `POST` | Public / Token | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `authenticateWithQr()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts`, `src/modules/guest-sessions/services/qr-activation.service.spec.ts` | `test/guest-sessions.e2e-spec.ts`, `test/qr-activation-lifecycle.e2e-spec.ts` |
| 9 | `/guest-sessions/me` | `GET` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `getMe()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts` |
| 10 | `/guest-sessions/rooms/:roomNumber` | `GET` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `verifyRoomAccess()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/room-scoped-auth.e2e-spec.ts` |
| 11 | `/guest-sessions/bookings/:bookingId` | `GET` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `verifyBookingAccess()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/room-scoped-auth.e2e-spec.ts` |
| 12 | `/guest-sessions/logout` | `POST` | Guest Bearer | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `logout()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/guest-sessions.e2e-spec.ts` |
| 13 | `/guest-sessions/internal/events/checkout` | `POST` | Internal Key | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `handleCheckoutEvent()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/fds-checkout-session-revocation.e2e-spec.ts` |
| 14 | `/guest-sessions/internal/events/room-reassign` | `POST` | Internal Key | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `handleRoomReassignEvent()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/fds-checkout-session-revocation.e2e-spec.ts` |
| 15 | `/guest-sessions/internal/events/:eventId` | `GET` | Internal Key | [`GuestSessionsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/guest-sessions/guest-sessions.controller.ts) | `getProcessedEvent()` | `src/modules/guest-sessions/guest-sessions.controller.spec.ts` | `test/fds-checkout-session-revocation.e2e-spec.ts` |
| 16 | `/menu` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getMenu()` | `src/modules/menu/menu.controller.spec.ts`, `src/modules/menu/menu.service.spec.ts` | `test/menu.e2e-spec.ts` |
| 17 | `/menu/windows` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getMealWindows()` | `src/modules/menu/menu.controller.spec.ts`, `src/modules/menu/menu.service.spec.ts` | `test/menu.e2e-spec.ts` |
| 18 | `/menu/items/:id` | `GET` | Guest Bearer | [`MenuController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/menu/menu.controller.ts) | `getMenuItem()` | `src/modules/menu/menu.controller.spec.ts`, `src/modules/menu/menu.service.spec.ts` | `test/menu.e2e-spec.ts` |
| 19 | `/food-orders` | `POST` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `createOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts`, `src/modules/food-orders/food-orders.service.spec.ts` | `test/food-orders.e2e-spec.ts` |
| 20 | `/food-orders` | `GET` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `getOrders()` | `src/modules/food-orders/food-orders.controller.spec.ts`, `src/modules/food-orders/food-orders.service.spec.ts` | `test/food-orders.e2e-spec.ts` |
| 21 | `/food-orders/:id` | `GET` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `getOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts`, `src/modules/food-orders/food-orders.service.spec.ts` | `test/food-orders.e2e-spec.ts` |
| 22 | `/food-orders/:id/cancel` | `POST` | Guest Bearer | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `cancelOrder()` | `src/modules/food-orders/food-orders.controller.spec.ts`, `src/modules/food-orders/food-orders.service.spec.ts` | `test/food-orders.e2e-spec.ts` |
| 23 | `/food-orders/:id/status` | `POST` | Guest / Demo | [`FoodOrdersController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/food-orders/food-orders.controller.ts) | `advanceOrderStatus()` | `src/modules/food-orders/food-orders.controller.spec.ts`, `src/modules/food-orders/food-orders.service.spec.ts` | `test/food-orders.e2e-spec.ts` |
| 24 | `/service-requests` | `POST` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `createServiceRequest()` | `src/modules/service-requests/service-requests.controller.spec.ts`, `src/modules/service-requests/service-requests.service.spec.ts` | `test/service-requests.e2e-spec.ts` |
| 25 | `/service-requests` | `GET` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `getGuestServiceRequests()` | `src/modules/service-requests/service-requests.controller.spec.ts`, `src/modules/service-requests/service-requests.service.spec.ts` | `test/service-requests.e2e-spec.ts` |
| 26 | `/service-requests/:id` | `GET` | Guest Bearer | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `getGuestServiceRequestById()` | `src/modules/service-requests/service-requests.controller.spec.ts`, `src/modules/service-requests/service-requests.service.spec.ts` | `test/service-requests.e2e-spec.ts` |
| 27 | `/service-requests/:id/status` | `POST` | Guest / Demo | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `advanceServiceRequestStatus()` | `src/modules/service-requests/service-requests.controller.spec.ts`, `src/modules/service-requests/service-requests.service.spec.ts` | `test/service-requests.e2e-spec.ts` |
| 28 | `/service-requests/internal/events/status-updated` | `POST` | Internal Key | [`ServiceRequestsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/service-requests/service-requests.controller.ts) | `handleWkmsStatusEvent()` | `src/modules/service-requests/service-requests.controller.spec.ts`, `src/modules/service-requests/service-requests.service.spec.ts` | `test/service-requests.e2e-spec.ts` |
| 29 | `/complaints` | `POST` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `fileComplaint()` | `src/modules/complaints/complaints.controller.spec.ts`, `src/modules/complaints/complaints.service.spec.ts` | `test/complaints.e2e-spec.ts` |
| 30 | `/complaints` | `GET` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `getComplaints()` | `src/modules/complaints/complaints.controller.spec.ts`, `src/modules/complaints/complaints.service.spec.ts` | `test/complaints.e2e-spec.ts` |
| 31 | `/complaints/:id` | `GET` | Guest Bearer | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `getComplaintById()` | `src/modules/complaints/complaints.controller.spec.ts`, `src/modules/complaints/complaints.service.spec.ts` | `test/complaints.e2e-spec.ts` |
| 32 | `/complaints/:id/status` | `PATCH` | Guest / Demo | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `advanceComplaintStatus()` | `src/modules/complaints/complaints.controller.spec.ts`, `src/modules/complaints/complaints.service.spec.ts` | `test/complaints.e2e-spec.ts` |
| 33 | `/complaints/internal/events/status-updated` | `POST` | Internal Key | [`ComplaintsController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/modules/complaints/complaints.controller.ts) | `handleMadStatusEvent()` | `src/modules/complaints/complaints.controller.spec.ts`, `src/modules/complaints/complaints.service.spec.ts` | `test/complaints.e2e-spec.ts` |
| 34 | `/realtime/events/stream` | `GET` (SSE) | Guest Bearer | [`RealtimeController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/realtime/realtime.controller.ts) | `streamEvents()` | `src/realtime/realtime.service.spec.ts` | `test/realtime.e2e-spec.ts` |
| 35 | `/realtime/events/poll` | `GET` | Guest Bearer | [`RealtimeController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/realtime/realtime.controller.ts) | `pollEvents()` | `src/realtime/realtime.service.spec.ts` | `test/realtime.e2e-spec.ts` |
| 36 | `/integrations/booking/verify` | `POST` | Public / Key | [`BookingController`](file:///d:/ForeverHotel-Development/food-ordering/backend/src/integrations/internal-services/booking/booking.controller.ts) | `verifyBooking()` | `src/integrations/internal-services/booking/adapters/mock-booking.adapter.spec.ts` | `test/booking-verification.e2e-spec.ts` |

---

## 2. Route-by-Route Response Dimension Verification

| # | Endpoint | Method | 200/201 Success | 400 Validation | 401 Auth Failure | 403 IDOR / Forbidden | 404 Not Found | 409 Conflict | 503 Upstream |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `GET` | Verified | N/A | N/A | N/A | N/A | N/A | N/A |
| 2 | `/health` | `GET` | Verified | N/A | N/A | N/A | N/A | N/A | Verified |
| 3 | `/health/live` | `GET` | Verified | N/A | N/A | N/A | N/A | N/A | N/A |
| 4 | `/health/ready` | `GET` | Verified | N/A | N/A | N/A | N/A | N/A | Verified |
| 5 | `/health/internal/database-isolation` | `GET` | Verified | N/A | Verified | Verified | N/A | N/A | N/A |
| 6 | `/guest-sessions/internal/qr/issue` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | Verified |
| 7 | `/guest-sessions/internal/qr-issue` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | Verified |
| 8 | `/guest-sessions/qr` | `POST` | Verified | Verified | Verified | N/A | N/A | N/A | Verified |
| 9 | `/guest-sessions/me` | `GET` | Verified | N/A | Verified | N/A | N/A | N/A | N/A |
| 10 | `/guest-sessions/rooms/:roomNumber` | `GET` | Verified | N/A | Verified | Verified | N/A | N/A | N/A |
| 11 | `/guest-sessions/bookings/:bookingId` | `GET` | Verified | N/A | Verified | Verified | N/A | N/A | N/A |
| 12 | `/guest-sessions/logout` | `POST` | Verified | N/A | Verified | N/A | N/A | N/A | N/A |
| 13 | `/guest-sessions/internal/events/checkout` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | N/A |
| 14 | `/guest-sessions/internal/events/room-reassign` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | N/A |
| 15 | `/guest-sessions/internal/events/:eventId` | `GET` | Verified | N/A | Verified | Verified | Verified | N/A | N/A |
| 16 | `/menu` | `GET` | Verified | Verified | Verified | N/A | N/A | N/A | Verified |
| 17 | `/menu/windows` | `GET` | Verified | N/A | Verified | N/A | N/A | N/A | N/A |
| 18 | `/menu/items/:id` | `GET` | Verified | N/A | Verified | N/A | Verified | N/A | Verified |
| 19 | `/food-orders` | `POST` | Verified | Verified | Verified | Verified | N/A | Verified | Verified |
| 20 | `/food-orders` | `GET` | Verified | N/A | Verified | N/A | N/A | N/A | N/A |
| 21 | `/food-orders/:id` | `GET` | Verified | N/A | Verified | Verified | Verified | N/A | N/A |
| 22 | `/food-orders/:id/cancel` | `POST` | Verified | Verified | Verified | Verified | Verified | Verified | Verified |
| 23 | `/food-orders/:id/status` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | N/A |
| 24 | `/service-requests` | `POST` | Verified | Verified | Verified | Verified | N/A | N/A | Verified |
| 25 | `/service-requests` | `GET` | Verified | Verified | Verified | N/A | N/A | N/A | N/A |
| 26 | `/service-requests/:id` | `GET` | Verified | N/A | Verified | Verified | Verified | N/A | N/A |
| 27 | `/service-requests/:id/status` | `POST` | Verified | Verified | Verified | Verified | Verified | Verified | N/A |
| 28 | `/service-requests/internal/events/status-updated` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | N/A |
| 29 | `/complaints` | `POST` | Verified | Verified | Verified | Verified | N/A | Verified | Verified |
| 30 | `/complaints` | `GET` | Verified | Verified | Verified | N/A | N/A | N/A | N/A |
| 31 | `/complaints/:id` | `GET` | Verified | N/A | Verified | N/A | Verified | N/A | N/A |
| 32 | `/complaints/:id/status` | `PATCH` | Verified | Verified | Verified | N/A | Verified | N/A | N/A |
| 33 | `/complaints/internal/events/status-updated` | `POST` | Verified | Verified | Verified | Verified | Verified | N/A | N/A |
| 34 | `/realtime/events/stream` | `GET` (SSE) | Verified | N/A | Verified | Verified | N/A | N/A | N/A |
| 35 | `/realtime/events/poll` | `GET` | Verified | Verified | Verified | Verified | N/A | N/A | N/A |
| 36 | `/integrations/booking/verify` | `POST` | Verified | Verified | N/A | N/A | N/A | N/A | Verified |

---

## 3. Test Case ID Mapping (TC-DDP-146)

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
