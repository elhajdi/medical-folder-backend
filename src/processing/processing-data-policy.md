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

## Stage 1 patient-review candidate exception

The Stage 1 prototype persists structured candidate fields only to support
authenticated patient review. This is a narrowly scoped, not production-approved
exception to the transient-intermediate rule:

- OCR page text remains in process memory and is not persisted.
- The optional local PaddleOCR adapter sends document bytes to a same-host
  Python worker over a private process pipe; page images and OCR text are
  processed in memory and are not written by the worker to temporary files.
- PaddleOCR model files are cached separately from document data. Treat that
  cache as deployment software, pin/review it, and do not place document data
  in the model cache.
- Candidate records are owner-scoped, never confirmed, and are purged from the
  database after at most 24 hours (`EXTRACTION_RETENTION_HOURS`, capped at 24).
- Expired candidates become unavailable and their status remains as a safe
  `EXTRACTION_EXPIRED` error. Cleanup runs at startup, once per minute while
  running, and before status/extraction reads.
- If the service is offline at expiry, physical cleanup waits until startup or
  the next request. This prototype does not provide a database-native TTL or
  encrypted temporary store; real-data use remains blocked pending privacy,
  security, retention, and operational sign-off.
