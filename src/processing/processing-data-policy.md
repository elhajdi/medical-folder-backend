# Processing data policy

Status: mandatory design constraint; enforcement must be implemented and tested.

- Original files remain in the user's cloud storage by default.
- Downloaded bytes, OCR text, extraction candidates, and intermediate artifacts are transient.
- Encrypt temporary data at rest and in transit; isolate per job; restrict access.
- Apply a short maximum TTL and purge on success, failure, cancellation, timeout, and account deletion.
- Retries must not extend retention indefinitely.
- Logs, traces, crash reports, queues, caches, backups, and debugging tools must not expose medical payloads or credentials.
- Purge failures must alert and be treated as security incidents.
- Do not write to an anonymous dataset unless a reviewed allowlist and fail-closed gateway approve the record.
- Never include account/user IDs, source file IDs, raw text, exact dates, or a reverse mapping in that dataset.
- Account deletion does not delete original files from Google Drive. Cloud deletion requires separate explicit confirmation.
- Use synthetic data only until security, privacy, legal, and clinical reviews are complete.
