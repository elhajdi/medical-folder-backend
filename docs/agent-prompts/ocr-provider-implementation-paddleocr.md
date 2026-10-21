# Implement PaddleOCR as a pluggable provider — Medical Folder v1.2

## Role
Act as a senior backend engineer specializing in Python OCR, document processing, secure APIs and healthcare data protection.

## Objective
Integrate PaddleOCR into the existing `medical-folder-backend` project as a self-hosted OCR provider, preserving the Medical Folder v1.2 architecture.

## Architecture reference
See [OCR provider architecture diagram](./ocr-provider-implementation-paddleocr.md) for the provider design.


## Step 1 — Inspect before changing code
1. Inspect the existing repository, language, framework, dependency management, database, API routes, document models, worker/queue setup and tests.
2. Identify the current OCR implementation or placeholder and the existing document-processing lifecycle.
3. Reuse existing abstractions and naming conventions where possible.
4. Present a short implementation plan before modifying files.
5. Do not replace the existing architecture or introduce a second framework unnecessarily.

## Step 2 — Implement a provider abstraction
Create or adapt an OCR provider interface with operations appropriate to the existing codebase.

Implement `PaddleOCRProvider` behind that interface.

The normalized OCR result should support:
- Extracted text and page boundaries.
- Text-region bounding boxes when available.
- Confidence values when provided by the engine.
- Provider name and pinned model/version.
- Processing status and controlled error codes.
- Language/model metadata where known.

Do not treat OCR confidence as clinical confidence.

## Step 3 — PaddleOCR integration
1. Use the official PaddleOCR package and documented APIs for the selected pinned version.
2. Select and document the model configuration for French and Arabic. Verify the supported languages for the exact model version.
3. Support the existing accepted image/PDF formats. Convert PDF pages safely if required by the chosen API.
4. Handle empty, corrupt, oversized, unsupported and encrypted documents.
5. Configure CPU execution by default and document optional GPU deployment.
6. Initialize models efficiently; avoid reloading them for every page or request.
7. Add timeouts, bounded concurrency and resource limits.
8. Never silently fall back to another provider. Provider selection and fallback behavior must be explicit and observable.

## Step 4 — Preserve the medical workflow
Integrate OCR with the existing asynchronous job lifecycle.

OCR output must remain an unconfirmed candidate. Do not automatically create a confirmed prescription or medication schedule from raw OCR.

Preserve:
- Patient review and correction.
- Explicit confirmation before persistence as confirmed clinical data.
- Provenance linking candidates to source pages/regions where possible.
- Validation of medication name, strength, dose, route, frequency and duration.
- Manual clarification for missing or ambiguous directions.
- Existing authentication and patient-level authorization.

Never invent missing medication values or interpret a low-confidence result as verified.

## Step 5 — Privacy and security
1. Process documents in isolated temporary storage with encryption and enforced retention/cleanup.
2. Do not log document contents, OCR text, credentials, access tokens or unnecessary health data.
3. Validate MIME type and actual file content; enforce size/page limits and safe PDF/image handling.
4. Keep PaddleOCR output out of the anonymous dataset unless the separate, explicitly approved anonymization gateway permits a defined output.
5. Keep the anonymization gateway fail-closed.
6. Do not claim Moroccan legal compliance. Document hosting, licensing, security and legal-review requirements.
7. Use synthetic test documents only.

## Step 6 — Tests and deliverables
Add tests for:
- Provider contract and normalized output.
- French and Arabic fixtures where available.
- Unsupported/corrupt files and empty OCR results.
- Timeouts and provider errors.
- Authorization and patient data isolation.
- Confirmation workflow and prevention of automatic medication-plan creation.
- Temporary-file cleanup and privacy-safe logging.
- Worker retries and duplicate-job/idempotency behavior, consistent with the existing architecture.

Provide:
1. Implementation and dependency changes.
2. Environment/configuration example.
3. Unit and integration tests.
4. Docker or deployment updates if needed.
5. Documentation for installation, model selection, CPU/GPU operation, limitations and benchmark execution.
6. A summary of files changed, tests executed and any unresolved issues.

Do not fabricate test results. Run the available tests and report failures honestly. Keep changes small and reviewable.