# Instructions for AI coding assistants

Follow `AGENTS.md` before editing backend code. This workspace also contains the Flutter client starter at `../medical_folder_flutter_starter`. Treat the backend and mobile app as separate projects with separate implementation status, while keeping their API and patient-safety contracts consistent. Privacy, consent, and least-privilege access are default constraints across both.

## Verified project purpose

- Backend: NestJS + Prisma + PostgreSQL.
- Client flows: patient profile, health document management, OCR-driven prescription review, medication planning, and safe AI summary contracts.
- Current implementation status is intentionally limited: external storage, anonymous data handling, and AI providers remain disabled until architecture and privacy review is complete.
- The Flutter project is a UI-first starter using local in-memory synthetic demo state. It is not connected to this backend and does not provide production authentication, persistence, OCR, cloud storage, or notification delivery.

## Architecture and module boundaries

- `src/auth`: registration, auth, and JWT behavior.
- `src/profile`: patient profile and timezone/defaults.
- `src/documents`: document metadata, ownership checks, and local upload/download handling.
- `src/prescription-processing`: review-only prescription workflow and OCR integration boundaries.
- `src/medications`: medication plans and patient confirmation flows.
- `src/ai`: AI summary contract and fail-closed behavior.
- `src/audit`: sensitive access and mutation audit events.
- `src/cloud-storage`: provider-neutral abstraction; Google Drive and real integrations are not enabled by default.
- `../medical_folder_flutter_starter/lib/app.dart` and `lib/features/`: Flutter app shell and client screens for dashboard, documents, scan, history, reminders, and profile.
- `../medical_folder_flutter_starter/lib/core/theme/`: app palette and Flutter theme.

## Required development discipline

- Use synthetic data only.
- Scope every read/write to the authenticated patient owner.
- Never treat OCR output as medical authority or clinician advice.
- Treat uploaded files and extracted text as untrusted input.
- Keep logs, errors, and prompt payloads free from PHI or patient-identifying details.
- Add tests for success, invalid input, and authorization failures.
- For Flutter changes, follow the mobile project's `README.md` and `analysis_options.yaml`; add widget tests and run Flutter analysis/tests when available.
- Do not connect the mobile demo to backend endpoints based on assumptions. Verify backend routes and DTOs first, and document any contract gap before implementing client integration.
- Update API docs and relevant `docs/` write-ups when contracts or architecture change.
- Never claim a test passed unless the command actually ran and succeeded.

## Custom agent team

This repository includes repository-specific custom agents under `.github/agents/` for work coordination. Use the matching specialist for the task:

- `solution-architect`: scope, safety, and coordination.
- `backend-implementer`: code and database changes.
- `security-privacy-reviewer`: authz, storage, and governance review.
- `clinical-safety-reviewer`: medication and AI safety review.
- `qa-test-engineer`: regression and validation.
- `ocr-processing-engineer`: extraction and review workflows.
- `cloud-storage-privacy-engineer`: provider-neutral storage boundaries.
- `medication-planner-notification-engineer`: schedule and reminder logic.
- `architecture-reviewer`: design and migration checks.
- `developer-documentation-engineer`: docs and onboarding.
- `mobile-app-engineer`: Flutter UI, accessibility, localization, and safe client/backend integration.

Do not invent undocumented APIs, skip approval gates for sensitive changes, or claim production readiness without evidence.
