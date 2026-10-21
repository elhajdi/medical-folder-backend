# Stage 3 — Google Drive Storage and Fail-Closed Privacy Pipeline

Prerequisite: Stages 1 and 2 are implemented and their tests pass. Use GitHub Copilot Chat in VS Code, preferably Agent mode.

## Role and approach

Continue as a senior backend engineer with security/privacy experience in `medical-folder-backend`. Inspect the existing Google Drive adapter, OAuth flow, upload endpoint, local storage, database references, account deletion, anonymization gateway, configuration, and tests. Identify placeholders (including adapters that throw “not implemented” and anonymizers that return `null`). State a short plan before editing.

## Goal and separate data flows

A. Source document copy → the patient's explicitly connected Google Drive folder.
B. Confirmed, minimized extracted data → privacy/anonymization gate → separate destination only if the gate explicitly approves it.

The backend should not become permanent source-document storage if the intended architecture requires source documents to live in the patient's Drive.

## Part A — Google Drive

1. Implement a provider interface and Google Drive adapter, leaving room for a future Microsoft provider without implementing Microsoft now.
2. Implement the supported OAuth 2.0 authorization flow. Use the narrowest scope that supports required operations. Never ask for or store Google passwords.
3. Store tokens using the project's secure token/secret storage approach; encrypt at rest where supported. Never log or return tokens.
4. Create/find a dedicated application folder and upload the source document. Persist only required metadata: provider file/folder ID, status, timestamps, content type/size, and safe error category.
5. Handle OAuth cancellation, expired/revoked tokens, quota/rate limits, transient failures, retries, and duplicate-upload/idempotency. Report success only after Google confirms upload and the file ID is persisted.
6. Use temporary files only if needed, with strict limits, private permissions, and guaranteed cleanup on success and failure. Do not retain a second permanent copy on backend disk.
7. Add connection/upload status APIs following current conventions. Do not expose tokens, private paths, or raw provider errors.
8. Document a safe migration process for existing locally stored documents. Do not automatically delete existing files.

## Part B — privacy and anonymous-data boundary

1. If the existing anonymization gateway returns `null` or is a stub, keep the pipeline fail-closed and explicitly mark it non-production-ready until implemented and reviewed.
2. Removing names/emails alone is not anonymization. Dates, rare conditions, locations, narratives, document IDs, and combinations of fields may identify a person.
3. Add a replaceable pipeline for minimization, field allowlisting, privacy review, and destination storage. Only confirmed records may be considered.
4. If the privacy gate returns null, errors, uncertainty, or rejection, write **nothing** to anonymous storage. Default the pipeline to disabled until explicitly configured and approved.
5. Keep identifiable account/auth/Drive/audit records separate from anonymous data. Do not create an ordinary application crosswalk that reconnects anonymous rows to patients.
6. Document account deletion and retention. Do not promise that medical data can remain after account deletion unless validated anonymization, a lawful basis, and a retention decision have been established.
7. Do not send source documents or raw OCR text to external AI providers unless the configured data flow and consent/policy explicitly allow it.

## Part C — security, operations, Morocco governance

1. Update `.env.example` with variable names and safe placeholders only.
2. Add privacy-safe logs/metrics, upload quotas and rate limits using existing patterns. Never log medical contents, tokens, or raw provider payloads.
3. Document retention/deletion, token revocation, backup boundaries, recovery, and incident-response assumptions.
4. Add a Morocco governance review checklist, not a compliance claim. Request qualified legal/security/privacy review of applicable Law 09-08/CNDP requirements, sensitive health data, consent/transparency, controller/processor roles, hosting location, international transfers, retention, and breach handling.
5. Add deployment guidance for Google OAuth consent setup, redirect URIs, secret management, TLS, database protection/backups, access controls, and quotas.
6. Use synthetic test data only.

## Tests

- Google adapter tests with mocked API and no real credentials.
- OAuth state/CSRF validation and account ownership checks.
- No token/sensitive-content leakage in logs or API responses where testable.
- Upload success, cancellation, expired/revoked token, quota and transient failures.
- Retry/idempotency and temporary-file cleanup on all paths.
- No permanent backend source copy after successful upload, according to the chosen design.
- Privacy gate null/error/unknown/rejected causes zero anonymous-storage writes.
- Only confirmed records and allowlisted fields reach the privacy gate.
- Account deletion/revocation and disabled-by-default behavior.
- Regression tests for Stages 1 and 2.

## Deliverables and acceptance

- Working Google Drive integration, or clearly isolated tested components plus a precise list of external setup still required.
- Migrations and safe local-file migration guidance.
- Separate fail-closed privacy pipeline and tests.
- Updated `.env.example`, architecture/data-flow documentation, API examples, runbook, and Morocco governance checklist.
- Report what is truly implemented, mocked/stubbed, configuration still needed, test results, and unresolved legal/security/privacy risks.

## Postman collection

- update postman collection to call these new endpoints

Implement Stage 3 only. Do not implement medication reminders or unrelated features. Run tests, linting, migrations, and relevant security checks. Do not commit or push unless explicitly asked. Be honest about stubs and do not claim compliance or anonymization without validation.
