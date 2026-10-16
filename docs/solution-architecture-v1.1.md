# Medical Folder — Solution Architecture

**Version:** 1.1  
**Date:** 13 October 2026  
**Status:** Architecture update — not a production security or compliance approval

## 1. Executive summary

Medical Folder is a backend for organizing patient-authorized medical information. The initial cloud source is **Google Drive**. The design keeps original prescriptions, laboratory results, imaging reports, and other source documents in the patient's own cloud storage by default. The backend may read a document for a user-requested processing job, but must not permanently retain the original file unless a separate, explicit product decision and consent flow are approved.

A provider-neutral `CloudStorageProvider` boundary isolates Google Drive from the rest of the application and allows a future Microsoft OneDrive adapter without coupling processing logic to a provider SDK.

The system separates:
1. **Account and operational data** — identifiable, access-controlled data needed to operate the service.
2. **Transient processing data** — downloaded bytes, OCR output, extraction candidates, and job intermediates with strict retention and purge rules.
3. **Anonymous research/analytics dataset** — a separate store containing only allowlisted structured observations after a documented re-identification-risk assessment. Removing names alone is not anonymization.

The current provider and anonymization components added in this update are **interfaces/placeholders**, not production integrations. They fail closed. Use synthetic data only until implementation, security, privacy, legal, and clinical reviews are complete.

## 2. Goals and non-goals

### Goals
- Connect to a patient's Google Drive with explicit authorization and least-privilege scopes.
- Keep original files in the patient's Drive by default.
- Extract selected medical facts through an auditable, asynchronous pipeline.
- Prevent raw documents and direct identifiers from entering the anonymous dataset.
- Support account-data deletion and temporary-data cleanup.
- Keep cloud provider integration replaceable for OneDrive in a later phase.

### Non-goals for this release
- A certified electronic health record or clinical decision-support system.
- Automated diagnosis, treatment recommendations, or emergency triage.
- A guarantee that any dataset is legally anonymous merely because identifiers were removed.
- Production-ready Google Drive OAuth, OCR, medical extraction, or anonymization.
- A determination that any particular Moroccan law applies to every deployment; legal review is required.

## 3. System context and components

```text
Patient / authorized user
        |
        v
Web or mobile client
        |
        v
API / authentication / authorization
        |------------------------------|
        v                              v
Account & consent service         Job queue / worker
        |                              |
        |                              v
        |                       CloudStorageProvider
        |                              |
        |                       Google Drive adapter (initial)
        |                       OneDrive adapter (future)
        |                              |
        |                       Patient-owned original files
        |                              |
        |                              v
        |                       Temporary encrypted workspace
        |                              |
        |                       OCR / parsing / extraction
        |                              |
        |                       Validation + allowlist
        |                              |
        |                       Re-identification risk review
        |                              |
        v                              v
Account-linked database       Anonymous dataset (separate boundary)
        |
        v
Audit events / monitoring (no clinical payloads or tokens)
```

### Logical components
- **API layer:** validates requests, enforces authentication and authorization, applies rate limits.
- **Identity and consent:** records authorization and the purpose/scope of each processing job.
- **Cloud storage adapter:** fetches user-authorized content through provider-specific APIs.
- **Job orchestration:** queues, retries, cancellation, and status reporting without logging document content.
- **Transient processing:** parses/OCRs content in an isolated, encrypted workspace.
- **Extraction and validation:** emits typed candidate observations with provenance only in the transient boundary.
- **Anonymization gateway:** accepts only allowlisted fields and applies an independently reviewed risk policy; rejects by default until implemented.
- **Data stores:** separate account-linked data from anonymous observations.
- **Audit and monitoring:** records actor, action, timestamp, outcome, and job reference where appropriate, but excludes raw text, file bytes, access tokens, and unnecessary health details.

## 4. Cloud storage and provider abstraction

### Initial provider: Google Drive
The user grants access through a clear OAuth consent flow. Request the narrowest scopes compatible with the actual feature; prefer per-file or app-created-file access when it meets the product need. Store refresh/access credentials only in a managed secrets or encrypted credential store, restrict service access, rotate/revoke credentials where possible, and never log tokens.

The Google Drive adapter must:
- verify the connected account and file permissions;
- allow only supported file types and size limits;
- fetch only files the user explicitly selected or authorized;
- enforce timeouts, quotas, malware/content-type checks, and safe file handling;
- avoid changing, moving, or deleting source files;
- return controlled errors and fail closed if authorization or verification fails.

### Future provider: Microsoft OneDrive
Implement OneDrive behind the same provider interface after a separate scope, consent, security, and data-protection review. Do not build provider-specific assumptions into jobs or domain models.

### Proposed interface
- `listAuthorizedFiles(...)`
- `downloadAuthorizedFile(...)`
- `getFileMetadata(...)`
- `revokeConnection(...)`

This is a conceptual contract; signatures and implementation details should be refined against the chosen SDK and threat model.

## 5. Document processing lifecycle

1. User connects Google Drive and selects a document or folder.
2. API checks authentication, consent, provider scopes, file ownership/access, file type, and size.
3. API creates a job with a random internal job identifier. Avoid storing provider file IDs in the anonymous dataset.
4. Worker downloads the document into an encrypted, isolated temporary workspace.
5. OCR/parser produces raw text and structured extraction candidates in temporary storage.
6. Validation checks schema, confidence thresholds, units, plausibility, duplicate handling, and provenance.
7. An anonymization gateway evaluates each candidate against an allowlist and a documented re-identification risk policy.
8. Only approved structured observations are written to the separate anonymous dataset. If the gateway is unavailable, incomplete, or uncertain, **write nothing** to that dataset.
9. Raw bytes, OCR text, extraction candidates, temporary metadata, and intermediate artifacts are purged on success, failure, timeout, or cancellation according to a short, enforced TTL.
10. The user receives job status and, if product functionality requires it, a user-facing summary. Do not persist a source document copy as a side effect.

### Temporary data policy
- Encrypt in transit and at rest; use isolated per-job storage and least-privilege access.
- Set a short maximum TTL and enforce cleanup with a scheduled sweeper plus lifecycle policies.
- Purge on success, failure, cancellation, and expired jobs; retries must not extend retention indefinitely.
- Do not put medical content, OCR text, access tokens, or direct identifiers in application logs, traces, crash reports, or analytics.
- Treat backups, dead-letter queues, caches, and debugging artifacts as data stores requiring explicit TTL and purge controls.
- Use synthetic data in development and test environments.

## 6. Anonymous dataset: design and limits

The dataset is intended for aggregate analytics or research only after governance approval. It must be physically or logically separated from account-linked tables, credentials, source file references, and job records.

### Prohibited fields
- patient name, email, phone, address, national identifier, account/user ID;
- source document ID, Google Drive file ID, OneDrive item ID, or a reversible lookup key;
- raw document, OCR text, free-text clinical notes, embedded images, or document URL;
- exact dates/timestamps where they increase identification risk;
- exact location or rare combinations that make a person readily distinguishable;
- any mapping table that allows the anonymous row to be linked back to a person.

### Candidate fields (not automatically approved)
Only fields required for a clearly defined purpose, such as broad age band, generalized observation category, normalized unit/value band, or coarse time period. Health values themselves can be identifying when rare or combined with other attributes. Every field and combination needs review.

### Required controls
- Maintain a versioned allowlist and documented purpose for each field.
- Assess singling-out, linkability, and inference risks, including rare diseases and small cohorts.
- Generalize, suppress, aggregate, or reject high-risk records; use minimum cohort thresholds where appropriate.
- Keep anonymous data in a separate database/schema with distinct credentials and network policy.
- Do not retain provenance that re-links records to source files.
- Reassess when new data sources, fields, or external datasets are introduced.
- Do not call the dataset “anonymous” until qualified privacy review validates that claim for the intended use and jurisdiction. Until then, classify it as sensitive/pseudonymized and restrict access.

## 7. Data model boundaries

### Account-linked operational store
Potential entities:
- `UserAccount` — account identity and settings.
- `CloudConnection` — provider, encrypted credential reference, scopes, connection state.
- `ConsentRecord` — purpose, scope, version, timestamp, withdrawal state.
- `ProcessingJob` — random job ID, status, timestamps, error code, temporary workspace reference.
- `AuditEvent` — actor/action/outcome and minimal metadata.

Do not store raw clinical documents by default. Any persistent user-facing extracted health record would be a separate product requirement requiring explicit consent, retention policy, access controls, export/delete behavior, and legal review; it must not be mixed into the anonymous dataset.

### Anonymous observation store
Potential fields are only those approved by the allowlist, such as:
- `observation_category`
- `normalized_value` or a reviewed value band
- `normalized_unit`
- `coarse_period`
- `schema_version`

These are examples, not a final approved schema. No user, account, job, or source-file foreign key is allowed.

## 8. API and job lifecycle (illustrative)

- `POST /v1/cloud-connections/google-drive/start` — begin OAuth authorization.
- `GET /v1/cloud-connections/google-drive/callback` — validate OAuth response and establish connection.
- `GET /v1/cloud-connections` — show connected providers and status.
- `DELETE /v1/cloud-connections/{id}` — revoke/remove backend connection and stored credentials.
- `POST /v1/processing-jobs` — create a user-authorized processing job.
- `GET /v1/processing-jobs/{id}` — return status and safe error details.
- `POST /v1/processing-jobs/{id}/cancel` — request cancellation and cleanup.
- `DELETE /v1/account` — initiate account deletion workflow.

These routes are proposed design examples, not claims that they already exist in code.

## 9. Account deletion, consent withdrawal, and source files

On account deletion or relevant consent withdrawal:
1. stop accepting new processing jobs;
2. cancel or terminate queued/running jobs;
3. purge transient files, OCR text, extraction candidates, caches, and temporary artifacts;
4. revoke/delete stored cloud credentials and remove backend connection records;
5. delete account-linked data according to the published retention policy and legal obligations;
6. retain only legally required minimal audit evidence, if applicable, with a defined retention period;
7. report completion or explain any lawful exception.

**Default behavior:** do not delete or alter originals in Google Drive. Deleting cloud originals must be a separate, explicit action with clear confirmation and provider-specific authorization. Anonymous dataset records cannot be reliably removed by account ID because the design must not keep a reverse mapping; this limitation must be disclosed before data is contributed, and the governance/legal basis for retaining such records must be reviewed.

## 10. Security and privacy controls

- TLS for all network traffic; encryption at rest with managed keys.
- Least privilege, role separation, MFA for privileged operations, and periodic access review.
- Secrets manager for OAuth credentials; no credentials in source control or environment dumps.
- Input validation, upload/download limits, content-type verification, parser sandboxing, malware scanning where appropriate.
- Rate limiting, abuse detection, dependency scanning, patch management, secure CI/CD, and signed release artifacts.
- Structured logs with redaction; no medical payloads, tokens, or unnecessary identifiers.
- Audit administrative access and changes to consent, cloud connections, processing policies, and dataset allowlists.
- Threat model covering malicious files, compromised credentials, insider access, cross-tenant access, inference/linkage attacks, queue leakage, backups, and deletion failures.
- Incident response plan, breach assessment process, restore testing, and periodic penetration testing.

## 11. Moroccan legal and governance workstream

Before processing real patient data, qualified Moroccan counsel and a privacy lead must assess:
- requirements under **Law 09-08** and applicable CNDP formalities, including whether the intended processing needs declarations, authorization, or other steps;
- whether hosting, support access, processors, or backups create cross-border transfer issues;
- the applicability of **Law 05-20** and related cybersecurity requirements to the specific organization/service;
- consent validity, purpose limitation, retention, data-subject rights, processor contracts, and research/secondary-use basis;
- clinical safety and liability if extraction output is presented to users or used in care.

This architecture is not legal advice and does not determine compliance. Do not use real health data until the review has produced documented go/no-go decisions.

## 12. Operational observability and reliability

- Job states: `queued`, `running`, `succeeded`, `failed`, `cancelled`, `purge_pending`, `purged`.
- Idempotent job creation and safe retry policy.
- Dead-letter queues must not contain document payloads; payload references expire.
- Alerts for stuck jobs, failed purge tasks, provider errors, suspicious access, and policy-gateway failures.
- Reconcile temporary storage against job state; a purge failure is a security incident to alert on, not a silent warning.
- Backups must have a documented retention schedule and deletion/expiry process.

## 13. Delivery plan

### Phase 0 — governance and threat model
- Define purpose, data flows, retention, consent, and allowed observation fields.
- Complete legal/privacy and clinical safety reviews.
- Define a threat model and acceptance criteria.

### Phase 1 — safe skeleton
- Authentication/authorization and consent model.
- Provider interface and Google Drive adapter with least-privilege OAuth.
- Job orchestration and encrypted temporary workspace.
- Purge workflow, audit events, and synthetic-data test suite.

### Phase 2 — extraction
- Sandboxed parsing/OCR and schema validation.
- Confidence and provenance rules in the transient boundary.
- Adversarial file testing and deletion-failure tests.

### Phase 3 — anonymous dataset (only after approval)
- Independent risk-reviewed allowlist and gateway implementation.
- Separation of credentials, schema, network policy, and monitoring.
- Re-identification-risk testing and documented approval.

### Phase 4 — future OneDrive support
- Implement and review OneDrive adapter independently.
- Repeat consent, scope, threat, privacy, and integration tests.

## 14. Release acceptance criteria

Do not release with real health data until all are true:
- OAuth scopes are least-privilege and consent is understandable.
- No original documents or raw OCR are retained by default.
- Temporary artifacts are purged on all terminal paths, and purge failures alert.
- Anonymous dataset rejects unknown fields and fails closed.
- Dataset has no user/account/source-file reverse mapping.
- Access-control, tenant-isolation, logging-redaction, deletion, and incident-response tests pass.
- Privacy/legal review has documented the lawful basis and CNDP/cross-border obligations.
- Security and clinical safety owners have signed off.
- Production monitoring, backup retention, and recovery procedures are tested.

## 15. Current implementation status

The accompanying backend archive updates documentation and adds a provider abstraction plus fail-closed scaffolding. The Google Drive provider and anonymization gateway are intentionally placeholders; they do not perform a real OAuth flow, download a file, OCR a document, or anonymize health data. Route names and data models in this document are proposals unless confirmed in the source code.

**Until production controls are implemented and independently reviewed, use synthetic data only.**
