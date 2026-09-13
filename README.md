# Forever Hotel Food Ordering System

Food ordering application for the Forever Hotel Management System. The
repository currently contains the initial frontend and backend scaffolds.
Food browsing, cart management, ordering, and order tracking are planned
features and are not implemented yet.

## Project Structure

- `frontend/` - Next.js 16 application using React 19, TypeScript, and Tailwind CSS 4
- `backend/` - NestJS 12 application using TypeScript
- `docker-compose.yml` - optional local PostgreSQL 16 and RabbitMQ 3 services

## Prerequisites

- Node.js 20 or later
- npm
- Docker Desktop with Docker Compose (only needed for the optional services)

## Install Dependencies

From the repository root, install each application independently:

```bash
cd backend
npm install

cd ../frontend
npm install
```

The available configuration variables are:

| Application | Variable              | Default                 | Purpose                                    |
| ----------- | --------------------- | ----------------------- | ------------------------------------------ |
| Frontend    | `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Base URL reserved for backend API requests |
| Backend     | `PORT`                | `3001`                  | HTTP listening port                        |
| Backend     | `FRONTEND_URL`        | `http://localhost:3000` | Allowed CORS origin                        |
| Backend     | `DATABASE_URL`        | `postgresql://postgres:postgres@localhost:5432/food_ordering` | PostgreSQL connection URL |

To override the frontend API URL, create `frontend/.env.local`. Backend
variables can be exported in the shell before starting the application.

## Run the Applications

Open two terminals from the repository root.

Start the backend in the first terminal:

```bash
cd backend
npm run start:dev
```

The backend is available at [http://localhost:3001](http://localhost:3001).
Its only current route is `GET /`, which returns the NestJS starter response
`Hello World!`.

Start the frontend in the second terminal:

```bash
cd frontend
npm run dev
```

The frontend is available at [http://localhost:3000](http://localhost:3000).

Example frontend override:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Example backend overrides in PowerShell:

```powershell
$env:PORT = '3010'
$env:FRONTEND_URL = 'http://localhost:3000'
npm run start:dev
```

When the backend port is changed, update `NEXT_PUBLIC_API_URL` to match it.

## Database Development

The backend uses PostgreSQL with TypeORM.

Database schema changes are managed through version-controlled migrations.
Automatic TypeORM schema synchronization is disabled.

### Start the Development Database

Start the configured PostgreSQL development environment:

```bash
docker compose up -d
```

### Run Migrations

From the `backend/` directory, apply the pending migrations:

```bash
npm run migration:run
```

Other migration commands are available for inspecting, creating, generating,
and reverting migrations:

```bash
npm run migration:show
npm run migration:create -- src/database/migrations/MigrationName
npm run migration:generate -- src/database/migrations/MigrationName
npm run migration:revert
```

## Optional Local Services

The Compose file also starts RabbitMQ for future application integration.

```bash
docker compose up -d
```

Available service endpoints:

- PostgreSQL: `localhost:5432` (`food_ordering` database, `postgres` user,
  `postgres` password)
- RabbitMQ: `localhost:5672`
- RabbitMQ Management UI: [http://localhost:15672](http://localhost:15672)
  (`guest` / `guest`)

The Compose service names are `postgres` and `rabbitmq`; the local container
names are `foss-postgres` and `foss-rabbitmq`.

Check or stop the services:

```bash
docker compose ps
docker compose down
```

To also remove the local data volumes:

```bash
docker compose down -v
```

## Useful Commands

### Backend

```bash
cd backend
npm run build
npm run lint
npm run format:check
npm test
npm run test:e2e
```

### Frontend

```bash
cd frontend
npm run lint
npm run format:check
npm run build
```

## Current Implementation Status

- Frontend: default Next.js starter page; no food ordering screens are
  implemented yet
- Backend: NestJS starter endpoint at `GET /`, with CORS configuration and
  starter unit/e2e tests
- API client: backend base URL constant exists in `frontend/libs/api.ts`, but
  no requests are currently made from the UI
- Database: PostgreSQL is configured through TypeORM and managed with
  version-controlled migrations
- Messaging: RabbitMQ is available through Docker Compose, but is not yet
  connected to the backend
- Authentication, menus, carts, orders, payments, and order tracking: not yet
  implemented

Update this README and the relevant environment documentation whenever a new
runtime dependency, service, or configuration variable is introduced.
