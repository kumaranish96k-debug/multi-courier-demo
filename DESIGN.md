# Design

## Architecture

NestJS exposes one REST contract under `/api/v1/orders`. `OrdersController` validates requests and delegates to `OrdersService`. The service owns idempotency, persistence, provider invocation, status changes, and tracking-history writes. `CouriersService` is the adapter registry; each provider implements the same `CourierAdapter` interface. The included `MockCourier` demonstrates a second provider without changing routes or business flow.

This is the Adapter pattern with a discovery-based registry. Provider translation belongs at the boundary, so courier-specific fields, authentication, retries, and response normalization do not leak into DTOs or order logic. `CouriersService` discovers Nest providers marked with `@CourierAdapterProvider()`. A new integration adds an adapter and one provider registration in `CouriersModule`; routes, DTOs, and service business logic stay unchanged.

Bulk create returns a persisted batch identifier in the response's `id` field and enqueues a BullMQ job. A worker processes each batch in configurable chunks, allowing mixed couriers and partial success. It updates the batch result list after each chunk. This keeps request latency independent of courier calls and lets Redis retry/recover jobs. Repeated order IDs with the same courier and payload return the existing shipment; reusing an ID with different content returns `409 IDEMPOTENCY_KEY_REUSED`. A newly reserved order is marked `SUBMITTING` until the provider confirms creation. An ambiguous timeout or 5xx becomes `RECONCILIATION_REQUIRED`, and the same key is never sent again automatically. UrbaneBolt's published contract does not document idempotency keys or lookup by client order ID, so cross-system exactly-once recovery requires that capability from the provider or a manual reconciliation before any retry.

## Persistence

* `orders`: UUID internal primary key, unique client `order_id`, courier key, courier shipment ID, AWB, normalized status, normalized input, full outbound request, full provider response, failure code, and timestamps.
* `tracking_history`: UUID event with internal order reference, normalized status, raw provider payload, and database timestamp. The application only inserts events; the current migration does not enforce append-only behavior with database triggers. It is separate from the mutable current status.
* `order_batches`: UUID, input snapshot, request ID, status, per-order result JSON, and timestamps.

PostgreSQL JSONB retains audit payloads without coupling the schema to one courier. The adapter prepares the exact shipment request record, which is persisted before the network call so failed attempts retain the outbound payload. TypeORM synchronization is disabled in every environment; schema changes are applied with versioned migrations.

## Errors and resilience

Every successful HTTP response is wrapped by a global interceptor as `{ success: true, data }`. A global exception filter formats errors as `{ success: false, error: { code, message, details?, requestId } }`. Input failures are 400, unknown courier responses list supported keys, provider rejections are mapped to `COURIER_REQUEST_REJECTED`, and network/5xx exhaustion maps to `COURIER_UNAVAILABLE`. Raw provider error bodies are excluded. Retry-enabled courier operations use exponential backoff; expired auth retries once after re-authentication. Manifest creation is not retried after an ambiguous outcome because a duplicate shipment cannot be ruled out without provider idempotency support. Transport errors and 5xx responses on that operation are retained as `RECONCILIATION_REQUIRED`; definite provider rejections and recognized local credential failures are `FAILED`. Provider failures and other server failures are logged with request/order context and stack traces.

## Trade-offs and assumptions

The assignment does not describe a callback/webhook contract, so tracking history is appended when a tracking poll or create/cancel operation returns a status. A scheduled polling or webhook consumer can be added behind the same persistence service. The supplied UAT examples provide manifest, tracking, and cancellation request details, which are reflected in the adapter. The full authentication response/session behavior and manifest response format remain unverified; the manifest's non-key fields also pass through rather than being translated from a courier-agnostic domain schema. Confirm these details against the account-specific UAT collection before enabling live shipments. Existing databases need a reviewed forward/baseline migration if their schema or migration history differs from this repository; never drop existing tables to force the initial migration. Credentials are environment-only. The demo `mock` adapter is deterministic and intended for local flows, not a production courier.
