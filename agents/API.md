# Shared HTTP API

Base URL: the explicitly configured deployment origin. All routes below require `Authorization: Bearer <Supabase user access token>`. Send `x-workspace-id: <workspace UUID>` on every agent request. The raw API can otherwise choose the oldest membership; the agent client requires an explicit workspace to prevent that ambiguity.

Every response is JSON with `Cache-Control: no-store`. Error bodies use `{ "error": "message" }`. JSON request size defaults to 1 MB; imports allow up to 4 MB and 500 rows. Request/response identifiers are UUIDs. Dates use `YYYY-MM-DD` or `null` to clear.

## Routes and matching tools

| HTTP route | Tool | Result |
|---|---|---|
| `GET /api/capabilities` | `capabilities` | `schemaVersion`, `workspace`, `recordKinds`, `tools`, `rules`, `notImplemented` |
| `GET /api/bootstrap` | `snapshot` | `workspace`, `projects`, `records`, latest 250 `events` |
| `GET /api/projects/:id` | `get_project` | `{ project }` |
| `GET /api/records/:id` | `get_record` | `{ record }` |
| `POST /api/projects` | `create_project` | `{ project }`, HTTP 201 |
| `PATCH /api/projects/:id` | `update_project` | `{ project }` |
| `POST /api/records` | `create_record` | `{ record }`, HTTP 201 |
| `PATCH /api/records/:id` | `update_record` | `{ record }` |
| `POST /api/import` | `import_records` | `{ count }`, HTTP 201 |
| `POST /api/files/prepare` | first part of `upload_file` | private upload path/token/MIME/bucket |
| Supabase signed Storage upload | second part of `upload_file` | upload confirmation |
| `POST /api/files/complete` | final part of `upload_file` | `{ record }`, HTTP 201 or 200 for an existing completed upload |
| `GET /api/permits` | `permit_dashboard` | `{ monitors, runs }` (latest 100 + active) |
| `GET /api/permits/queue` | `permit_queue` | `{ queue, generated_at, lease_minutes, interval_minutes }` |
| `PATCH /api/permits/monitor` | `configure_permit_monitor` | `{ monitor }`; settings version 0 if absent |
| `POST /api/permits/checks` | `claim_permit_check` | `{ run }`; stable request UUID, 30-minute lease |
| `GET /api/permits/checks/:id` | `get_permit_check` | `{ run }`, including saved observation results |
| `PATCH /api/permits/checks/:id` | `complete_permit_check` | `{ run }`; atomic observations and replay recovery |
| `GET /api/files/:id` | `get_file_url` | `{ url }`, valid 60 seconds |

There is no HTTP tool-dispatch route: the CLI/client dispatches tool names to these normal routes. There are no production delete, message-send, schedule-recalculate or payment-transfer endpoints. The legacy multipart `POST /api/files` remains available for files up to 4 MB; use the three-step flow for files up to 20 MB.

## Payloads

**Project creation:** `{ name, address?, project_type?, status?, start_date?, target_date?, lead?, description?, locations?, is_demo?, template?, selected_phases? }`. `template: true` creates the checklist in the same database transaction. Omit `selected_phases` for all phases; otherwise use integers 1–15. Dates for individual work are not automatically assigned from the project start date.

**Project update:** editable project fields plus the reviewed integer `version >= 1`. Omitted fields stay unchanged. The response includes the incremented version.

**Record creation:** `{ kind, project_id?, title, status?, owner_id?, due_date?, data? }`. Allowed kinds and all field/status choices come from live `recordKinds` / `lib/domain.ts`. A null `project_id` means workspace-wide. Server-assigned IDs, versions and audit fields are not caller-editable. `owner_id` refers to a contact record, not an Auth user. Relationship IDs belong in `data` and must resolve in the permitted scope.

**Record update:** partial base fields plus reviewed `version`. `kind` and `project_id` cannot change in place. Raw HTTP replaces the entire `data` object when provided: preserve all existing source metadata, links and unrelated fields. The agent client's `changes.data` merges keys into a freshly read snapshot only when its version matches the caller's reviewed version. Arrays replace entirely. The server still checks the final version at write time.

**Import:** `{ kind, project_id, rows: [RecordInput, ...] }`. Every row must have the same kind. The selected project overrides row project IDs. Duplicate titles in that kind/project and invalid rows reject the whole import. Rows cannot create references to other new rows by guessing server-assigned IDs. Create and verify referenced contacts first.

**Files:** metadata is `{ name, size, project_id, title, category, record_id? }`. Prepare returns `{ path, token, contentType, bucket }`. Upload bytes privately with that signed token, then complete with the same metadata plus `path`. Completion verifies actual size/signature and creates a document record; optional `record_id` links it to an existing item. The high-level client performs those steps and does not print the upload token. `document_ids` stores durable record IDs; signed download URLs expire and must not be stored as permanent references.

## Error handling

| Status | Meaning | Next action |
|---|---|---|
| 400 | Invalid fields, relationships, dates or workflow gate | Fix the cited condition using verified facts |
| 401 | Missing/expired user session | Host reauthenticates; never log or ask the model to invent a token |
| 403 | No membership or insufficient role | Stop; administrator resolves intended access |
| 404 | ID absent/inaccessible in selected workspace | Verify workspace and exact ID; do not guess alternatives |
| 409 | Stale version or duplicate | Read current state and reconcile; no force-overwrite |
| 413 | Payload too large | Use supported limits/flow |
| 500/502/503 or connection interruption | Server/storage problem; write may be uncertain | Inspect saved state before any repeated mutation |

The adapter never automatically retries mutations. A file upload may leave an unreferenced private object if finalization fails. Preserve sanitized path/metadata for recovery; do not recreate uploads blindly. Finalization checks for an existing storage path before attaching, but this is not a universal idempotency guarantee for concurrent retries. General creates have no idempotency keys.

## Shared authority and audit

Readers can read; managers/admins can create and update. Access is workspace-wide. UI and agents use the same narrow RPCs, validation and immutable database audit. Each audit entry records the authenticated user; distinct agent identities are the current way to distinguish their actions. The recent Activity list is not the full audit snapshot API.

Official inspection evidence and financial/contract decisions come from the authorized source. These endpoints record facts and decisions; they do not grant an AI inspector authority, sign a contract, send money or contact a contractor.

Permit payloads, outcomes, discovery, source requirements and recovery are specified in [PERMITS.md](PERMITS.md). Permit completion merges supplied data keys, preserves existing values, requires current versions and supports stable IDs for new records. This specialized contract does not change generic record PATCH semantics.
