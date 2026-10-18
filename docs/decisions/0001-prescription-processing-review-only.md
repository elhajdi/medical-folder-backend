# ADR 0001: Review-only prescription processing slice

## Status

Accepted for the prototype only.

## Decision

- Extend the existing authenticated document upload route and run prescription
  processing inline, without adding a queue.
- Validate upload extension, MIME type, size, and PDF/JPEG/PNG signatures before
  persisting to the existing development-only local document store.
- Separate OCR behind `OcrProvider`; the runtime binding is `disabled` and
  fails closed. The test suite uses a deterministic fake; it is not a runtime
  OCR implementation.
- Keep OCR page text in memory only. Persist one owner-scoped candidate record
  per prescription document with status, provider metadata, timestamps,
  confidence, warnings, and page provenance for at most 24 hours. Every
  returned candidate requires patient review and never creates a medication or
  reminder.
- Scope all status and extraction reads and processing retries to the
  authenticated owner; use the document ID as a unique idempotency boundary.

## Consequences and unresolved gates

- The existing local upload persists original files on backend disk; this
  preserves current prototype behavior and does not implement the documented
  Drive-first architecture. Google Drive remains a fail-closed placeholder.
- Candidate fields, including instructions, contain sensitive health data and
  are persisted in the patient database temporarily. The prototype purges them
  at expiry; database-native TTL and downtime-safe physical purge are not
  implemented. A retention, deletion/export, and patient disclosure policy
  needs privacy/legal approval before real-data use.
- No actual OCR is available until a reviewed provider implementation is
  configured. `OCR_PROVIDER=disabled` produces a visible `OCR_UNAVAILABLE`
  failure rather than fabricated results.
- Malware scanning, encrypted transient workspaces, purge controls, production
  job execution, and Moroccan legal/clinical approvals remain out of scope.
