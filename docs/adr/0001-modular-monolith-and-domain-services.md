# ADR 0001: Modular monolith with domain services

Status: Accepted — Phase 3

The API remains a NestJS modular monolith. Authentication is split into token and session services. Order orchestration remains behind `OrdersService` as a compatibility facade while workflow, assignment, messaging, and dispute rules live in dedicated domain services. This keeps transactions local and avoids premature distributed-system complexity.

Consequences: controllers keep a stable API; domain rules can be tested independently; further extraction must preserve the transaction client boundary.
