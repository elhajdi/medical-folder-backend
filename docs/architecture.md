# Backend prototype architecture

## Shape
Flutter client (future) → NestJS REST API (`/api/v1`) → Prisma. Local development can use a file-backed SQLite database without Docker; PostgreSQL remains the deployment target. Uploaded documents are stored in a local private folder for development only. Async document scanning/OCR, object storage, queue workers and notification delivery are intentionally not implemented yet. The AI endpoint is a safe disabled adapter stub.

## Modules
- Auth: email/password registration, bcrypt hash, short-lived JWT.
- Profile: patient profile and Morocco/Casablanca timezone defaults.
- Documents: upload/list/download/delete with owner scoping and audit events.
- Medications: patient-entered medication plan CRUD. Does not infer dosage or create clinical advice.
- AI: source-document selection and disabled response contract; no external provider call.
- Audit: event recording service.

## Production target before launch
Private object storage with encryption and malware scanning; signed download flow; refresh-token rotation and email verification; MFA/step-up authentication for sensitive operations; rate limits per route/account; robust audit immutability; background jobs/outbox for reminders; backups and tested restore; secrets manager; monitoring with PHI-safe logs; data retention/export/deletion workflow; penetration test; CNDP/legal assessment for Law 09-08 and cross-border transfers; clinical safety review. Assess Law 05-20 applicability with Moroccan counsel rather than assuming it applies.

## Trust boundaries
Treat client requests, uploaded files, OCR results, AI outputs and reminder providers as untrusted. No clinical document text should enter logs. Do not expose `extractedText` or internal `storageKey` in ordinary API responses.
