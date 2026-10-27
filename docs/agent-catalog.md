# Medical Folder agent catalog

This catalog describes the repository-specific VS Code custom agents in `.github/agents/` for the Medical Folder workspace: the NestJS backend in this repository and the separate Flutter starter at `../medical_folder_flutter_starter`. The agents are intentionally narrow and designed to keep healthcare privacy, consent, and patient safety at the top of the workflow. Treat the two projects' implementation status separately; the Flutter starter is a local in-memory demo and is not connected to the backend.

## Shared principles

- Use synthetic data only.
- Require patient ownership and scope checks for all access.
- Treat OCR and AI output as provisional and untrusted.
- Keep external integrations behind approved abstractions and fail closed.
- Use human approval for production-facing privacy, legal, retention, or clinical-safety changes.

## Agent map

| Agent | Primary focus | Typical work |
| --- | --- | --- |
| `solution-architect` | requirement mapping, scope, and coordination | triage, acceptance criteria, risk framing |
| `backend-implementer` | NestJS and Prisma service work | DTOs, controllers, schemas, migrations |
| `security-privacy-reviewer` | auth, storage, governance, and legal review | IDOR checks, audits, consent constraints |
| `clinical-safety-reviewer` | medication and AI safety | confirmation flows, summary safety, warnings |
| `qa-test-engineer` | validation and regression | unit, integration, authz, and edge-case tests |
| `ocr-processing-engineer` | medical document extraction and review | OCR limits, confidence handling, cleanup |
| `cloud-storage-privacy-engineer` | secure provider boundaries | abstraction design, fail-closed behavior |
| `medication-planner-notification-engineer` | schedules and reminders | idempotent delivery and patient confirmation |
| `architecture-reviewer` | maintainability and migration safety | boundary checks, ADR conflicts |
| `developer-documentation-engineer` | onboarding and docs | setup descriptions, API docs, architecture notes |
| `mobile-app-engineer` | Flutter client UI and safe API integration | screens, accessibility, localization, client contracts |

## Collaboration model

1. The solution architect identifies the affected project(s), scope, and module boundaries.
2. The matching backend or mobile specialist reviews the requirement, dependency risks, and safety constraints.
3. The relevant implementer makes the minimal verified change. Cross-project client work must use verified backend contracts.
4. The QA engineer validates each changed project with synthetic fixtures and relevant test commands.
5. The privacy or clinical reviewer checks the risk profile when sensitive workflows are involved.
6. The documentation engineer updates setup or API docs if behavior changed.

This keeps the work small, reviewable, and aligned with the repo's healthcare data constraints.
