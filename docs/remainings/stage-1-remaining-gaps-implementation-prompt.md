# Implementation Prompt — Stage 1 Remaining Gaps

Paste the prompt below into GitHub Copilot Chat in VS Code (Agent mode) from
the `medical-folder-backend` repository.

---

## Role and operating rules

Act as a senior backend engineer implementing the unfinished production-safety
work for Stage 1 prescription OCR and structured extraction. First read
`AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/solution-architecture-v1.1.md`,
`docs/medical_folder_solution_architecture_v1.2.md`,
`src/processing/processing-data-policy.md`,
`docs/decisions/0001-prescription-processing-review-only.md`, the current API
documentation, and the relevant source, Prisma schemas/migrations, and tests.
Follow the repository's existing NestJS, Prisma, authentication, audit, storage,
and testing conventions. Propose a concise implementation plan and acceptance
criteria before making substantial changes.

Do not replace the framework, refactor unrelated code, commit, push, or apply a
destructive migration. Preserve unrelated user changes. Use synthetic data
only.

## Current Stage 1 baseline

The prototype already has:

- An authenticated multipart document upload route with PDF/JPEG/PNG
  extension, MIME, size, and signature checks.
- Owner-scoped processing status and extraction retrieval, processing retry,
  audit events, upload deduplication, and a one-extraction-per-document
  idempotency boundary.
- A typed OCR provider interface whose runtime provider is explicitly disabled.
  There is no working OCR integration. The deterministic fake is test-only.
- A conservative labeled-field parser; unknown and ambiguous values stay null.
  Candidates are always `needs_review` and never create medications or
  reminders.
- Candidate expiry configured by `EXTRACTION_RETENTION_HOURS` and capped at
  24 hours. Cleanup is currently application-driven at startup, once per
  minute, and before read requests.
- Development-only local disk upload storage. The documented Google Drive
  provider is a fail-closed placeholder.

Treat these as starting facts to verify against current code, not permission to
assume no intervening changes.

## Goal

Close the remaining implementation gaps without weakening the privacy, security,
and clinical-safety boundaries. Deliver only work that can be safely
implemented without organizational, legal, privacy, residency, security, or
clinical approval. Make unavailable integrations fail closed and report them
as blockers instead of claiming they work.

## Required implementation areas

### 1. Robust candidate and temporary-data retention

- Replace best-effort process timers as the sole retention guarantee with a
  durable, operationally reliable cleanup mechanism appropriate to this
  repository's deployment model. Do not add a heavyweight queue without
  justification.
- Ensure candidate fields are removed by the configured expiry on success,
  failure, retry, cancellation, and account/document deletion, while retaining
  only the minimum safe status and error metadata needed by the API.
- Ensure retries do not extend the retention period of an existing candidate.
- Prevent status or extraction APIs from returning expired candidate data even
  if a cleanup worker is delayed or unavailable.
- Ensure startup, worker shutdown, database errors, and purge failures have
  observable, privacy-safe handling. Do not log health data, OCR text, raw
  exception messages, document bytes, filenames, credentials, or tokens.
- Keep database migrations additive. If the deployment database cannot provide
  native TTL, document the chosen cleanup guarantee and its limitations.

### 2. Private storage boundary and file lifecycle

- Keep provider-specific object-storage code behind the existing
  `CloudStorageProvider` or a narrowly scoped existing storage abstraction.
- Do not claim Google Drive, object storage, malware scanning, or encrypted
  transient workspaces are implemented unless a reviewed, tested implementation
  and required configuration already exist.
- Until an approved private storage provider is available, preserve explicit
  development-only local storage behavior; make production startup or
  processing fail closed where appropriate rather than silently persisting
  sensitive originals to a new location.
- Harden document file lifecycle handling: path integrity, missing files,
  safe physical deletion, partial-upload/database-failure cleanup, restrictive
  permissions where supported, and no accidental response of internal
  `storageKey`.
- Do not download, upload, delete, or modify cloud originals through the
  existing stub. Do not add a new external provider or transmit health data
  without explicit approved architecture and privacy/legal/security review.

### 3. Upload and processing abuse controls

- Review request/body/file limits, safe multipart error responses, upload
  concurrency/resource use, malformed-file cases, and processing timeouts.
- Add malware scanning only if a reviewed local/scanning implementation and
  configuration are available. Otherwise keep processing fail-closed for
  unscanned files and document the blocker; do not pretend signature checks are
  malware scanning.
- Keep uploaded bytes and OCR page text out of logs, traces, caches, and
  persistent columns. Keep OCR and parser errors user-safe, with diagnostic
  correlation IDs and error categories only.
- Add or extend rate limits for upload and retry endpoints using repository
  conventions, without weakening authentication or owner checks.

### 4. OCR provider readiness

- Inspect configuration and existing integrations before selecting an OCR
  implementation.
- If no provider has already been privacy-, residency-, legal-, and
  security-approved with usable configuration, leave runtime OCR disabled and
  implement only the provider contract, validation, timeout/error handling, and
  deterministic test fake as needed.
- Do not add a paid or third-party OCR SDK, enable SaaS processing, or send
  health data outside the application without explicit approved architecture
  and legal/privacy review.
- Do not use the test fake in production or return success-shaped placeholder
  OCR output.
- Keep source text transient. Candidate values must remain unconfirmed and
  review-only.

### 5. Owner, audit, deletion, and API contract coverage

- Verify every document/extraction/status/retry query is scoped to the
  authenticated owner and that related-record joins also enforce owner
  association.
- Add negative cross-patient tests for every affected resource endpoint.
- Ensure creation, read/access, retry, purge, and deletion audit events contain
  only approved metadata and never medical content.
- Ensure deleting a document or account also removes candidate records and
  temporary artifacts in a privacy-safe, idempotent manner. Do not delete
  cloud originals without a separate explicit confirmation and implemented,
  authorized provider support.
- Update OpenAPI and `docs/api-overview.md` for all API behavior changes.

## Non-negotiable safety requirements

- Never use real patient data, sample payloads, OCR text, or real health
  documents. Tests must use clearly synthetic records.
- Never diagnose, recommend treatment/medication changes, or present OCR output
  as clinical advice. Never mark candidate instructions confirmed or use them
  for medication plans/reminders.
- Every record access must be scoped to authenticated `ownerId`.
- Do not persist raw OCR text or original files beyond an explicitly approved
  policy. Do not enable external AI/OCR, analytics, email/SMS/push, or cloud
  storage without required approvals.
- Do not write anonymous health data in this stage.
- Do not claim legal compliance, production readiness, malware scanning, cloud
  storage, or OCR unless implemented and verified.
- Clearly report decisions requiring human privacy, legal, security, residency,
  operations, or clinical approval. Do not decide those on the user's behalf.

## Tests and validation

Add or update tests for:

- Candidate expiration and deletion on all applicable terminal/lifecycle paths,
  including cleanup delay or failure behavior.
- Expired candidates never being returned even before the cleanup worker runs.
- No retry extending retention; duplicate upload/retry idempotency.
- Missing source files, unsafe storage keys, partial write cleanup, oversized
  and malformed uploads, multipart errors, and safe API errors.
- OCR timeout, unavailable provider, provider error, malformed provider output,
  and the deterministic fake's success path.
- Rate limit behavior where it can be tested without brittle timing.
- Cross-patient denial for status, extraction, retries, upload deduplication,
  deletion, and all other touched resource routes.
- Audit coverage and absence of sensitive payloads in logs/audit metadata.
- No candidate confirmation, medication creation, or reminder scheduling.
- OpenAPI/API schema validation for changed endpoint inputs and responses.

Run the relevant unit/integration tests, `npm run build`, format checks, lint,
and Prisma schema validation. Run migration checks appropriate to the local
environment without applying destructive migrations or touching a
non-local database. Fix failures caused by this work; report missing tooling or
unavailable external approvals honestly rather than skipping or claiming a
check passed.

## Deliverables and final report

Implement the smallest coherent set of approved code changes and update
`README.md`, `docs/api-overview.md`, `src/processing/processing-data-policy.md`,
and a decision record when the contract or architecture changes.

In the final report list:

1. Architecture and current provider/storage implementations found.
2. Each remaining gap implemented, explicitly deferred, or blocked.
3. Changed files and migrations.
4. Commands actually run and exact test/build/lint/format/schema results.
5. Required configuration, without secrets.
6. Unresolved privacy, Moroccan legal/CNDP, residency, security, retention,
   malware-scanning, operational, and clinical-safety decisions.
7. A clear distinction between working code, test fakes, disabled adapters,
   stubs, and approved external services.

Do not commit or push.
