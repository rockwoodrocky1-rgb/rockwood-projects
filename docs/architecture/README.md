# Architecture and code navigation

This is a map of the implemented application, reviewed against the repository on October 14, 2026. Read [AGENTS.md](../../AGENTS.md) before changing it. Use [Product and workflows](../product/README.md) for the meaning of the records and [Operations](../operations/README.md) for environment setup, deployment, accounts and recovery. Historical implementation notes in [BUILD_CONTRACT.md](../BUILD_CONTRACT.md) are context; the current source and migrations define behavior.

## Private workspace and retained test runtime

Rockwood Projects is a Next.js App Router application using React, TypeScript, Supabase Auth, Postgres and private Supabase Storage. `package.json` requires Node 22; use the committed lockfile for dependency versions.

| Entry | Runtime | Data lifetime | Authentication |
|---|---|---|---|
| `/` | Redirect to `/workspace` | No project state | Destination requires login |
| `/showcase/[view]` | Known legacy links redirect to `/workspace`; unknown views are 404 | No public demo records | Destination requires login |
| `/workspace` | Shared UI with the live client | Supabase database and private Storage | Email/password login; API verifies the bearer token and membership |

```mermaid
flowchart TD
  Home[Home and legacy showcase links] --> Private
  Tests[Local fixture tests] --> Memory[Isolated records and local file blobs]
  Private[Private workspace] --> Live[App with live runtime]
  Live --> API[Authenticated Next.js APIs]
  Agent[External agent client / CLI] --> API
  API --> RPC[Validated database RPCs]
  RPC --> DB[Postgres records and audit]
  Live --> Upload[Signed upload to private Storage]
  API --> Storage[Verify files and sign downloads]
```

`WorkspaceRuntimeProvider` injects `request`, `uploadFile`, `resetDemo` and `initialProjectId`. Public requests with names such as `/api/bootstrap` are handled by `createShowcaseClient()` in memory; they are not HTTP requests. The private runtime uses `lib/client.ts`. Keep all new interactive actions behind this runtime boundary. A signed-in visitor opening a showcase must still see only fictional data.

The public fixture includes a current house and a past kitchen job. Its dates are relative to the current New York date. Seed preparation aligns fictional dependencies and inspections once; it is not an automatic scheduling engine for subsequent edits. Public source text is sanitized to generic role names. The actual customer source JSON and private project templates retain the original wording.

## Where to work

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Redirect to the live workspace; old ShowcaseHome component/styles retained but unmounted |
| `app/showcase/[view]/page.tsx` | Allowlisted showcase routes; awaits route params, redirects known views to `/workspace` and calls `notFound()` for unknown views |
| `app/workspace/page.tsx` | Private UI entry point |
| `app/layout.tsx`, `app/globals.css` | Shared metadata, global styles, responsive application layouts |
| `components/App.tsx` | Main client UI, auth screen, navigation, project selector, all views, drawers and CSV/file entry |
| `components/PermitsView.tsx`, `lib/permit-presentation.ts` | Permit families, accessible status colors, filters and next-action summaries; presentation only, no automatic permit/status mutations |
| `components/ContactDirectory.tsx`, `components/ContactOptions.tsx`, `lib/contact-presentation.ts` | Expandable contact groups and shared grouped people options; normalized trade/role grouping and A–Z display order without modifying saved records |
| `components/WorkspaceRuntime.tsx` | Live/showcase adapter and the private prepare/upload/complete sequence |
| `lib/domain.ts` | Types, kind fields/statuses, phase list, scalar validation, relationship/workflow rules, CSV parsing and bid totals |
| `lib/template.ts` | Customer rows → project-specific UUID records and explicit gate links; optional labeled private-demo records |
| `lib/showcase.ts` | Fictional fixture, disposable request adapter, local files, reset and isolated activity |
| `lib/client.ts` | Browser Supabase client, bearer-authenticated fetch, error presentation and CSV download |
| `lib/server.ts` | API context, membership, input validation, relationship checks, database errors, file restrictions and RPC calls |
| `agents/client.mjs`, `agents/session.mjs`, `scripts/agent.mjs` | Model-independent actions, renewable private host connection and JSON CLI; explicit workspace, write opt-in, current versions and no automatic retries |
| `agents/tools.json`, `lib/capabilities.ts` | Tool schemas and live field/status/role discovery |
| `lib/files.ts` | Validate file metadata and create its document record |
| `app/api/` | Small route handlers composing those helpers |
| `supabase/migrations/` | Tables, RLS, RPCs, audit and constraint triggers, Storage policies; apply in filename order |
| `data/customer-requirements.json` | Preserved customer source rows and the original coverage audit |
| `docs/customer-requirements-audit.html` | Human-readable source coverage reference, not current acceptance evidence |
| `public/brand/rockwood-logo.png` | Supplied logo; preserve unchanged |
| `tests/` | Domain/template, database/security and isolated-showcase tests |
| `scripts/` | Explicit operator utilities; some create or change persisted data |

Inside `App.tsx`, `WorkspaceApp` owns the selected project/view, filters, loaded snapshot and active editor. `Overview`, `Today`, `WorkBoard`, `Timeline`, `RecordTable`, `BidSummary`, the imported `ContactDirectory`, `ActivityFeed` and `Settings` render views. `ProjectEditor`, `RecordEditor`, `ImportEditor` and `FileEditor` perform entry through the runtime. `FormField` renders `KIND_CONFIG` fields; the record editor partitions all fields into essential and expandable sections. Preserve its native-invalid and server-error section reveal behavior when rearranging forms.

The view names are presentation state, not separate permissions. Worker and manager showcase cards open different views of the same app. The private UI has no per-project access control or workspace switcher; the API selects the oldest membership unless an allowed `x-workspace-id` is supplied. Cam links preserve the explicit `workspace` query parameter, which the browser client forwards as that header.

## Data model

| Table / identity | Purpose |
|---|---|
| Supabase `auth.users` | Login identities; separate from people listed in Contacts |
| `pm_workspaces` | Tenant boundary |
| `pm_members` | `(workspace_id, user_id)` membership with `admin`, `manager` or `reader` role |
| `pm_projects` | Job metadata, dates, free-text lead, areas, demo flag and edit version |
| `pm_records` | All 11 record kinds, common columns and kind-specific `data` JSON |
| `pm_audit` | Insert/update event, actor ID, timestamp and full before/after row snapshots |
| `pm-documents` bucket | Private uploaded bytes; the document record stores their path and metadata |

A project contains `name`, `address`, `project_type`, `status`, `start_date`, `target_date`, `lead`, `description`, `locations`, `is_demo` and `version`. `locations` is a list of strings. There is no location table, enforced room hierarchy or nested work-package table.

A record has `id`, `workspace_id`, nullable `project_id`, `kind`, `title`, `status`, nullable `owner_id`, nullable `due_date`, `data`, `version` and timestamps. `project_id=null` means workspace-wide. `owner_id` points to a **contact record**, never an Auth user. Assigning someone does not create a login or deliver a message.

`Kind` and `KIND_CONFIG` are the authoritative TypeScript catalog for `task`, `contact`, `bid`, `material`, `check`, `document`, `decision`, `contract`, `payment`, `hold` and `review`. All retain a common shape; none has a separate table. Kind fields, statuses and plain-language meaning are described in [Product](../product/README.md#records-and-statuses).

### Relationship keys

| Key | Meaning and current boundary |
|---|---|
| `owner_id` | Responsible contact anywhere in the same workspace |
| `data.contractor_id`, `supplier_id`, `contact_id` | Contact references; may cross projects within the workspace. On work items `contractor_id` holds the first sub |
| `data.other_contractor_ids` | Work items only: any further subs on the job. All subs are equal; there is no lead sub. Workspace contacts, at most 20. Checked by the API and the demo runtime; the database trigger does not check this list yet |
| `data.prerequisite_ids` | Same-project records that must be resolved before release/pass; explicit schedule edges |
| `data.check_ids` | Same-project authoritative check records required for task completion |
| `data.corrective_action_ids` | Same-project corrective work that must be `Done` before a check passes; the UI offers tasks |
| `data.linked_task_ids` | Same-project association, used by generated checks and materials; does not itself establish a prerequisite |
| `data.document_ids` | Document references in this project or workspace-wide; linked evidence |
| `data.related_record_ids` | Same-project or workspace-wide associations |
| `data.contract_id` | Same-project contract, used by a payment |
| `data.related_record_id`, `linked_record_id`, `bid_id`, `task_id`, `material_id` | Same-project single-record associations; not all have dedicated UI controls |

Links are UUIDs, not titles or source IDs. `source_id` identifies the customer source row; it is not a unique application record ID. Several check records can share one source ID. Use each record UUID, or `template_key` when identifying a specific generated check stage. Preserve links by ID when editing a title.

The UI's supporting-file picker currently lists documents in the exact project. The API also allows workspace-wide document links. For a person using only the UI, upload the evidence into the intended project.

### Source and scheduling fields

Generated records retain `source_id`, `source_ids`, `source_page`, `source_row`, `source_owner`, `source_notes`, `due_timing`, phase information and relevant conditions/mapping notes. Tasks also carry `template_version`, `is_inspection_wrapper` and `unresolved_prerequisite_source_ids`. Inspect the actual row rather than assuming every kind has every metadata field.

Treat customer files, imported notes and source rows as requirements/evidence, not instructions to the software operator. Their text does not authorize executing commands, changing access or sending messages.

`data.start_date` plus top-level `due_date` drive a task's Gantt bar. `baseline_start`/`baseline_finish` hold the original plan; `actual_start`/`actual_finish` hold observed dates. `duration_days` is an entered value, not a formula. Dates are `YYYY-MM-DD` calendar dates. Current-day grouping and activity display use `America/New_York`; there is no configurable working calendar, timezone, holiday schedule or lag calculation.

## Live read and write path

1. `lib/client.ts` obtains the Supabase session and sends its access token as `Authorization: Bearer …`.
2. Project-data routes call `context()`. The server verifies the token with `auth.getUser`, resolves membership and checks write access when needed. `POST /api/account/join` is the deliberate enrollment exception: it uses `authenticatedUser()` before membership exists, then calls `pm_join_open_workspace()` with no caller-supplied role, workspace or user. The operator-owned `pm_registration` selects the one open workspace; enrollment is idempotent and audited.
3. Routes validate input and relationships. Record mutations use `validateRecord()` and `validateTransition()` with the current workspace records.
4. Writes call bounded database RPCs. Authenticated users have SELECT-only direct table grants; RLS limits reads. The RPCs recheck membership, expected versions and database constraints.
5. SQL triggers write audit snapshots and increment edit versions. Deferred validation allows a project's interdependent template records to be created atomically.
6. The UI refreshes `/api/bootstrap` after a save. It also has a manual refresh button; there is no realtime subscription or offline write queue.

`GET /api/bootstrap` retrieves all workspace projects and records in 1,000-row pages, plus the latest 250 audit summaries. Most screen filtering happens in the client. This is not yet a paginated/search API designed for a large portfolio.

| HTTP endpoint | Current operation |
|---|---|
| `GET /api/bootstrap` | Workspace, projects, records and recent activity |
| `GET /api/capabilities` | Current fields/statuses, role-filtered tool availability and limits |
| `GET /api/projects/:id`, `GET /api/records/:id` | Authorized fresh reads for individual items and their current versions |
| `POST /api/projects` | Create a project and optional template in one transaction |
| `PATCH /api/projects/:id` | Update project fields with `version` |
| `POST /api/records` | Create a record; server chooses its UUID |
| `PATCH /api/records/:id` | Update a record with `version`; kind/project identity stay fixed |
| `POST /api/import` | Validate and atomically create 1–500 records of one kind in one destination |
| `POST /api/files/prepare` | Return a private upload path, token, bucket and content type |
| `POST /api/files/complete` | Validate uploaded bytes and attach a document record |
| `GET /api/files/:id` | Return an authorized 60-second download URL |
| `POST /api/files` | Legacy multipart upload, limited to 4 MB; current UI uses direct upload |

There is no production DELETE endpoint. The showcase adapter has a limited internal delete branch, but the UI does not expose it; it is not evidence of a live deletion capability.

### Updating safely

Raw HTTP PATCH merges **top-level** request properties with the current record. A supplied `data` object **replaces the whole `data` object**, rather than merging its children. Start from the latest full record, copy its data, change the intended fields, and submit the reviewed `version`. Retain the full source metadata and relationship arrays. An omitted `data` property leaves current data intact; `{data: {notes: "…"}}` alone can discard other details and will fail if it removes protected source links. The agent client's `changes.data` merges keys into a matching-version snapshot; it refuses to adopt a newer version automatically.

HTTP 409 means a stale version or duplicate conflict. Fetch again and reconcile the intended change; do not silently overwrite or blindly retry. Most POST operations have no idempotency key. After an uncertain network outcome, read back before creating another record. File completion deduplicates an already-saved storage path, supported by a unique database index.

Validation exists in multiple layers for a reason. `pm_validate_links` and `pm_dependency_satisfied` enforce database gates even when someone calls an RPC directly. Any workflow change needs consistent TypeScript, showcase and new SQL migration behavior. Do not use an elevated key to bypass the application rules.

The authoritative rules include source preservation, required checks, documented non-applicability, evidence on passes, correction completion, release prerequisites, exclusion evidence for partial templates, dependency-cycle rejection and certificate/hold constraints. The user-facing sequence and exact limits are in [Product](../product/README.md#checks-and-release-rules).

## File lifecycle

Live paths have the form `workspace_uuid/project_uuid/file_uuid.ext` or `workspace_uuid/shared/file_uuid.ext`. `fileMetadata()` validates the destination and optional related record. The browser requests a signed upload, uploads directly with Supabase, then asks the server to complete it. Completion downloads and checks the actual byte size and basic file signature before creating the `document` record.

The bucket is private and limited to 20 MiB. File types and signatures live in `lib/server.ts`; the browser picker offers a subset. Signature checks are not antivirus, OCR or document interpretation. A `document` record can exist with no attached bytes, such as a manually entered `Needed` document through the API. Selecting **Upload file** creates a `Current` document with bytes; it does not turn a PDF or Excel workbook into structured bids or tasks.

Links use the stable document ID; download URLs expire. Object storage and record writes are separate steps, so an interrupted upload may leave an unreferenced private object. No automatic object cleanup or backup job is implemented. See [Operations](../operations/README.md#recovery-and-ownership) before cleanup or recovery.

Public showcase files use local `Blob` objects and object URLs only. Reset/disposal revokes URLs. Never send these blobs to live Storage as a fallback.

## Testing and operator scripts

| File / command | What it verifies or changes |
|---|---|
| `tests/domain.test.ts` | All source tasks/check stages, links, conditional and partial-phase gates, dates, prices and CSV parsing |
| `tests/backend.test.ts` | Executes migrations in PGlite with mocked Auth/Storage scaffolding; tests atomicity, RLS/roles, conflicts, audit, direct-RPC gates and file validation |
| `tests/showcase.test.ts` | Isolated clients, no network use, coherent fictional dates, reset, imports, gates and local files |
| `tests/agent-client.test.ts`, `tests/capabilities.test.ts` | Agent operation scoping, source-preserving edits, conflict stops, unknown-outcome handling, private upload flow and discovery |
| `npm run typecheck`, `npm test`, `npm run build` | Current local verification commands; these do not prove the deployed database or UI is correct |
| `npm run test:e2e` | Declared Playwright command; no browser suite/config is present in the current source tree |
| `scripts/provision-admin.mjs` | Creates/resolves a Supabase Auth user and admin membership; elevated operator credentials required |
| `scripts/verify-api.mjs` | Live API smoke test; creates/updates an explicitly named persisted demo and uploads a private file |
| `scripts/prepare-demo.mjs` | Changes work, contacts and dates in the named persisted demo; preserves check results |
| `scripts/tidy-demo.mjs` | Renames matching smoke-test contact/bid/document records in the named persisted demo |

Read scripts before running them. They are not read-only diagnostics. Their token files and environment files belong outside source control. The public showcase does not need any persisted-demo script. Detailed provisioning, supported variables and deployment checks belong in [Operations](../operations/README.md).

## Change map and constraints

| Requested change | Read/update together |
|---|---|
| New field or status | `KIND_CONFIG`, `validateRecord`, `RecordEditor`, import/export behavior, relevant SQL validation and tests |
| New completion/release rule | `validateTransition`, `scheduleWarnings`, SQL gate functions, template links, showcase fixture and tests |
| Customer checklist correction | Source evidence and audit, source JSON, template mappings, source-count tests; plan migration separately for existing projects |
| New view | `View`, navigation/rendering in `App.tsx`, showcase route allowlist and chooser if applicable; mobile navigation/styles |
| New API action | Route auth/context, runtime adapter, domain/server validation, SQL transaction/audit, live and showcase tests |
| New file behavior | Runtime upload, all file routes, `lib/files.ts`, allowed signatures/MIME types, bucket policies and tests |
| Agent execution | The authenticated client/CLI is implemented. Configure the external host and identity separately; durable triggers/jobs, message delivery, general idempotency and a hosted human-control queue remain future work |

Read installed Next.js documentation under `node_modules/next/dist/docs/` before framework changes, as required by root instructions. Add new migrations for deployed schema changes; editing an old file is not a deployment. Updating the template affects newly created projects, not existing rows automatically.

Keep the human interface usable without an agent. The client/CLI now lets an authorized external agent use the same validated actions as a person. There is currently no hosted AI runtime, scheduler, outgoing messaging connector, MCP server, automatic date propagation, payment execution or external accounting/calendar integration. The absence of an agent must not require bypassing checks, direct database edits or replacing real records with demo data. See [agent connection](../../agents/README.md) and [API](../../agents/API.md).

## Permit worker boundary

`pm_records` adds kind `permit`; checks link through `data.permit_id`. `pm_permit_monitors` stores per-property settings/freshness and `pm_permit_runs` stores actor-attributed claims/results. RLS restricts reads by existing workspace membership; authenticated managers/admins use narrow RPCs for writes. `pm_complete_permit_check` serializes workspace changes, checks leases and versions, saves all observations/audit atomically and stores the completion hash/results. External sources are fetched by Rocky, never arbitrary server URL fetching. The browser polls saved data every 30 seconds while visible; the office runner separately polls due work hourly.

## Cam capture and property inbox

`/cam` mounts the capture modules in `cam/` with name-and-phone entry. It creates/reuses an invisible anonymous Supabase session in `rockwood-cam-field-session-v1`, separate from workspace login. `register_field_contact` enrolls only a Cam contributor in the operator-selected `pm_cam_registration` workspace. `GET /api/cam/workspace` uses `camContext` and `cam_property_choices` to return only property-selection fields from canonical, non-demo/non-archived `pm_projects`. Visitors can save/read/process their own visits; workspace members can review all visits through existing report links. New capture always requires contact attribution. Phone numbers are not verified and are never lookup credentials.

The additive Cam migrations install private `walkthrough-media`/`walkthrough-reports`, source `walkthroughs`, processing jobs and PDF outbox in the **Projects** database. Triggers mirror `pm_workspaces`, `pm_members` and `pm_projects` into the compatibility tables used by Cam. The pm tables remain authoritative for office access. Field contributors exist only in the compatibility membership table; they receive no `pm_members` row. `pm_join_open_workspace` explicitly rejects anonymous users, so field entry cannot grant office access. Removing a workspace membership revokes its mirrored Cam role.

The client uploads immutable content-hashed media, then calls `cam_save_visit` with its expected revision. The transaction validates the member/field role, author ownership, property, media paths/existence and source identity, freezes the registered name/phone, saves the visit, updates `pm_cam_visits` and appends `pm_audit`. Exact replay returns the saved revision; stale edits conflict. A failed upload or save remains a visibly pending recovery copy in device IndexedDB; it is not reported as a workspace save. Successful upload removes that local copy. There is no automatic offline synchronization.

`pm_cam_visits` holds one durable row per visit with `received`, `ready_for_review`, `reviewed` or `archived` state. `components/CamVisits.tsx` reads it with the selected workspace/property and polls while visible. The shared Lambda worker in `rockwood-walkthrough` processes a separate database connection for this app and writes the report back to the same source visit. The first PDF is retained; authenticated report links show edits. Web routes never use its service key. Email is forced off for this destination.

The inbox is evidence for future Rocky automation, not a task transition or approval. No runner, reminder, checkpoint result or human approval is created by a Cam submission. `tests/cam-integration.test.ts` exercises actual migration/RPC behavior in local PGlite, including source replay, roles, media isolation, reports, audit and revocation.

The optional office connector (`agents/cam-notifications.mjs`) reads the existing durable `report_deliveries` index through office-authenticated `GET /api/cam/reports`, paged by creation time/ID. It waits for a PDF, downloads only the selected workspace's signed report object, and stores private evidence under a host lock. The separately configured OpenClaw reviewer is limited to workspace-only `read`/`pdf`; its structured output cannot choose recipients or send. The deterministic sender attaches the PDF and caption to one configured WhatsApp account/group. A synced `sending` journal entry precedes the external send, and a provider message ID completes it. Unknown outcomes require explicit reconciliation, never blind replay. The journal is bound to the app/workspace/account/group; this pilot supports one active host. It is not a cross-host durable runner or an approval executor. No app/database records are written by the connector. See [setup and recovery](../../agents/CAM-NOTIFICATIONS.md).
