# ADR 0002: Stage 3 cloud storage and anonymous-data safety boundaries

## Status

Accepted for the prototype only. Google Drive OAuth and anonymous-data writes
remain disabled and unimplemented.

## Decision

- Keep `CloudStorageProvider` provider-neutral, including a user-selected upload
  operation, and keep Google Drive methods fail-closed until OAuth, credential
  storage, ownership checks, quotas, retries, and security review are complete.
- Expose an authenticated capability/status endpoint that reports the current
  integration state. It is not a user's connection status and does not imply a
  Google account is connected.
- Require confirmed review status before the anonymous-data pipeline can call
  a privacy gateway. Send only category, value, and unit to that gateway; never
  pass patient IDs, source IDs, narratives, or exact dates.
- Keep the anonymous-data pipeline disabled by default. A null/rejected gateway
  result causes no write, and a gateway exception propagates without writing.
  There is no anonymous database or writer configured in this prototype.
- Keep the existing local document-upload path development-only. Do not delete
  or move existing local files automatically.

## Consequences and unresolved gates

- `GET /api/v1/cloud-connections/status` reports global capability state only.
  Per-account connection and upload status cannot be reported until a reviewed
  OAuth/token store and persistent connection model exist.
- The Google Drive provider still throws for all operations; the new upload
  contract is architectural, not a live provider implementation.
- Existing local source documents are not migrated. A future migration must
  inventory files and metadata, obtain user authorization, validate every file,
  upload and verify provider confirmation, persist provider metadata, and only
  then offer an explicit user-reviewed local-copy deletion step. Keep backups
  and rollback paths; never auto-delete during migration.
- The privacy gate is not anonymization. The pipeline is not wired to user
  confirmation routes or any persistent destination, and no allowlist or
  re-identification review has been approved.
- Google OAuth consent, token encryption/storage, token revocation, account
  deletion, temporary-file handling, deployment hardening, and Moroccan
  legal/security/privacy review remain prerequisites for real-data use.
