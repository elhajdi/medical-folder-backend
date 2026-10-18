# Morocco Patient Health Record API — backend prototype

A backend-first starter for a mobile app where patients manage their medical history. Built with NestJS, Prisma and PostgreSQL. Includes developer/AI-agent instructions to help a team implement features safely.

> **Important:** This is a developer prototype, not a production medical system. Do not upload real patient documents or use it for clinical decisions. It has not been security-tested or legally/clinically approved. Local file storage, authentication and audit handling need hardening before any pilot with real data.

## Included

- Account registration/login (bcrypt + JWT)
- Patient profile (default timezone `Africa/Casablanca`)
- Medical document metadata + local development upload/download and patient-owned document links
- Review-only prescription extraction contract (OCR disabled by default)
- Medication plan CRUD
- AI summary endpoint contract that remains disabled by default
- Audit-event service
- PostgreSQL + Prisma schema
- Swagger/OpenAPI at `/api/docs`
- `AGENTS.md`, Copilot instructions and specialist agent prompts

## Run locally

Prerequisites: Node.js 20+, npm, Docker Desktop or Docker Engine.

```bash
cp .env.example .env
# Change JWT_SECRET to a random secret of at least 32 characters.
docker compose up -d postgres
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

API: `http://localhost:3000/api/v1/health`  
Swagger: `http://localhost:3000/api/docs`

## Quick smoke test

```bash
curl http://localhost:3000/api/v1/health
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.test","password":"Use-A-Unique-Dev-Password-123!"}'
```

Use only fake accounts and synthetic documents. Save the returned access token as `TOKEN` and pass `Authorization: Bearer $TOKEN` to protected endpoints.

## API conventions

- JSON request/response unless multipart upload.
- Dates are ISO-8601; patient timezone defaults to `Africa/Casablanca`.
- IDs are opaque strings; never rely on sequential IDs.
- Document upload accepts PDF, JPEG and PNG, with a configurable size cap.
- `DocumentType`: `PRESCRIPTION`, `LAB_RESULT`, `MEDICAL_REPORT`, `RADIOLOGY`, `DISCHARGE_SUMMARY`, `VACCINATION`, `OTHER`.

## Developer agents

1. Read `AGENTS.md` and `docs/architecture.md` before coding.
2. Choose one prompt in `docs/agent-prompts/` for the task/review role.
3. Ask the implementer to produce a diff and tests; have security/clinical reviewer review independently.
4. Human owner reviews and merges. AI agents are not a substitute for legal, security or clinical sign-off.

## Before using real data (mandatory backlog)

- [ ] Resolve Moroccan privacy/CNDP requirements under Law 09-08, including authorization/declaration and sensitive health data treatment.
- [ ] Validate hosting location and any international data transfers with qualified Moroccan counsel/CNDP guidance.
- [ ] Determine Law 05-20 applicability with counsel.
- [ ] Replace local disk storage with private encrypted object storage, malware scanning, access controls and signed URLs.
- [ ] Add email verification, password reset, refresh token rotation/revocation, MFA/step-up controls and account lockout controls.
- [ ] Enforce production-grade throttling, request limits, upload validation and file-content inspection.
- [ ] Add robust audit coverage, immutable/append-only storage and alerting.
- [ ] Add document-processing queue, OCR pipeline, idempotent medication reminder jobs and delivery tracking.
- [ ] Approve the purpose, retention/deletion/export policy for persisted prescription candidates before real-data use; implement OCR only after privacy, security, residency and clinical review.
- [ ] Add user data export/deletion, retention policy, backup encryption and restore drills.
- [ ] Add automated unit/integration/e2e tests, tenant-isolation tests, dependency scanning and penetration testing.
- [ ] Complete clinical review, incident response plan, privacy notices and consent flows.
- [ ] Keep AI disabled until provider, data processing, residency and safety reviews are approved.

## Known prototype limitations

- File streaming needs explicit path integrity checks, not-found handling and a private storage abstraction.
- Upload metadata validation and Multer errors need a centralized exception filter.
- AI summary does not call a model and does not produce medical content by design.
- Reminder schedules are stored but there is no scheduler or delivery provider yet.
- Add e2e tests and CI before handing over to a team.

## Privacy-first cloud document architecture (v1.1)

See [`docs/solution-architecture-v1.1.md`](docs/solution-architecture-v1.1.md).

- Google Drive is the first planned provider; Microsoft OneDrive is a future adapter.
- Original medical documents stay in patient-owned cloud storage by default.
- Raw files, OCR output, and extraction candidates are transient and must be purged.
- The anonymous dataset is separate and must receive only approved allowlisted observations.
- `src/cloud-storage/providers/google-drive.provider.ts` and
  `src/anonymization/anonymization-gateway.ts` are fail-closed placeholders, not production implementations.
- Use synthetic data only until privacy/legal/security/clinical reviews and implementation tests are complete.
- Current prototype exception: uploads remain on local development disk and patient-facing prescription candidates are persisted for at most 24 hours; OCR is explicitly disabled. Neither is production-ready.
