# Operations

This document is for the person deploying and maintaining Rockwood Projects. The everyday workflow is in the [README](../README.md). API and storage details are also documented in [BACKEND.md](BACKEND.md).

## Local setup

The application uses Next.js App Router, React, TypeScript and Supabase. The development environment uses Node.js 22. Install the lockfile's dependencies and configure the two application variables:

```sh
npm ci
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. They identify the Supabase project and its public client key; access to private data is enforced by authentication, membership and database rules. Never put a service-role key in a `NEXT_PUBLIC_` variable or the deployed app runtime.

```sh
npm run dev
```

The local app opens at `http://127.0.0.1:8792`. There is no local-storage fallback for customer records. Missing configuration or membership is shown as an error, not as a successful save.

## Database and storage

Apply [202610130001_pm.sql](../supabase/migrations/202610130001_pm.sql) with the Supabase SQL editor or authorized migration tooling before first use. The migration creates `pm_` tables, membership and audit records, constrained write functions, row-level security and the private `pm-documents` bucket. These names are separate from the existing walkthrough application's tables.

Apply subsequent schema changes as new migrations. Do not assume editing a migration file changes an already deployed database.

The application runtime uses the signed-in person's JWT. Members can select allowed workspace data; writes use bounded RPC functions that check permissions, expected versions, relationships and workflow gates. Project creation with its template, imports, and individual edits with their audit entries are atomic.

## Provision the first administrator

Use [scripts/provision-admin.mjs](../scripts/provision-admin.mjs) from a trusted operator environment. Supply these variables privately:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Target Supabase project; the script also accepts `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Elevated key used only by the provisioning script |
| `PM_ADMIN_EMAIL` | Administrator account email |
| `PM_ADMIN_PASSWORD` | Password for a newly created account |
| `PM_WORKSPACE_NAME` | Optional workspace name; defaults to Rockwood Development |
| `PM_RESET_PASSWORD` | Optional; only the explicit value `true` resets an existing account's password |

With those variables loaded into the process:

```sh
node scripts/provision-admin.mjs
```

Alternatively, load them from a private, ignored environment file with Node's `--env-file` option. Do not commit that file or print its contents.

The script finds or creates the workspace, creates a confirmed Auth user if absent, and grants administrator membership. An existing account's password stays unchanged by default. Resetting an existing account affects that Supabase Auth account wherever it is used. Do not set the reset option unless that reset is intended.

There is no public signup or in-app member-management screen. To add another person, an administrator provisions their Supabase Auth account and adds its user ID to `pm_members` with the intended workspace and role. Use the Supabase administrative interface or an authorized administrative process; do not expose the elevated key to an end user's browser.

| Role | Current access |
|---|---|
| `admin` | Read and create/update workspace records |
| `manager` | Read and create/update workspace records |
| `reader` | Read-only workspace access |

Access is currently **workspace-wide**, not restricted to an individual worker's assigned tasks. There is no separate project-level access control. Ordinary app members cannot edit membership through the data-entry APIs.

## Deploy and verify

Connect the private [GitHub repository](https://github.com/rockwoodrocky1-rgb/rockwood-projects) to the intended Vercel project. Use the Next.js build, and configure the two `NEXT_PUBLIC_SUPABASE_*` variables for each environment that should connect to the database. Rebuild after changing public build-time variables. The service-role key is not required by Vercel.

Target production address: `https://rockwood-projects.vercel.app`. This document does not certify that deployment has completed.

Before customer use, verify the deployed application:

1. Sign in with a provisioned account and confirm the correct workspace.
2. Create a labeled demo and reopen it after refreshing. Verify work, checks, contacts and sample bid persistence.
3. Test a small CSV preview/import, an edit, and the resulting Activity entry.
4. Upload a private file and open its signed download.
5. Verify that unresolved checks block completion and that a reader cannot write.
6. Confirm that live projects are distinct from demo records and that automation remains inactive.

The app does not contain a demo-reset or record-deletion UI. Rehearse in a labeled demo; any later database cleanup requires an administrator and a deliberate plan for its related records and files.

## Validation commands

```sh
npm run typecheck
npm test
npm run build
```

The domain tests cover source completeness, real UUID links, conditional inspection gates, partial-phase handling, dates, bid arithmetic, CSV parsing and safe exports. Backend tests execute the migration in PGlite and check transaction rollback, role and workspace boundaries, stale-write protection, audit snapshots, direct-RPC validation and storage policies. Those tests do not replace verification against the deployed Supabase service and Vercel application.

## Files, exports and recovery

Files are stored in a private bucket, with a 20 MB upload limit. Supported formats include PDFs, images, Office files, CSV and text. The browser uses the prepare/upload/complete flow; finalization checks size and file signatures before saving the document record. Downloads require workspace access and receive short-lived signed URLs. Do not use those expiring URLs as permanent document references; retain the document record ID.

The workspace CSV export provides structured records and escapes spreadsheet formula cells. It does **not** include the uploaded file bytes, Auth users, membership, the full audit history, or a complete database restore procedure. The Activity screen shows the most recent 250 event summaries; stored audit snapshots remain in the database.

Set and verify an appropriate Supabase database backup and recovery policy for the deployed project. Back up Storage objects separately along with their paths, and retain the migrations and provisioning process. Test a restore into a separate environment before relying on the backup. This repository does not establish a scheduled backup job or certify a provider's configured retention.

Unfinished uploads may leave unreferenced private objects. No automatic cleanup job is enabled. Reconcile objects against saved document `storage_path` values before any intentional cleanup.

## Current boundaries and future agent connection

The tool operates manually. Saving a reminder preference does not schedule or send a message. AI processing, inbound replies, messaging connectors, calendar synchronization, accounting integration, automatic scheduling and walkthrough synchronization are not connected. The app requires network access; it does not queue offline mutations.

A future agent should use the same authenticated application actions as the UI. The existing API surface includes:

| Endpoint | Purpose |
|---|---|
| `GET /api/bootstrap` | Workspace, projects, records and recent activity |
| `POST /api/projects` | Create project and optional template |
| `PATCH /api/projects/:id` | Update project with its current `version` |
| `POST /api/records` | Create a validated record |
| `PATCH /api/records/:id` | Update record with its current `version` |
| `POST /api/import` | Validate and atomically import rows |
| `POST /api/files/prepare` | Prepare a private upload |
| `POST /api/files/complete` | Verify upload and attach its document record |
| `GET /api/files/:id` | Obtain a short-lived authorized download URL |

All require a valid Supabase bearer token and workspace membership. An optional `x-workspace-id` header selects another workspace only if the caller belongs to it. HTTP 409 indicates a stale version or duplicate conflict; reload and review the current record before retrying.

The repository alone does not give an agent live access, a scheduler, message delivery, or standing authority. Those require explicit connections and permissions. A later integration should add a dedicated identity and appropriate permission scope, durable execution, idempotency for retried actions, message delivery records, and clear human approval rules. It must preserve the existing inspection evidence, prerequisites, access checks and audit trail rather than write around them.
