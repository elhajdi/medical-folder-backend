# Agent and developer operating guide

This repository handles sensitive health data. Treat all health records, filenames, OCR text, prompts, logs and sample payloads as sensitive.

## Non-negotiable rules

- Never use real patient data in local development, demos, test fixtures, issue trackers or AI coding-agent context. Use synthetic data only.
- Never make an autonomous diagnosis, recommend starting/stopping/changing medication, or present AI output as clinician advice.
- Do not enable external AI, OCR SaaS, analytics, email/SMS or push providers until privacy, data residency/cross-border transfer, CNDP and security reviews are signed off.
- Every data access must be scoped to the authenticated user's ownerId; add negative authorization tests for every resource endpoint.
- Never log passwords, access tokens, document contents, medication details, or personally identifying health information.
- Prefer additive schema migrations; never run destructive migrations against non-local environments.
- Add audit events for access to, creation, modification and deletion of sensitive records.
- Treat uploaded documents and extracted text as untrusted input; defend against malicious files and prompt injection.

## Standard change workflow

1. Read `README.md`, `docs/architecture.md`, and relevant module code.
2. State assumptions and acceptance criteria before implementing substantial changes.
3. Implement the smallest coherent vertical slice.
4. Add unit/integration tests, including authorization and invalid-input tests.
5. Run `npm run build`, `npm test`, and migration checks; report commands actually run and results honestly.
6. Update API docs and `docs/decisions/` when contracts or architecture change.
7. Flag any unresolved privacy, Moroccan legal, security, or clinical-safety decision; do not silently decide it.

## Agent roles

- **Backend Implementer**: API, DTOs, services, Prisma migrations; follows existing module patterns.
- **Security & Privacy Reviewer**: threat model, authz, secrets, upload validation, auditability, retention, Law 09-08/CNDP questions; must be independent of the implementer.
- **Clinical Safety Reviewer**: checks medication and AI workflows for unsafe medical claims and missing clinician/patient confirmation.
- **QA/Test Agent**: builds API tests, tenant-isolation tests, abuse cases and regression suite.
- **Architecture Reviewer**: evaluates boundaries, scalability, resilience, ADRs and migration safety.

Agents propose code; a human maintainer reviews and merges it. Agent output is not legal or clinical approval.

## Medical data safety requirements

- Do not persist original medical documents or raw OCR output by default.
- Do not send identifiable fields, source IDs, raw text, or reverse mappings to an anonymous dataset.
- Keep provider-specific code behind `CloudStorageProvider`.
- Keep cloud integration and anonymization fail-closed until reviewed implementations and tests exist.
- Use synthetic data only; do not claim legal compliance or production readiness.
- Follow `docs/solution-architecture-v1.1.md` and `src/processing/processing-data-policy.md`.
