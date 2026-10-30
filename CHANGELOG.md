# Changelog

All notable changes to the Food Ordering & Service Request System (FOSS) are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-10-30

### Added
- **CIT-01 / DDP-145:** Multi-stage production Dockerfiles for NestJS backend (`backend/Dockerfile`) and Next.js frontend (`frontend/Dockerfile`) with non-root security (`node` UID 1000, `nextjs` UID 1001).
- **CIT-01 / DDP-145:** Root `docker-compose.yml` orchestrating FOSS backend (port 4300) and frontend (port 3000) with healthchecks and Neon environment injection.
- **CIT-01 / DDP-145:** Docker build context filters (`backend/.dockerignore`, `frontend/.dockerignore`).
- **CIT-01 / DDP-151:** GitHub Actions CI workflow enhancements in `.github/workflows/ci.yml` adding push triggers on `develop` and `main` plus automated Docker multi-stage build verification.
- **CIT-01 / DDP-151:** Staging deployment, smoke test verification, and rollback runbook (`docs/release/RELEASE_RUNBOOK.md`).
- **CIT-01 / DDP-153:** Port standardization to 4300 across backend default port fallback, compose networking, and environment examples to align with API Gateway.
- **CIT-01 / DDP-164:** Shared infrastructure and broker topology specification (`docs/infra/SHARED_INFRA_TOPOLOGY.md`).

### Changed
- **CIT-01 / DDP-153:** Updated `backend/src/main.ts` default port fallback from 3001 to 4300 to eliminate port collision with Front Desk System (port 4200) and match API Gateway route configuration.
- **CIT-01 / DDP-145:** Enabled `output: 'standalone'` in `frontend/next.config.ts` for optimized container image creation.

---

## [0.2.0] - 2026-10-30

### Completed
- **DDP-121–144:** Implemented complete in-room guest services including QR authentication, room-scoped authorization, FDS checkout revocation, versioned upstream contracts (KMS, WKMS, MAD, FDS), categorized meal menus, persistent in-session cart, idempotent order placement, live order tracker with 10-minute cancellation, service request creation & tracking, guest complaint filing, stay order history, and cross-service validation.

---

## [0.1.0] - 2026-10-24

### Added
- Initial project scaffolding for NestJS backend and Next.js frontend with TypeORM and Neon database configuration.
