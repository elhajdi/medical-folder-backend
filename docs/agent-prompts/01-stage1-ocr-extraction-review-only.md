# Stage 1 — OCR and Structured Extraction (Review Only)

Use this prompt in GitHub Copilot Chat in VS Code, preferably Agent mode.

## Role and approach
Act as a senior backend engineer working in the existing `medical-folder-backend` repository. First inspect the repository, README, framework, routes, services, database models/migrations, upload handling, configuration, and tests. Follow the existing conventions and propose a short plan before editing. Do not replace the framework or refactor unrelated code.

## Goal
Implement the first safe slice of the prescription OCR pipeline: upload a prescription, run OCR, parse structured candidate data, persist processing status, and expose the candidate data for patient review. This stage is review-only: do not confirm medication instructions, create medication plans, or schedule reminders.

## Requirements
1. Extend existing upload routes; if there is no established convention, use `POST /documents` with multipart upload.
2. Validate file size, MIME type, extension, and file signature where feasible. Reject unsupported or malformed files safely.
3. Follow the intended storage boundary in the existing architecture. Do not silently add permanent local storage or claim Google Drive works if its provider is a stub.
4. Create an OCR provider interface and keep OCR separate from parsing. Implement a real provider only if the repository has the required configuration; otherwise provide a clearly labelled adapter/interface and deterministic fake for tests. Never pretend a stub performs OCR.
5. Extract candidate fields where available: prescription date, clinician/facility (optional), medication name, strength, form, dose, route, frequency, duration, quantity, instructions, confidence, warnings, and source/page references needed for review.
6. Missing or uncertain values must remain unknown/null. Never guess medication directions. Keep raw source text distinct from normalized candidate values and avoid storing raw OCR text unnecessarily.
7. Persist status such as `queued`, `processing`, `needs_review`, or `failed`, plus timestamps and provider/version metadata. Reuse existing job patterns; do not add a heavyweight queue without justification.
8. Provide status and extraction retrieval endpoints using existing route conventions. Suggested fallback paths: `GET /documents/{documentId}/processing-status` and `GET /prescriptions/{prescriptionId}/extraction`.
9. Enforce authentication and object-level authorization: a patient must not access another patient's document or extraction.
10. Make retries idempotent where practical and avoid duplicate prescription records.
11. Use privacy-safe logs only: correlation ID, status, duration, provider/version, and error category. Never log medical text, document bytes, credentials, or tokens.
12. Use synthetic data only. Do not build anonymous-data persistence in this stage.

## Tests
Add tests for valid synthetic upload; unsupported/oversized/malformed files; OCR success/failure; missing and ambiguous fields; low confidence requiring review; retry/idempotency; cross-patient access denial; safe errors; and API schema validation. Tests must run without paid API credentials.

## Deliverables and acceptance
- Code and migrations if needed.
- Automated tests, `.env.example` variable names without secrets, and API/provider documentation.
- Candidate data is retrievable only by its owner and is never marked confirmed or used for reminders.
- Errors are visible through safe status responses.
- Final report lists architecture found, changed files, tests and results, configuration needed, and unresolved gaps.

Implement Stage 1 only. Run relevant tests, formatter, and linter. Fix failures rather than skipping tests. Do not commit or push unless explicitly asked. Clearly distinguish working code from mocks/stubs.
