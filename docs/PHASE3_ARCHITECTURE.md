# Phase 3 — Architecture, contracts, and background processing

## Delivered

- Auth token/session boundary and order domain services for workflow, assignment, messaging, and disputes.
- PostgreSQL transactional outbox with row claiming, retries, exponential backoff, dead-letter state, and idempotent delivery records.
- Nine database-coordinated workers with observable runs and a super-admin manual-run endpoint.
- Revocable signed-URL grants, durable notification delivery, and query-driven database indexes.
- Shared API contract types, standard error envelope, correlation IDs, and pagination helper.
- Central web request layer with deduplication, cache, retry, cancellation, stable mutation idempotency, and refresh single-flight.
- Same-origin BFF plus SSR/ISR service catalog pages.
- Typed startup configuration and corrected production command.

## Operations

- `GET /v1/admin/jobs` lists registered jobs.
- `POST /v1/admin/jobs/:name/run` runs a job once; only `super_admin` can call it.
- Inspect `background_job_runs`, `outbox_events`, and `outbox_deliveries` for runtime status.
- Set `BACKGROUND_JOBS_ENABLED=false` for API instances that must not execute workers.
