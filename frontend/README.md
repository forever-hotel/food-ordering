# FOSS Frontend Application

The **Forever Hotel Food Ordering System (FOSS) Frontend** is a mobile-first Single-Page Application (SPA) built with Next.js 16, React 19, Ant Design, and Tailwind CSS 4.

---

## 1. Architecture & Navigation Design

The frontend implements a high-fidelity guest experience matching approved Final Design Report specifications (Figures 31–39):

- **Root Single-Page Application (`src/app/page.tsx`):** Unauthenticated guests view the Figure 31 Scan Room QR Card. Authenticated guests access tabs via [`MobileBottomNav`](src/components/layout/mobile-bottom-nav.tsx):
  - `menu`: Dining catalog, category filters, and live meal period countdowns (Figure 32).
  - `orders`: Active and historical food orders with status progression and cancellation (Figure 35).
  - `services`: 2x3 grid for housekeeping, maintenance, and towel requests (Figure 38).
  - `complaints`: Feedback submission, severity grading, and manager escalation (Figure 39).
- **Dedicated QR Redemption Route (`src/app/activate/page.tsx`):** Handles single-use QR slip redemption with automatic URL token scrubbing via `window.history.replaceState`.
- **State Management:** React Context architecture ([`AuthProvider`](src/lib/auth/auth-context.tsx), [`NavigationProvider`](src/lib/navigation/navigation-context.tsx), [`CartProvider`](src/lib/cart/cart-context.tsx)) with isolated session storage partitioning.

---

## 2. Operational Modes (`DATA_MODE`)

FOSS frontend features a built-in provider factory pattern dispatching between two data sources:

1. **Deterministic Mock Demo Mode (`DATA_MODE=demo`):**
   - Default for local evaluation and grading.
   - Runs client-side in-memory simulations via [`DemoStateStore`](src/lib/data-mode/demo/demo-state-store.ts).
   - Includes one-tap access codes for Rooms 101, 102, 103, and 204.
   - Requires zero backend or database services.
2. **Live API Mode (`DATA_MODE=api`):**
   - Dispatches real HTTP requests to the NestJS backend at `NEXT_PUBLIC_API_URL` (default: `http://localhost:4300`).
   - Connects to fetch-based Server-Sent Events (SSE) with short-polling fallback.

---

## 3. Environment Configuration (`.env.local`)

Create `frontend/.env.local`:

```env
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:4300
NEXT_PUBLIC_DATA_MODE=demo
NEXT_PUBLIC_DEPLOYMENT_ENV=development
```

> [!WARNING]
> Setting `NEXT_PUBLIC_DEPLOYMENT_ENV=production` strictly disables Mock Demo Mode. Keep set to `development` for local testing.

---

## 4. Development & Testing Commands

```bash
# Install dependencies
npm install

# Start local Next.js development server
npm run dev

# Run frontend linter (ESLint)
npm run lint

# Check formatting (Prettier)
npm run format:check

# Run frontend unit tests (Node test runner)
npm test

# Run production build (Webpack runtime)
npm run build -- --webpack

# Start compiled production build
npm run start -- -p 3000
```

---

## 5. Playwright & Accessibility Testing Status

- **Playwright Scaffolding:** Five comprehensive test specifications are scaffolded under `tests/e2e/`:
  - `auth-activation.spec.ts`: Landing page and QR redemption.
  - `session-isolation-expiry.spec.ts`: Multi-browser room isolation.
  - `menu-cart-ordering.spec.ts`: Dish selection, allergy notes, and checkout.
  - `services-and-complaints.spec.ts`: Housekeeping and complaint flows.
  - `accessibility-wcag-axe.spec.ts`: Automated axe-core WCAG audits.
- **Test Isolation:** Playwright tests are isolated in `tests/e2e/*.spec.ts` and are **not** run by `npm test` or mandatory CI jobs.
- **Execution Limitation:** In restricted Windows sandboxes, local loopback sockets trigger `connect EACCES 127.0.0.1:3000`. Full browser E2E execution requires running outside the sandbox on host networks:
  ```bash
  npm run test:e2e:mock
  ```
- **Accessibility Compliance:** Axe-core WCAG 2.1 AA rules and responsive viewports (320px, 375px, 390px, 768px) are authored. Full conformance is pending automated headless browser runs.
