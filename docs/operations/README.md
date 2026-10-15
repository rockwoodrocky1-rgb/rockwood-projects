# Operations

Use this guide to run, deploy, and recover the application. For field work and failed-agent handoffs, use [Human handoff](HUMAN-HANDOFF.md). Product behavior is described in the [main README](../../README.md); the [backend reference](../BACKEND.md) covers API and storage details.

## Know which environment you are using

| Location | Data and access |
|---|---|
| `/` and known `/showcase/*` links | Redirect to the private `/workspace`; the fictional public property is retired. |
| `/workspace` | Supabase sign-in and workspace membership required. Records and private files persist. |
| A demo project inside `/workspace` | Persisted Supabase records marked as demonstrations. This is separate from the public showcase and has no Reset button. |

The runtime boundary is in [WorkspaceRuntime.tsx](../../components/WorkspaceRuntime.tsx); the public fixture and actions are in [showcase.ts](../../lib/showcase.ts). Preserve this separation even when a visitor is already signed in.

## Local setup

Use **Node.js 22** and the committed lockfile. From the repository root:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:8792`. The app opens the private workspace. Fill in the two values from [.env.example](../../.env.example) before starting the server:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use the intended Supabase project's URL and public client key. Never put a service-role key, user password, or access token in a `NEXT_PUBLIC_` variable or committed file. `.env.local` is ignored. Live saves require a network connection; there is no offline queue or local fallback.

For a new private environment:

1. Apply [the initial migration](../../supabase/migrations/202610130001_pm.sql), then [the conflict-status migration](../../supabase/migrations/202610130002_conflict_http_status.sql), using authorized Supabase administration. These create the `pm_` schema objects and private `pm-documents` bucket. Record which migrations have been applied.
2. Run [provision-admin.mjs](../../scripts/provision-admin.mjs) from a trusted operator process. Supply `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PM_ADMIN_EMAIL`, and `PM_ADMIN_PASSWORD` privately; `PM_WORKSPACE_NAME` is optional. The script does not load `.env.local` itself. With variables already loaded, run `node scripts/provision-admin.mjs`.
3. Sign in at `/workspace` and confirm the workspace. Existing passwords are preserved unless the operator explicitly sets `PM_RESET_PASSWORD=true`; resetting affects that Auth account wherever it is used.

The login screen includes **Create account** and **Forgot password**. Rockwood’s owner has explicitly selected open enrollment: any authenticated account may join the configured Rockwood workspace as a **manager**, with access to view and edit all projects and files. No invite or manual approval is required. Existing members retain their roles, including readers. Administrative membership management remains outside the app.

Apply `202610150002_self_service_accounts.sql` after the permit migration. It configures only Rockwood workspace `80c3b3e9-025c-45e1-81fd-bfdbd2f56be2`; other environments need an explicit operator-owned `pm_registration` row. The authenticated `POST /api/account/join` calls an idempotent RPC that derives the caller from the verified session, fixes the role to manager, and records the first enrollment in Activity. It accepts no workspace, user or role parameters. Anonymous access, direct table writes, RLS and workflow gates remain unchanged.

Before activating sign-up in production:

1. In Supabase Authentication → Sign In / Providers, enable **Allow new users to sign up**. For the requested immediate entry, disable **Confirm email**; the UI also handles confirmation-required environments and resend errors.
2. Set the Site URL to `https://rockwood-projects.vercel.app/workspace` and allow `https://rockwood-projects.vercel.app/workspace` and `https://rockwood-projects.vercel.app/workspace?recovery=1` as redirect URLs. Keep any other deliberately configured origins.
3. Password reset email delivery needs a working custom SMTP provider for arbitrary team emails. Supabase’s default mail service is restricted and is not a production mail setup. Do not claim delivery has been verified by mocked browser tests.
4. Verify the public Auth settings, database enrollment and deployed form. Any live test identity should be explicitly disposable and must not create a real project.

To stop new enrollment, disable Auth signups and set `pm_registration.enabled=false` through authorized administration. Existing memberships stay intact. Account creation and workspace membership are separate, so an interrupted first visit can be retried safely without duplicate memberships or audit events.

## Deploy

The current public address is [rockwood-projects.vercel.app](https://rockwood-projects.vercel.app). The source repository is [rockwoodrocky1-rgb/rockwood-projects](https://github.com/rockwoodrocky1-rgb/rockwood-projects).

1. Connect the intended Git branch to the intended Vercel project with the Next.js preset and Node.js 22. Confirm the target environment before changing configuration.
2. Configure the two public Supabase variables for each environment that needs private-workspace access. Keep test/preview database targets deliberate: a preview using production credentials reaches production data. Vercel does not need the service-role key.
3. Apply any new migrations to the matching database before deploying code that requires them. Add new migration files for schema changes; editing an already-applied file does not update the database.
4. Deploy the reviewed commit, inspect the build result, and perform the checks below on its deployed URL. Public variables are included at build time, so changing them requires a new build.

Record the deployed commit, Vercel deployment URL, database project, applied migrations, and verification outcome in the release record. Application rollback does not reverse database migrations or restore data.

## Connect an authorized agent

The repository includes a model-independent [client and connection guide](../../agents/README.md), [HTTP API reference](../../agents/API.md), and `npm run agent` CLI. These let an external agent use the same validated records as a person. They do not host a model, scheduler, MCP server, or message sender.

Configure a provisioned user identity and an explicit workspace in the host, following the agent guide. Keep tokens outside model arguments and use a distinct identity if audit history needs to distinguish the agent from a person. The client defaults to read-only; the host must deliberately enable writes, and the CLI requires `--write`. Neither option overrides server permissions or workflow gates.

For the CLI, load `PM_AGENT_BASE_URL` (the HTTPS app origin), `PM_AGENT_WORKSPACE_ID`, and exactly one of `PM_AGENT_ACCESS_TOKEN` or `PM_AGENT_TOKEN_FILE` into its process. A token file contains `access_token` and must have private permissions (`600` on POSIX). In explicit-token mode the client does not renew tokens. [Office setup](../../agents/OFFICE-SETUP.md) provides `agent:login` and automatic host-side renewal through a private saved connection. File uploads also need the matching public Supabase URL and anon key.

With those values loaded, a read-only discovery call is:

```sh
npm run --silent agent -- <<'JSON'
{"operation":"capabilities","args":{}}
JSON
```

The CLI also accepts a request filename. Use `--silent` when another process parses stdout as JSON. Results have `ok: true` and `result`, or `ok: false` and an error with status, code, outcome, and sometimes recovery details. An `unknown` write outcome needs reconciliation, not a retry.

Operations use a JSON envelope with `operation` and `args`; consult the guide for supported actions. Authenticated `GET /api/capabilities` reports tool definitions and role availability. Single-project and single-record GET endpoints support fresh reads before an edit. Keep these discovery results aligned with the deployed version.

On conflicts, stop and reread instead of silently adopting a newer version. After a timeout, reconcile saved state before repeating a write. Raw HTTP PATCH replaces `data`; the client merges proposed data keys into a matching-version snapshot to retain unrelated fields. Relationship arrays still replace the entire array. Do not bypass the client/API with direct database writes.

## Verify a release

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build
```

[CI](../../.github/workflows/check.yml) runs these same checks. [Domain tests](../../tests/domain.test.ts), [database tests](../../tests/backend.test.ts), and [showcase tests](../../tests/showcase.test.ts) cover validation, gates, transactions, access boundaries, conflicts, and isolated demo behavior. Database tests use PGlite; they do not certify the deployed Supabase configuration. `test:e2e` exists in package scripts, but there is currently no Playwright configuration or browser test suite.

Perform these browser checks on desktop and a narrow phone viewport. Use fictional data in a labeled demo or test workspace:

| Check | Expected result |
|---|---|
| Open `/` and a known old `/showcase/overview` link | Redirect to `/workspace`; sign-in required, no fictional property shown. |
| Run local showcase fixture tests | Isolated in-memory fixture behavior remains tested; it is not a public route. |
| Sign into `/workspace`, create a checklist demo, save an edit, then reload | Saved project and records persist. Full checklist: 109 work items and 44 checks. |
| Open a work item on a phone | Essentials, expandable details, Save, and Today/Plan/More navigation remain usable. |
| Call capabilities and single-record/project reads through the agent client | The selected workspace and roles match. A read-only client rejects writes; a reader remains unable to write even with host opt-in. |
| Try completing work with an unresolved required check | Save is rejected. A real recorded pass needs applicability, result date, reviewer, and evidence. |
| Open the same record twice and save competing edits | The stale edit is rejected; the newer value remains. |
| Import a small CSV and inspect Activity | Valid rows save together. Invalid or duplicate rows prevent the import. |
| Upload and download a private test file | File opens through an authorized short-lived link. Anonymous API and public-bucket access fail. |
| Use a reader and an account outside the workspace | Reader cannot write; the outside account cannot read that workspace. |

An optional deployed API smoke test is [verify-api.mjs](../../scripts/verify-api.mjs). With a valid administrator/manager session, privately supply:

| Variable | Value |
|---|---|
| `PM_TEST_URL` | Target origin, without `/workspace`; defaults to `http://127.0.0.1:8792` |
| `PM_TEST_TOKEN_FILE` | Path outside the repository to private JSON containing `access_token` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Matching database connection |
| `PM_TEST_ENV_FILE` | Optional private file from which to load environment variables |

Then run `node scripts/verify-api.mjs`. **This writes data:** it creates or reuses the persisted project named `Oak Street House · Demo`, may update its target date, and adds timestamped contacts, bids, files, and audit events. Repeated runs accumulate records; there is no automatic cleanup. Do not run it against a demo whose presentation state must be preserved. Token files are credentials and must not be committed or copied into support reports.

## Troubleshoot

| Symptom | Action |
|---|---|
| Private workspace says connection/storage is not configured | Check the two public variables and rebuild/restart. A working public showcase does not prove the private connection works. |
| HTTP 401 or expired session | Sign in again. An external caller needs a valid Supabase bearer token. |
| HTTP 403 / account not added / read-only | Verify the Auth user, intended workspace, and `pm_members` role. Do not relax RLS to fix membership. |
| HTTP 409 | Fetch current state and inspect the error. It can mean stale version or a duplicate; do not blindly repeat a create/import. The UI currently displays a generic stale-edit message for all 409 responses. |
| HTTP 400 / check or prerequisite blocks saving | Correct the named input or resolve the actual dependency. Keep source links and inspection evidence intact. |
| HTTP 503 / database needs setup migration | Verify environment target and applied migrations, including RPC functions. |
| File upload fails | Check type, size (20 MB maximum), session, and private-bucket policies. Use prepare → signed Storage upload → complete; the legacy multipart endpoint is limited to 4 MB. After an uncertain response, check Files before retrying. |
| File link expired | Request a new download from Files. Signed download URLs expire after 60 seconds. |
| CSV is stuck reading or rejected | Re-select the local file after the read timeout/error; same-file retry is supported. Maximum 5 MB and 500 rows. Fix preview errors before importing. Excel upload stores a file; it does not import rows. |

For a failure report, retain the time, deployment, project/record IDs, operation, expected version, HTTP status, and sanitized error. API logs may help; never attach passwords, tokens, signed URLs, or entire customer records unnecessarily.

## Recovery and ownership

Use [Human handoff](HUMAN-HANDOFF.md) to continue through the UI. The agent client can perform authorized actions, but there is no hosted runner, sending service, retry queue, or pause-automation control. Stop any connected external runner in its own platform before conflicting manual work. Reminder preferences are stored values only.

Before live rollout, assign an application operator and a project decision-maker, document their contact route, and verify database backups and a restore drill. Preserve private Storage objects and their paths separately: the workspace CSV export is not a full backup. It omits file bytes, Auth accounts, memberships, and complete audit history. Activity shows the latest 250 event summaries; database audit snapshots are retained.

There is no general delete/undo/restore UI or automatic orphan-file cleanup. Archive a project through **Projects → select project → Edit project → Status: Archived** when appropriate; this retains its data. Reconcile any unreferenced Storage objects against document `storage_path` values before administrator cleanup. Restore into an isolated environment first and verify memberships, records, links, and file downloads before replacing a live environment.

## Permit release migration

Apply `supabase/migrations/202610150001_permit_monitoring.sql` after the two existing migrations, before deploying permit routes. It is an additive transactional migration; existing projects and records are retained. Verify the explicit Supabase project, RLS, RPC grants and production commit. Run `npm test` and `npm run build`; the permit tests exercise claims, expiration, replay, conflicts, audit rollback, permissions, hierarchy and work gates locally in PGlite. Then verify hosted `/api/permits`, queue and capabilities through an ordinary workspace user. Do not fabricate official permit facts for production testing. Scheduling on the Mac remains a separate activation step in [PERMITS.md](../../agents/PERMITS.md).

## Cam release wiring

The two Cam migrations were applied together in the Projects SQL Editor on October 15, 2026. Read-only verification confirmed 11/11 mirrored properties, 1/1 mirrored memberships, private media/report buckets, inbox RLS, the authenticated save RPC, and denied direct source INSERT. No field-test visits were created. Frontend release `ea8765f` was verified as a successful Production deployment with the AWS processing settings active. The signed-in hosted Cam loaded real properties and opened the matching property’s Walkthroughs view; desktop/390px rendering was checked without creating visits. With the user's approval, the existing worker secret now includes the Projects connection, the Vercel role trusts both exact Production subjects, and Lambda was refreshed after saving the secret. Report/PDF processing is configured; a new workspace recording has not been submitted through the full pipeline because the user deferred field acceptance. Target Projects Supabase `ftjeccpjebhvrxrfrdtn`; never apply these two migrations to legacy Cam `vyvwqullxdyeympptyix` (it already has those tables). Existing legacy records are not moved or assigned to guessed properties.

1. Already applied to the target above; do not replay. For a new database, confirm all previous Projects migrations are applied, then apply `20261015192247_cam_capture.sql` and `20261015192412_cam_workspace_link.sql` together in one transaction. The first installs the existing Cam schema without seed properties; the second makes Projects accounts/properties authoritative, disables legacy enrollment, installs audited source-write RPCs and the inbox. Verify RLS, private buckets and mirrored IDs before deploying the frontend.
2. Deploy this repository to the existing **rockwood1/rockwood-projects** Vercel project with its existing public Supabase URL/anon key. No service-role key belongs in Vercel or the browser. `/cam` capture and property recording work independently of AI activation.
3. Deploy the companion `rockwood-walkthrough` Lambda build. In the existing Lambda Secrets Manager JSON, retain `SUPABASE_SECRET_KEY` for legacy Cam and add `WORKSPACE_SUPABASE_URL`, `WORKSPACE_SUPABASE_SECRET_KEY`, `WORKSPACE_CAM_URL=https://rockwood-projects.vercel.app/cam`. The new key is a server-only credential for the Projects database. Deploy the bundle after saving the secret, or update a harmless Lambda configuration revision to replace warm runtimes: the worker caches its connection for the life of the process. Both queues retain independent leases; one database failure does not stop the other. Existing EventBridge schedule remains the worker trigger.
4. Configure Projects Production `AI_PROVIDER=aws`, `AWS_PROCESSING_ENABLED=true`, `LIVE_AI_ENABLED=true`, `ROCKWOOD_AWS_REGION`, `AWS_BEDROCK_MODEL_ID`, `AWS_ROLE_ARN`, and `ALLOWED_ORIGINS=https://rockwood-projects.vercel.app`. Extend the intended AWS role's Vercel OIDC trust to this exact project/production subject before enabling direct translation calls. Rebuild after changing environment variables. Keep email disabled.
5. Completed October 15: old Cam Production has `WORKSPACE_CAM_ENABLED=true`, and its permanent root was verified to redirect to the deployed Projects `/cam`; `/legacy` still returns the legacy app. For a new rollout, enable this only after the native route and migrations are deployed. `/legacy`, `?legacy=1` and existing report links retain original database access.
6. Subsequent field acceptance: sign in, select a real test property, submit photos/audio, confirm the same visit under that property in Walkthroughs/Activity, then review its generated report/private PDF. Verify rejected reader/outsider writes and pending-upload recovery. The user deferred this field test; local tests/builds are not a phone recording certification.

Rollback: disable the old entry-point redirect first. Keep both databases, original media and inbox rows; do not drop tables or move source visits to guessed projects. Disable new AI flags if needed while preserving source capture. Restore app releases separately from database recovery.
