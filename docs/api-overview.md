# API overview (prototype)

Base path: `/api/v1`; interactive OpenAPI: `/api/docs`.

| Method       | Path                                        | Auth | Purpose                                                                              |
| ------------ | ------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| GET          | `/health`                                   | No   | Liveness                                                                             |
| POST         | `/auth/register`                            | No   | Create patient account                                                               |
| POST         | `/auth/login`                               | No   | Obtain access token                                                                  |
| GET/PUT      | `/profile`                                  | Yes  | Read/update profile                                                                  |
| GET          | `/documents`                                | Yes  | List own document metadata; optional `?type=LAB_RESULT`                              |
| POST         | `/documents/links`                          | Yes  | Link two of the patient’s documents with a relationship label                        |
| GET          | `/documents/:id/links`                      | Yes  | List links touching one owned document                                               |
| POST         | `/documents/upload`                         | Yes  | Multipart upload (`file`, `type`, `title`, optional `description`, `documentDate`)   |
| GET          | `/documents/:id/processing-status`          | Yes  | Get the authenticated owner's safe prescription processing status                    |
| POST         | `/documents/:id/process`                    | Yes  | Retry processing for the authenticated owner's prescription document                 |
| GET          | `/prescriptions/:prescriptionId/extraction` | Yes  | Read the owner's unconfirmed prescription candidates                                 |
| PATCH        | `/prescriptions/:prescriptionId/extraction` | Yes  | Correct the owner's unconfirmed candidate; does not create medication records        |
| POST         | `/prescriptions/:prescriptionId/confirm`    | Yes  | Confirm a complete patient-reviewed candidate and create medication records          |
| POST         | `/prescriptions/:prescriptionId/reject`     | Yes  | Reject the owner's unconfirmed prescription candidate                               |
| GET          | `/documents/:id/download`                   | Yes  | Download own document                                                                |
| DELETE       | `/documents/:id`                            | Yes  | Delete own document metadata/file (physical-file cleanup needs production hardening) |
| GET/POST     | `/medications`                              | Yes  | List/create own medication plans                                                     |
| PATCH/DELETE | `/medications/:id`                          | Yes  | Update/delete own medication plan                                                    |
| POST         | `/ai/medical-history-summary`               | Yes  | Disabled AI response with source document references                                 |

All endpoints are prototypes; see README for gaps before production.

Prescription upload accepts PDF, JPEG, and PNG only; extension, declared MIME
type, size, and file signature are checked. A prescription upload triggers
inline processing and includes its safe processing state in the response.
`needs_review` is never confirmation and does not create a medication plan or
reminder. Candidate fields include field-level confidence and source page; any
unknown or ambiguous field remains `null`. Confidence reflects the page score
supplied by the OCR adapter, or is `null` when unavailable; it is not an
independent clinical confidence score. `expiresAt` indicates the candidate
retention deadline. The status endpoint returns only provider/version, state,
timestamps, retention deadline, and a safe error category. Candidates expire
within 24 hours and expired records return no candidate.

Until a reviewed OCR implementation is installed, `OCR_PROVIDER=disabled` is
the only supported configuration. Processing then ends with `failed` and
`OCR_UNAVAILABLE`; no OCR is claimed to have occurred. The disabled provider is
not an OCR mock. A deterministic fake provider exists only in automated tests.
Set `EXTRACTION_RETENTION_HOURS` to a positive value no greater than 24; the
prototype defaults it to 24 hours.

The Postman collection includes synthetic examples for candidate correction,
confirmation validation, explicit confirmation, rejection, and cross-owner read
denial. Review, confirmation, and rejection scenarios require a separate
unconfirmed candidate produced by an approved OCR provider; do not use real
medical documents to exercise them.
