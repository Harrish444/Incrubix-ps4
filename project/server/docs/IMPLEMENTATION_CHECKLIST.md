# Reachline implementation checklist

## Stage 1 assessment
- [x] Read the complete supplied IncuBrix Assessment 4 brief, including Must-haves, Integration Standard, Appendix A, hard cases, and submission requirements.
- [x] Inspect all existing files. The repository was an untouched Vite React TypeScript starter with no Reachline screens, routes, backend, database tables, tests, or documentation.
- [x] Preserve existing behavior where possible. The only existing behavior was the starter placeholder, so Reachline UI is being established without removing product functionality.

## Core / Must-haves
- [x] PostgreSQL-backed schema with RLS, indexes, foreign keys, jobs, idempotency, rules, imports, logs, renditions, and certification evidence.
- [ ] Express Node 20 API under `/api/v1` with structured errors and correlation IDs.
- [ ] Health and readiness endpoints.
- [ ] Durable job state and `GET /api/v1/jobs/{job_id}`.
- [ ] Six Appendix A connectors: Discourse, Lemmy, Dev.to, Ghost, signed webhook, assisted posting.
- [ ] Connector manifests and shared error map.
- [ ] Posting-rule checks before connector publishing.
- [ ] Required idempotency key and fingerprint conflict handling.
- [ ] Bounded retry behavior for timeout, 429, temporary failures, and permanent failures.
- [ ] Simulation mode through the same connector contract.
- [ ] Certification publish, verify, status, cleanup, and evidence history.
- [ ] Catalogue CRUD, CSV validation, duplicate detection, import reporting, and safe reachability checks.
- [ ] Content rendition tailoring and media/link/disclosure validation.
- [ ] OpenAPI 3.1 documentation.
- [ ] MinIO-compatible file upload/download contract.
- [ ] Docker Compose with PostgreSQL, MinIO, local test services, and health checks.
- [ ] Unit, contract, integration, and end-to-end test coverage for the listed hard cases.

## Integration Standard
- [ ] One-command startup and test documentation.
- [ ] JSON errors: `{ error: { code, message, retryable, details } }`.
- [ ] Environment-driven configuration with no committed secrets.
- [ ] Structured logs with timestamps, level, job ID, and correlation ID.
- [ ] Output manifests and batch runner.

## Advanced / Outstanding after Core
- [ ] Human-approved rule extraction.
- [ ] Relevance score/explanation and 150-destination catalogue.
- [ ] Three additional connectors.
- [ ] Destination recommendation and labelled precision measurement.
- [ ] Metrics normalization from at least three connectors.
- [ ] Recertification and automatic demotion.

## Verification status
This checklist is intentionally honest: checked items are implemented in the current workspace; unchecked items remain work in progress until code and tests verify them.
