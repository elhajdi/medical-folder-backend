# API overview (prototype)
Base path: `/api/v1`; interactive OpenAPI: `/api/docs`.

Route handlers are implemented by the NestJS controllers in `src/health.controller.ts`, `src/auth/auth.controller.ts`, `src/profile/profile.controller.ts`, `src/documents/documents.controller.ts`, `src/medications/medications.controller.ts`, and `src/ai/ai.controller.ts`. Import [`postman/healthcare-backend.postman_collection.json`](../postman/healthcare-backend.postman_collection.json) into Postman to try the endpoints.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Liveness |
| POST | `/auth/register` | No | Create patient account |
| POST | `/auth/login` | No | Obtain access token |
| GET/PUT | `/profile` | Yes | Read/update profile |
| GET | `/documents` | Yes | List own document metadata; optional `?type=LAB_RESULT` |
| POST | `/documents/links` | Yes | Link two of the patient’s documents with a relationship label |
| GET | `/documents/:id/links` | Yes | List links touching one owned document |
| POST | `/documents/upload` | Yes | Multipart upload (`file`, `type`, `title`, optional `description`, `documentDate`) |
| GET | `/documents/:id/download` | Yes | Download own document |
| DELETE | `/documents/:id` | Yes | Delete own document metadata/file (physical-file cleanup needs production hardening) |
| GET/POST | `/medications` | Yes | List/create own medication plans |
| PATCH/DELETE | `/medications/:id` | Yes | Update/delete own medication plan |
| POST | `/ai/medical-history-summary` | Yes | Disabled AI response with source document references |

All endpoints are prototypes; see README for gaps before production.
