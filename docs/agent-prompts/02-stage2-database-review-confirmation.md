# Stage 2 — Database Persistence, Patient Review, and Confirmation

Prerequisite: Stage 1 is implemented and its tests pass. Use GitHub Copilot Chat in VS Code, preferably Agent mode.

## Role and approach
Continue as a senior backend engineer in the existing `medical-folder-backend` repository. Inspect the current models, migrations, authorization, OCR/parser services, API schemas, and tests. Identify what already exists; do not duplicate it. Preserve conventions and avoid unrelated refactoring. State a short plan before editing.

## Goal
Persist candidate prescription extraction, let the authenticated patient review/correct/reject it, and require explicit confirmation before downstream features can use it.

## Requirements
1. Persist document-processing state and structured candidate extraction using the existing ORM and migration system.
2. Keep candidate extraction distinct from patient-confirmed prescription data, or use an equally clear version/state model. Unreviewed data must never be mistaken for confirmed instructions.
3. Preserve provenance: source-document reference, OCR/extractor provider and version, timestamp, field confidence/warnings, status, and schema version. Avoid unnecessary duplication of raw OCR text.
4. Provide retrieval and review endpoints following existing conventions. Suggested fallbacks: `GET /prescriptions/{id}/extraction` and `PATCH /prescriptions/{id}/extraction`.
5. Allow the patient to correct or reject candidates. Validate every field; keep an audit trail of changes without retaining more sensitive information than necessary.
6. Add explicit confirmation, e.g. `POST /prescriptions/{id}/confirm`. Require authentication, ownership, and validation of required fields. OCR completion must never auto-confirm.
7. Save confirmed prescription and medication entries transactionally. A partial failure must not leave a prescription marked confirmed without its required medication records.
8. Define and enforce state transitions, e.g. `queued`, `processing`, `needs_review`, `confirmed`, `rejected`, `failed`.
9. Support rejection and retry/reprocessing. Reprocessing must never silently overwrite confirmed data; use versions or require explicit re-confirmation.
10. Enforce object-level authorization on every read, edit, confirm, reject, and retry operation. Return stable response schemas and safe validation errors.
11. Make confirmation/retry idempotent where practical; use transactions and constraints where appropriate.

## Medical safety and privacy
- OCR output is a draft, not medical advice.
- Never infer missing dose, route, frequency, duration, or medication identity.
- Ambiguous or high-risk directions remain unresolved and should be checked with the prescribing clinician or pharmacist.
- Do not create reminders, recommendations, diagnoses, or treatment changes in this stage.
- “Patient-confirmed” means the patient reviewed the transcription; it does not imply independent clinician validation.
- Use synthetic data only. Do not log complete prescriptions or sensitive field values. Keep secrets out of source control.
- Do not build the anonymous-data pipeline in this stage and do not claim legal compliance or anonymization.

## Tests
Test persistence and owner-only retrieval; valid corrections and invalid values; rejection; confirmation blocked for unresolved required fields; atomic confirmed-record creation; idempotent repeated confirmation; reprocessing protection for confirmed versions; cross-patient denial; status transitions; and migration behavior.

## Deliverables and acceptance
- Models/migrations and review/reject/confirm service/API changes.
- Automated tests using fictional data.
- API examples and a status-transition table/diagram.
- Candidate and confirmed data are distinguishable; only the owner can confirm; confirmation is atomic and traceable; uncertain instructions are never guessed; all relevant tests pass.

Implement Stage 2 only. Run tests, linting, and migrations in the supported test environment. Do not weaken authorization or skip failing tests. Do not commit or push unless explicitly asked. End with changed files, commands/results, API examples, migration notes, and remaining risks.
