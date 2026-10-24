# Multi-Courier Integration Platform

Courier-agnostic NestJS API with UrbaneBolt as the first provider adapter and a deterministic `mock` adapter for local demos. PostgreSQL stores orders, audit payloads, batch state, and append-only tracking history. Redis/BullMQ handles bulk creation asynchronously.

## Source layout

```text
src/
  app.module.ts             # root dependency composition
  main.ts                   # Fastify bootstrap and global HTTP behavior
  config/                   # environment validation and infrastructure config
  common/                   # shared filters and domain-safe errors
  database/
    entities/               # one TypeORM entity per table
    enums/                  # shared persisted enums
    migrations/             # versioned schema changes
  modules/
    orders/                 # REST API, DTOs, service, BullMQ worker
    couriers/               # adapter contract, registry, provider adapters
    health/                 # database/Redis readiness endpoint
```

Feature modules own their controllers and business logic. Cross-cutting concerns belong in `common/`; runtime configuration is centralized in `config/`; provider-specific transformations stay inside `modules/couriers/adapters/`.

## Run locally

Requirements: Node.js 22+, Yarn, Docker Compose. Copy `.env.example` to `.env`, set database/Redis values and UrbaneBolt credentials if using that adapter, then start dependencies and the API:

```sh
cp .env.example .env
docker compose up -d postgres redis
yarn install
```

Schema synchronization is disabled in all environments. Apply the reviewed migration before starting the API:

```sh
yarn migration:run
yarn start:dev
```

The API listens on `http://localhost:3000/api/v1`; `GET /health` checks PostgreSQL and Redis.

In the production image, build first, then apply migrations with `yarn migration:run:prod` as a release step before rolling out the new application version. Do not run schema migrations concurrently from every replica.

If a database already contains application tables or TypeORM migration records, stop before running the initial migration. Compare the live schema and `migrations` table with the repository history, then create a reviewed forward or baseline migration that matches that database. Do not drop tables or delete migration records to make the initial migration pass; take a backup and rehearse the forward migration against a copy first.

### Generate and run migrations

After changing an entity, generate a migration by comparing the entity metadata with the connected database schema. The database must be running and the `DATABASE_*` values in `.env` must point to the intended database:

```sh
yarn migration:generate src/database/migrations/DescribeYourChange
```

Review the generated SQL before applying it. Then check which migrations TypeORM sees and run pending migrations:

```sh
yarn migration:show
yarn migration:run
```

Migration generation does not happen automatically when entities change. It creates a migration only when TypeORM finds a schema difference. Do not generate another initial schema migration if the database already has the initial schema; use a new descriptive migration name for subsequent changes.

## Configuration

See [.env.example](.env.example) for the full list. Database and Redis connection settings, API prefix/host/port, Fastify body limit, proxy trust, compression threshold/levels, database pool settings, batch limits/concurrency, and UrbaneBolt base URL, credentials, timeout, and retry count are environment-driven. Fastify negotiates Brotli, gzip, or deflate when the client sends `Accept-Encoding`; responses smaller than the configured threshold stay uncompressed to avoid unnecessary CPU work. Production startup requires explicit database and Redis host/user/password/name settings. Never commit `.env` or live credentials.

## API

Every successful endpoint uses `{ "success": true, "data": ... }`. Every failed endpoint uses `{ "success": false, "error": { "code", "message", "details?", "requestId" } }`.

* `POST /api/v1/orders` — create one shipment. Body: `courier_partner`, unique `order_id`, `payload` (currently passed through to UrbaneBolt; see integration assumptions).
* `GET /api/v1/orders/:order_id/track` — use the courier saved on the order, update current status and append the raw tracking event. No courier identifier is needed in the path or body.
* `POST /api/v1/orders/:order_id/cancel` — cancel through the courier saved on the order and record the status event. No request body is required.
* `POST /api/v1/orders/bulk` — accept up to `BULK_MAX_ORDERS` (default 100); returns the batch progress envelope immediately (`data.id` is the batch ID).
* `GET /api/v1/orders/bulk/:batch_id` — poll queue state and per-order outcomes using that ID.

Both bulk endpoints return a consistent progress envelope. While orders are pending, they appear as `PROCESSING`; completed items include their final status and AWB, while failures include a normalized error:

```json
{
  "success": true,
  "data": {
    "id": "generated-batch-uuid",
    "status": "PROCESSING",
    "totalOrders": 2,
    "successfulOrders": 1,
    "failedOrders": 0,
    "orders": [
      { "clientOrderId": "BULK-1001", "status": "CREATED", "awb": "AWB-BULK-1001" },
      { "clientOrderId": "BULK-1002", "status": "PROCESSING", "awb": null }
    ]
  }
}
```

Single creates are idempotent by `order_id`; an identical retry returns the stored order without another courier call, while reusing an ID with a different courier or payload returns `409 IDEMPOTENCY_KEY_REUSED`. A bulk request rejects duplicate IDs within that batch. Concurrent batch work is bounded by `BULK_CONCURRENCY`; individual failures are reported in results while successful orders remain committed. Courier create requests are persisted before being sent. UrbaneBolt manifest requests are not retried after an error that could have an ambiguous outcome (such as a network failure or 5xx), because the contract does not document provider-side idempotency. Such orders are marked `RECONCILIATION_REQUIRED`; reconcile with the courier before any manual retry. Tracking events are appended by the application, but the current migrations do not add database triggers to prevent direct update/delete operations. Tracking and other retry-enabled courier operations use exponential retry; auth 401/403 triggers one re-authentication and retry. Courier 4xx errors are normalized and raw courier error bodies are not exposed to clients.

## Add a courier

Implement `CourierAdapter` in `src/modules/couriers/courier.interface.ts`: `create`, `track`, and `cancel` map the internal order contract to that provider's API and return normalized values. Mark the class with `@Injectable()` and `@CourierAdapterProvider()`, then add the class to the providers array in `CouriersModule`. `CouriersService` discovers marked providers at startup, so its registry and order business logic do not need edits. Provider URLs and credentials belong in environment configuration. Add the provider key to `.env.example` and a Postman example.

## UrbaneBolt integration assumptions

The supplied UAT examples identify the manifest path (`/api/v1/manifest/`), tracking path (`/api/v1/services/tracking-pub/?awb=...`), and cancellation path/body (`/api/v1/services/cancel/`, `{ "awbs": "..." }`). The adapter sends the manifest as a one-element array, takes `orderNumber` from the internal `order_id`, and takes `customerCode` from `URBANEBOLT_CUSTOMER_CODE` or `payload.customerCode`; other manifest fields currently pass through. Tracking uses the stored AWB, and cancellation sends that AWB in `awbs`. Authentication sends optional `URBANEBOLT_COOKIE` to the auth endpoint, then forwards a bearer token and response cookies when available. The full manifest response format and exact auth response/session behavior are still unverified, and manifest fields are not yet validated as a courier-agnostic internal schema. Verify those details against the account's UAT collection before production use. Never copy sample tokens or cookies into source control.

## Verification

`yarn build` compiles the application. There is currently no test directory or configured test command.
