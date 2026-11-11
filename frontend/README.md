# FOSS Frontend Application

The **Forever Hotel Food Ordering System (FOSS) Frontend** is a mobile-first Single-Page Application built with Next.js `16.4.1`, React `19.2.8`, Ant Design `6.6.5`, and Tailwind CSS `4`.

For full-stack local setup with the NestJS backend, PostgreSQL, and RabbitMQ, see the [root README](../README.md#running-the-complete-application-locally-live-api-mode--no-demo).

---

## 1. Architecture & Routing

### App Router Pages (`src/app/`)

- **`/` ([`page.tsx`](src/app/page.tsx)):**
  - Unauthenticated guests see [`QrScanCard`](src/features/auth/components/qr-scan-card.tsx) (camera QR scanner via `@zxing/browser` + manual access code entry).
  - Authenticated guests navigate across four bottom-nav tabs via [`MobileBottomNav`](src/components/layout/mobile-bottom-nav.tsx): `menu`, `orders`, `services`, and `complaints`.
- **`/activate` ([`activate/page.tsx`](src/app/activate/page.tsx)):**
  - Redeems single-use QR activation links (`?token=...` or `?qrToken=...`), immediately scrubs the raw credential from the browser URL via `window.history.replaceState`, and redirects to `/`.

### Component & Provider Organization (`src/`)

```text
frontend/src/
├── app/                            # Next.js App Router entrypoints (/, /activate, layout.tsx)
├── components/
│   ├── demo/                       # DemoModeToolbar (never rendered in staging/production)
│   ├── feedback/                   # AlertNotice, EmptyState, ErrorBoundary, LoadingSkeleton, OfflineBanner
│   └── layout/                     # GuestShell, MobileBottomNav
├── config/                         # Ant Design theme configuration (theme.ts)
├── features/
│   ├── auth/                       # QrScanCard, ManualEntryForm, QrScannerModal
│   ├── cart/                       # CartView
│   ├── complaints/                 # ComplaintsTab (with current-stay order/request dropdown)
│   ├── guest/                      # ActiveSessionView
│   ├── menu/                       # MenuTab, MenuItemCard, MenuItemDetail
│   ├── orders/                     # OrdersTab, OrderConfirmation, OrderStatusTracker, dev simulation controls
│   └── services/                   # ServicesTab
├── lib/
│   ├── api/                        # Domain API facades & API_URL config (src/lib/api/config.ts)
│   ├── auth/                       # AuthProvider & useAuth()
│   ├── cart/                       # CartProvider & partition-scoped storage
│   ├── constants/                  # Order policy constants (MIN=1, MAX=20)
│   ├── data-mode/                  # DataMode policy, persistent session helpers, provider factory, api/* & demo/*
│   ├── navigation/                 # NavigationProvider & header/tab state
│   ├── realtime/                   # FossRealtimeClient (SSE, Socket.IO gateway ticket, polling fallback)
│   └── utils/                      # Meal window & money formatting helpers
└── providers/                      # AppProviders wrapper
```

### State Management, Data Modes & Real-Time Client

- **Contexts (`src/providers/app-providers.tsx`):** Composes `AuthProvider`, `NavigationProvider`, and `CartProvider`.
- **Provider Factory (`src/lib/data-mode/provider-factory.ts`):** Routes all session, menu, order, service request, and complaint calls to either:
  - **`api` mode (`src/lib/data-mode/api/`):** Default (`NEXT_PUBLIC_DATA_MODE=api`). Sends real `fetch()` requests to `NEXT_PUBLIC_API_URL` (default `http://localhost:4300`) with `credentials: 'include'` and `x-foss-client: foss-web`. Live bearer tokens are never persisted in `localStorage` or `sessionStorage`; session restoration uses the backend `HttpOnly` cookie (`foss_session`) via sentinel `'__COOKIE_SESSION__'` and `POST /guest-sessions/renew` / `GET /guest-sessions/me`.
  - **`demo` mode (`src/lib/data-mode/demo/`):** Uses deterministic in-memory fixtures (`DemoStateStore`) with one-tap demo stays for local UI evaluation only.
- **Deployment Safeguards (`next.config.ts` & `src/lib/data-mode/data-mode.ts`):** Compiling or running with `NEXT_PUBLIC_DATA_MODE=demo` or `NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION=true` is strictly blocked when `NEXT_PUBLIC_DEPLOYMENT_ENV` is `staging` or `production`.
- **Real-Time Client (`src/lib/realtime/realtime-client.ts`):**
  - If `NEXT_PUBLIC_GATEWAY_URL` is set, exchanges the guest session at `POST /guest-sessions/realtime-ticket` and connects via `socket.io-client` (`path: /realtime/socket.io`).
  - If `NEXT_PUBLIC_GATEWAY_URL` is unset (standard direct local backend setup), connects via fetch-based **Server-Sent Events (`GET /realtime/events/stream`)** and falls back to **REST polling (`GET /realtime/events/poll`)** if streaming disconnects after retry backoff.

---

## 2. Guest Features

- **QR Activation & Session Persistence:** Camera scan or manual token entry, single-use `/activate` redemption, stay-bound persistence across reloads, and header room pill sign-out confirmation.
- **Menu & Meal Windows:** Category/search filtering, dietary/allergen indicators, `Asia/Colombo` meal period schedules and live countdowns, and item detail modal/view.
- **Cart & Allergy Notes:** Quantity controls (`1–20` per item), per-order allergy/dietary notes (up to `300` characters), and server-reconciled order totals.
- **Orders & Cancellation:** Idempotent order placement (`Idempotency-Key` / `X-Idempotency-Key`), order confirmation, live status tracker, stay order history, and a 10-minute cancellation flow before kitchen preparation starts.
- **Service Requests & Complaints:** 6 room service categories (`ROOM_CLEANING`, `EXTRA_TOWELS`, `TOILETRIES`, `MAINTENANCE`, `LAUNDRY_PICKUP`, `OTHER`) and complaint intake with category, severity, and optional stay order/request reference dropdown.

---

## 3. Local Setup

### Prerequisites

- Node.js `24.x` and `npm` `10+`
- Running FOSS backend on `http://localhost:4300` (required for `NEXT_PUBLIC_DATA_MODE=api`)

### Installation & Environment Configuration

1. **Install dependencies:**

   ```bash
   cd frontend
   npm ci
   ```

2. **Create `frontend/.env.local` from `frontend/.env.example`:**

   **Windows PowerShell:**

   ```powershell
   Copy-Item .env.example .env.local
   ```

   **Linux / macOS Bash:**

   ```bash
   cp .env.example .env.local
   ```

3. **Live API Mode (default, recommended):**

   ```env
   PORT=3000
   NEXT_PUBLIC_API_URL=http://localhost:4300
   NEXT_PUBLIC_DATA_MODE=api
   NEXT_PUBLIC_DEPLOYMENT_ENV=development
   NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION=false
   ```

   _(To route through the API Gateway instead of directly to port `4300`, set `NEXT_PUBLIC_API_URL=http://localhost:8080/foss` and `NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080`.)_

4. **Frontend-Only Demo Mode (optional, no backend required):**

   Set `NEXT_PUBLIC_DATA_MODE=demo` and `NEXT_PUBLIC_DEPLOYMENT_ENV=development` in `frontend/.env.local`. All mutations stay in memory inside `DemoStateStore` and are not persisted to PostgreSQL.

5. **Run Development or Production Build:**

   ```bash
   # Development server (http://localhost:3000)
   npm run dev

   # Production build (standalone output in .next/)
   npm run build

   # Start production build locally
   npm run start
   ```

---

## 4. Testing & Code Quality

All scripts below are defined in [`package.json`](package.json):

```bash
# ESLint & Prettier checks
npm run lint
npm run format:check

# Run both logic tests (Node test runner) and React component tests (Jest + RTL)
npm test

# Run individual test suites with coverage
npm run test:logic
npm run test:components
npm run test:coverage
```

### Playwright E2E & Accessibility Specs

Five Playwright specifications exist under `tests/e2e/`:

- `auth-activation.spec.ts`
- `session-isolation-expiry.spec.ts`
- `menu-cart-ordering.spec.ts`
- `services-and-complaints.spec.ts`
- `accessibility-wcag-axe.spec.ts` (`@axe-core/playwright` WCAG rules and responsive viewport checks)

```bash
# Playwright commands (isolated from npm test and mandatory CI jobs)
npm run test:e2e:mock   # Runs Playwright against demo mode
npm run test:e2e:api    # Runs Playwright with NEXT_PUBLIC_DATA_MODE=api
npm run test:e2e:all    # Runs all Playwright projects
```

**Execution Limitations & QA Reference:**

- Playwright browser tests require host loopback socket binding; restricted Windows sandboxes fail with `connect EACCES 127.0.0.1:3000`.
- Full WCAG 2.1 AA conformance is **not** claimed until automated headless browser runs are verified against the target build.
- Verified historical coverage from **9 November 2026** (`b4b19df`, recorded in [`../documents/README.md`](../documents/README.md) and [`../documents/testing/coverage-notes.md`](../documents/testing/coverage-notes.md)): 88 logic suites (`295` passed, `1` skipped; `93.19%` lines / `81.34%` branches) and 10 component suites (`141` passed; `91.65%` lines / `80.17%` branches). Re-run `npm run test:coverage` to measure the current branch.
