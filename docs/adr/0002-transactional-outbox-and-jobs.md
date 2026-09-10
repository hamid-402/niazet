# ADR 0002: Database-backed outbox and job runner

Status: Accepted — Phase 3

PostgreSQL is the source of truth for background work. Outbox rows are claimed with `FOR UPDATE SKIP LOCKED`, retried with exponential backoff, dead-lettered after the configured attempt limit, and recorded per consumer for idempotency. Recurring jobs use interval-bucket run keys with a unique database constraint.

Consequences: multiple API replicas can safely run workers; operations can inspect job runs and dead letters; a separate queue may replace the runner later without changing domain event producers.
