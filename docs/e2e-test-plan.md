# End-to-end test plan

## Purpose and safety boundary

Validate user-visible API journeys and security boundaries using synthetic
accounts, synthetic values, and synthetic documents only. This plan does not
authorize real health-data testing. The current application is a prototype:
local document storage, OCR, cloud storage, anonymous-data submission, and AI
processing are not production-approved.

"Medical planning" in this plan means the existing patient-managed medication
record CRUD API. It does not mean generating a diagnosis, treatment plan, or
medication recommendation. Prescription extraction candidates are provisional;
patient confirmation is not clinician verification or medical advice.

Do not connect tests to production services or real patient records. Keep OCR
disabled or mocked, cloud/anonymous integrations fail-closed, and AI disabled.

## Environment and test data

- Run against a dedicated local/CI test configuration and disposable database.
- Use synthetic identities (for example `patient-a@test.example`), synthetic
  prescription candidates, and generated minimal file fixtures.
- Never place patient information, actual health documents, OCR text, secrets,
  or access tokens in fixtures, logs, CI artifacts, or failure screenshots.
- Do not use real external AI, OCR, cloud-storage, email, SMS, analytics, or
  notification services.
- Reset test state between scenarios and clean up any temporary files/database
  state after each run.
- E2E tests must not depend on test ordering or production credentials.

The current automated suite starts the Nest application over HTTP, with a
synthetic in-memory Prisma test double and mocked prescription processing. It
exercises routing, validation, authentication, and controller/service
integration, but does not verify SQL migrations, real database constraints,
file storage, or actual OCR. Add a separate disposable-database integration
stage before claiming those layers are covered.

## Scenario matrix

| Area                | Scenario                                                                       | Expected result                                                                          | Priority |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------- |
| Authentication      | Register a valid synthetic patient                                             | Account and profile are created; response contains a token but not password/hash         | P0       |
| Authentication      | Register with an email using different letter casing                           | Email is normalized consistently                                                         | P0       |
| Authentication      | Register an existing email                                                     | Conflict response; no second account                                                     | P0       |
| Authentication      | Invalid email, short/long password, unknown fields                             | Validation error; no account created                                                     | P0       |
| Authentication      | Login with valid credentials                                                   | Token works on protected endpoints                                                       | P0       |
| Authentication      | Wrong password, inactive or unknown account                                    | Generic authentication failure; no token                                                 | P0       |
| Authentication      | Missing, malformed, expired, or invalid bearer token                           | Protected routes reject request                                                          | P0       |
| Profile             | Read and update own profile                                                    | Only the authenticated account's profile changes                                         | P0       |
| Profile             | Read profile without token                                                     | Unauthorized response                                                                    | P0       |
| Profile             | Submit invalid date, oversized field, or unknown property                      | Validation error; no partial update                                                      | P0       |
| Profile             | Two accounts read/update profiles                                              | Account B cannot observe or modify account A's profile                                   | P0       |
| Medication plan     | Create/list/update/delete own medication record                                | Changes persist; owner is assigned from token, not request body                          | P0       |
| Medication plan     | List records as another user                                                   | No records owned by the first user are returned                                          | P0       |
| Medication plan     | Change/delete another user's record                                            | Access is denied without disclosing or changing its data                                 | P0       |
| Medication plan     | Missing required name/dosage/date, invalid status/date, oversized fields       | Validation error; record remains unchanged                                               | P0       |
| Prescription        | Read a synthetic candidate requiring review                                    | Candidate is marked provisional/review-required                                          | P0       |
| Prescription        | Correct a candidate                                                            | Only allowed candidate fields are changed; remains unconfirmed                           | P0       |
| Prescription        | Confirm reviewed candidate                                                     | Confirmation is recorded only for the owner; never represented as clinician verification | P0       |
| Prescription        | Reject candidate, with/without reason                                          | Candidate is rejected for that owner                                                     | P0       |
| Prescription        | Read/review/confirm/reject another user's candidate                            | Access denied; no state changes                                                          | P0       |
| Prescription        | Invalid confidence, nested fields, unknown property, invalid status transition | Validation/domain error; no unsafe mutation                                              | P0       |
| Documents           | Upload supported synthetic PDF/JPEG/PNG                                        | Metadata and ownership correct; no content or storage key leaks in normal response       | P1       |
| Documents           | Unsupported, malformed, oversized, missing, or deceptive file                  | Request rejected; no orphan file or database record                                      | P1       |
| Documents           | List/download/delete another user's document                                   | Access denied; owner data unchanged                                                      | P1       |
| Document processing | OCR disabled, unavailable, timeout, malformed output                           | Safe failure state; no raw content in logs; temporary data cleaned                       | P1       |
| Document processing | Successful mocked OCR                                                          | Candidate remains review-only; no medication is created before confirmation              | P1       |
| Retention           | Candidate expiry, purge on startup/request, purge failure                      | Expired data inaccessible; purge failure is surfaced/alerted without sensitive logging   | P1       |
| Audit               | Access/create/update/delete sensitive records                                  | Expected audit event and actor/resource association; no clinical payload or credentials  | P1       |
| AI summary          | Request with owned synthetic document while provider disabled                  | Explicit disabled response; no clinical conclusion/recommendation or external call       | P1       |
| AI summary          | Request with another user's or unknown document ID                             | Rejected; no disclosure or summary                                                       | P1       |
| Cloud status        | Authenticated status request                                                   | Reports disabled global capability only; unauthenticated request denied                  | P1       |
| Anonymous data      | Pipeline disabled, unconfirmed, unknown fields, gateway rejects/errors         | Nothing is written; no pass-through anonymization                                        | P1       |
| Resilience          | Database/service failure, throttling, malformed JSON                           | Safe non-success response; no success-shaped fallback or sensitive error details         | P2       |
| Operations          | Migrations, clean database setup, test cleanup, repeatability                  | CI uses disposable resources; repeated runs pass without residual state                  | P2       |

P0 is the initial implementation gate. P1 covers additional privacy and
integration-critical flows. P2 covers operational hardening. Prioritize
negative authorization cases for every resource endpoint.

## Implemented in the initial E2E slice

`test/application.e2e-spec.ts` currently covers HTTP registration/login,
profile reads/updates, patient-managed medication CRUD, and mocked prescription
review/confirm/reject. It includes synthetic owner-isolation, validation, and
authentication cases. It does not run actual OCR or a real database.

## Exit criteria

- All P0 scenarios pass on the CI test environment.
- Tests use synthetic data and cannot reach production or unapproved external
  services.
- Each resource route has a negative cross-owner authorization test.
- Invalid-input tests assert rejection and no persisted mutation.
- Logs and test artifacts are reviewed for sensitive information.
- For any future real-data test proposal, obtain the required independent
  privacy, security, legal, and clinical approvals first. This plan is not an
  approval or compliance determination.
