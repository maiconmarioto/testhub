# API Go Architecture

This service is a modular monolith. It builds one deployable binary, but code is
organized by bounded context and private platform adapters.

## Layout

- `cmd/api`: process entrypoint only.
- `internal/app`: composition root, routing, shared application types, and current handlers.
- `internal/app/modules/*`: bounded-context home for extracted application services.
- `internal/platform/*`: infrastructure adapters such as Postgres, crypto, and HTTP server glue.
- `internal/contracts/openapi`: API contract artifacts and contract-test fixtures.

## Rules

- No package outside this module imports `internal/*`.
- HTTP handlers stay thin: parse request, call application service, write response.
- Domain and tenancy checks live in the relevant module, not in frontend code.
- Postgres is the only data source.
- Run dispatch uses Postgres jobs only.
- Redis is intentionally absent from this service.
