# Morocco Patient Health Record API — backend prototype

A backend-first starter for a mobile app where patients manage their medical history. Built with NestJS, Prisma and PostgreSQL. Includes developer/AI-agent instructions to help a team implement features safely.

> **Important:** This is a developer prototype, not a production medical system. Do not upload real patient documents or use it for clinical decisions. It has not been security-tested or legally/clinically approved. Local file storage, authentication and audit handling need hardening before any pilot with real data.

## Included

- Account registration/login (bcrypt + JWT)
- Patient profile (default timezone `Africa/Casablanca`)
- Medical document metadata + local development upload/download and patient-owned document links
- Review-only prescription extraction contract (OCR disabled by default)
- Explicitly opt-in, self-hosted PaddleOCR adapter for French/Arabic (CPU by default)
- Medication plan CRUD
- AI summary endpoint contract that remains disabled by default
- Audit-event service
- PostgreSQL + Prisma schema
- Swagger/OpenAPI at `/api/docs`
- `AGENTS.md`, Copilot instructions and specialist agent prompts
- Authenticated integration capability status; Google Drive and anonymous-data
  processing remain disabled and fail closed

## Run locally

Prerequisites: Node.js 24 LTS, npm, Docker Desktop or Docker Engine. The
repository pins the Node.js major in `.nvmrc`; use `nvm install` / `nvm use` or
an equivalent version manager before installing dependencies.

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

### Prescription extraction review

The authenticated prescription routes use the prescription document ID as
`:prescriptionId`. The candidate is provisional OCR data and is not medication
advice. Patient confirmation is not clinician verification.

- `GET /api/v1/prescriptions/:prescriptionId/extraction` reads the patient-owned
  candidate and its review state.
- `PATCH /api/v1/prescriptions/:prescriptionId/extraction` accepts candidate
  corrections, for example:

  ```json
  {
    "prescriptionDate": { "value": "2026-01-01" },
    "medications": [
      {
        "name": { "value": "Synthetic medicine" },
        "dose": { "value": "1 tablet" },
        "frequency": { "value": "once daily" }
      }
    ]
  }
  ```

- `POST /api/v1/prescriptions/:prescriptionId/confirm` accepts the same optional
  candidate fields, validates required date and medication details, then
  confirms the patient-reviewed data.
- `POST /api/v1/prescriptions/:prescriptionId/reject` accepts an optional
  `{"reason":"..."}` body and rejects the unconfirmed candidate.

All routes require a bearer token and only operate on the authenticated
patient's prescription. Interactive request schemas are available in Swagger at
`/api/docs`.

### Stage 3 cloud storage and privacy status

- `GET /api/v1/cloud-connections/status` requires authentication and reports
  global capability state only; it does not indicate that an individual user is
  connected.
- Google Drive OAuth, account connections, uploads, and token revocation are not
  implemented. The current local document upload remains development-only.
- Anonymous-data submission is disabled. The privacy gate is a stub, and no
  anonymous store is configured.
- See [the Stage 3 runbook](docs/stage3-google-drive-privacy-runbook.md) for
  migration, retention, deployment, and Morocco governance prerequisites.
- Keep synthetic data only. Do not enable cloud integrations by setting
  environment variables; implementation and independent review are still
  required.

### Optional self-hosted PaddleOCR

OCR remains disabled unless `OCR_PROVIDER=paddleocr` is explicitly configured.
The provider runs the pinned PaddleOCR 2.10.0 / PP-OCRv4 Python worker locally;
it does not call an OCR SaaS or fall back to another provider. The worker loads
French (`fr`) and Arabic (`ar`) models once, then handles one document at a
time. Its PDF rendering and image decoding use bounded in-memory processing.
OCR text and page images are not written by the worker to temporary files or
logs. The application still uses its existing inline processing endpoint; a
separate background queue has not been implemented.

Install the optional Python runtime in a dedicated environment (Python 3.9+):

```bash
python3 -m venv .venv-ocr
. .venv-ocr/bin/activate
python -m pip install -r requirements-ocr.txt
```

Set `PADDLEOCR_PYTHON` to that environment's Python executable, then configure
`OCR_PROVIDER=paddleocr`. The first worker startup downloads PaddleOCR models
to the PaddleOCR cache directory; pre-populate that cache in a controlled
deployment build if model downloads are not permitted at runtime. Model
downloads are not document processing, but do require outbound access unless
the models are pre-cached.

CPU is the default (`PADDLEOCR_USE_GPU=false`). Optional GPU deployments must
install a PaddlePaddle GPU wheel compatible with their CUDA/cuDNN and hardware
instead of the pinned CPU `paddlepaddle` wheel, then set
`PADDLEOCR_USE_GPU=true` and configure `CUDA_VISIBLE_DEVICES`. The GPU path is
not validated by this prototype. Important bounds are configurable with
`MAX_UPLOAD_MB`, `PADDLEOCR_MAX_PAGES`, `PADDLEOCR_MAX_PIXELS`,
`PADDLEOCR_TIMEOUT_MS`, `PADDLEOCR_STARTUP_TIMEOUT_MS`, and
`PADDLEOCR_CPU_THREADS`.

The French language selection uses the PP-OCRv4 pipeline's Latin PP-OCRv3
recognizer; Arabic uses its PP-OCRv4 Arabic recognizer. PaddleOCR documents
both language codes in its
[2.10.0 multilingual model guide](https://www.paddleocr.ai/v2.10.0/en/ppocr/blog/multi_languages.html).
The models are general text OCR, not prescription-specific, and the OCR
confidence is not clinical confidence. Recognition of handwriting, mixed
French/Arabic lines, low-quality scans, and medical abbreviations is not
guaranteed. Review all candidates; missing or ambiguous directions remain
unknown.

Run the provider's synthetic normalization tests with
`python3 src/prescription-processing/test_paddleocr_worker.py`; run the
application tests with `npm test -- --runInBand`. There are no real or
handwritten patient-document fixtures in this repository. For an operational
benchmark, use approved synthetic French and Arabic samples, record the worker
startup separately from warm per-document latency, and measure CPU, memory,
page count, and recognition quality before changing limits or enabling GPU.
Installing OCR dependencies or enabling the provider is not privacy, security,
legal, licensing, or clinical approval. PaddleOCR is Apache-2.0 licensed; review
all transitive dependencies and model terms for the intended deployment.

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
- Current prototype exception: uploads remain on local development disk and patient-facing prescription candidates are persisted for at most 24 hours. OCR remains disabled unless the optional local PaddleOCR provider is explicitly configured. Neither is production-ready.
