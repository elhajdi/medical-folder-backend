# Stage 3 Google Drive and privacy runbook

## Current implementation status

This prototype is **not production-ready** and must use synthetic data only.
`GET /api/v1/cloud-connections/status` is an authenticated capability endpoint;
it reports Google Drive and anonymous-data processing as disabled. It does not
report a user's connection state.

- The provider-neutral cloud-storage contract includes user-selected uploads.
- The Google Drive provider still fails closed. There is no OAuth authorization
  or callback, Google API client, token encryption/store, upload, token revoke,
  per-user connection record, or cloud-backed document listing/download.
- The existing `/api/v1/documents/upload` endpoint still stores a backend-local
  copy. It remains a development-only behavior and is not replaced by Drive.
- The confirmed-observation pipeline checks review status and forwards only
  category/value/unit to a privacy gateway. It is disabled by default, is not
  connected to prescription confirmation, and has no database writer.
- The anonymization gateway continues to return `null`. No observation is
  written; no anonymization or legal compliance claim is made.

## Local file migration (future work)

Do not run a bulk migration or delete local files as part of deployment.

1. Keep the service in maintenance/read-only mode and take an encrypted,
   access-restricted backup with its documented expiry.
2. Inventory metadata and local paths without placing filenames or clinical
   content in logs. Reconcile file hashes and owners using authorized internal
   access.
3. Wait for approved OAuth, a least-privilege Drive scope, a secure credential
   store, upload limits, malware/content checks, and a per-owner migration flow.
4. Obtain explicit user authorization for each source and destination. Upload
   one file at a time; verify Google-confirmed file ID, size, content type, and
   persisted owner-scoped metadata before marking that item migrated.
5. Make retries idempotent. On any mismatch, retain the original local file and
   show a safe failure status; do not report success.
6. Let the user review completion and separately confirm removal of each local
   copy. Preserve rollback/restore capability until the approved retention
   window expires. Never delete the user's Google Drive source on account
   deletion; that would require a separate explicit confirmation.

## Retention, deletion, and recovery

- Local source uploads are a prototype exception and should not receive real
  health data. Their retention must be decided and communicated before any
  pilot. Do not treat `UPLOAD_DIR` as a production archive.
- Prescription extraction candidates follow the existing maximum 24-hour
  retention behavior described in
  [`src/processing/processing-data-policy.md`](../src/processing/processing-data-policy.md).
- A future account-deletion flow must stop jobs, purge temporary bytes/OCR and
  candidates, revoke and remove provider credentials, delete account-linked
  records under an approved retention schedule, and preserve only legally
  required audit evidence. The current account API does not implement this.
- Account deletion must not delete originals in the user's Google Drive.
- Backups, local storage, queues, temporary directories, and logs need explicit
  retention, encryption, access, restore, and purge-failure procedures before
  production.

## Future Google OAuth and deployment prerequisites

Before enabling a Google integration, complete and review all of the following:

- Register an OAuth application and configure exact HTTPS redirect URIs,
  authorized domains, consent-screen text, and app verification as applicable.
- Select the narrowest scope that supports the user-authorized upload flow;
  document why each requested scope is required. Do not request broad Drive
  access by default.
- Implement one-time OAuth state/CSRF validation, cancellation and revoked-token
  handling, retries/idempotency, quota/rate limits, request timeouts, and safe
  provider error mapping.
- Store refresh/access credentials encrypted using an approved secrets/key
  management design. Restrict access, define rotation and revocation, and never
  return or log token material.
- Protect API and database traffic with TLS, encrypt database/backups, restrict
  network and operator access, and use a reviewed secret manager. The
  `GOOGLE_DRIVE_*` values in `.env.example` are inert placeholders only.
- Limit uploads by size and supported type, validate signatures, treat contents
  as untrusted, and avoid a permanent backend copy. Ensure temporary buffers or
  files are bounded and cleaned on every path.
- Test connection ownership, CSRF/state replay, API failures, expired/revoked
  tokens, quotas, transient errors, duplicate uploads, safe responses/logs, and
  cleanup using mocked provider calls and synthetic files.

## Anonymous-data gate

Keep `ANONYMOUS_DATA_PIPELINE_ENABLED=false`. A future enablement decision
requires a documented purpose, independently reviewed field allowlist,
re-identification risk assessment, separate destination and credentials, and
legal/privacy/security sign-off. Removing names alone is not anonymization.
Reject unknown fields; do not store owner, job, document, token, exact-date,
free-text, or reverse-mapping fields. If review status is not confirmed, the
gateway is missing, it rejects, returns an unknown result, or errors, write
nothing.

## Morocco governance checklist (not a compliance assertion)

Qualified Moroccan legal, privacy, and security reviewers must assess and
document decisions on:

- applicable Law 09-08 and CNDP declarations/authorizations for sensitive
  health-data processing;
- purpose, lawful basis, consent/transparency, data-subject rights, and
  controller/processor roles;
- hosting, support access, backups, and international transfers;
- retention, deletion, backup expiry, incident/breach handling, and recovery;
- applicable Law 05-20 obligations and security controls;
- provider contracts, OAuth consent wording, user withdrawal, and audit scope.

No item in this checklist is a claim that the prototype complies with Moroccan
law or is approved for clinical or production use.
