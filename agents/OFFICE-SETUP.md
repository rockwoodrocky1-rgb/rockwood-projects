# Connect the office Mac Mini

Repository: https://github.com/rockwoodrocky1-rgb/rockwood-projects
Live app: https://rockwood-projects.vercel.app/workspace

The app's home page and old showcase links now open the authenticated workspace. The fictional public example is retired; fixtures remain for local tests. Existing private demonstration records are separate database records. Archive a verified test project through the API to remove it from the active portfolio while preserving its history.

## On the Rockwood agent's Mac Mini

1. Locate the active OpenClaw agent and its workspace. Inspect local OpenClaw configuration without printing credentials. Use the office agent's workspace, not another agent or a global skill directory.
2. Reuse an existing clean checkout of the repository, or clone it using the Mac's existing authorized GitHub access. Fetch and fast-forward `main` without overwriting local work. Use Node 22 and `npm ci`.
3. Read `AGENTS.md`, `agents/README.md`, and `agents/WORKFLOWS.md`. Install the local skill:

   ```sh
   npm run agent:install -- --workspace /absolute/path/to/office-agent-workspace
   ```

   Verify the skill is eligible using that installation's `openclaw skills` commands. If the chosen agent already has a skill allowlist, preserve its entries and add only `rockwood-projects`. Start a fresh agent conversation or refresh its skills after setup. Do not disable tool permissions or sandbox controls; report a concrete restriction if the agent cannot execute the CLI.

4. Use a provisioned Supabase user with `manager` membership in the intended Rockwood workspace. Prefer a distinct agent identity for audit attribution. An authorized administrator provisions the account/membership if missing; the login utility does not create accounts or grant roles. Never install service-role keys on the agent. Obtain the exact workspace UUID from the administrator or the existing authenticated workspace's bootstrap response; do not guess it.
5. Supply these values through the host's private secret environment or a mode-600 environment file **outside the repository**:

   ```dotenv
   PM_AGENT_BASE_URL=https://rockwood-projects.vercel.app
   PM_AGENT_WORKSPACE_ID=THE_CONFIRMED_WORKSPACE_UUID
   NEXT_PUBLIC_SUPABASE_URL=https://ftjeccpjebhvrxrfrdtn.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_FCBD6lYi8re-Y-vNyU5wuQ_0l9QMnbT
   PM_AGENT_EMAIL=THE_PROVISIONED_USER_EMAIL
   PM_AGENT_PASSWORD=SUPPLIED_PRIVATELY_ON_THE_MAC
   ```

   These Supabase public values identify the existing app deployment; confirm they still match before signing in. Do not ask for passwords/tokens in WhatsApp, print a populated file, or put secret values in shell arguments. With the private environment loaded, run `npm run agent:login`. Alternatively use `node --env-file=/private/path/rockwood-login.env scripts/agent-login.mjs`.

   Login verifies the exact workspace and write role before saving a renewable session to `~/.config/rockwood-projects/connection.json` with permissions 600. The password is not stored there. Remove a temporary login environment file once its purpose is complete. Later calls need no password. `PM_AGENT_CONNECTION_FILE` can select a different per-agent file, but must then be supplied consistently to the agent's command environment. Existing token-based integrations remain supported.

6. Verify the host connection:

   ```sh
   npm run --silent agent -- <<'JSON'
   {"operation":"capabilities","args":{}}
   JSON
   npm run --silent agent -- <<'JSON'
   {"operation":"snapshot","args":{}}
   JSON
   ```

   Check the workspace, role and project list. Do not print session files. The API must be reachable without a redirect.

## Retire the existing test property

Find the exact `Oak Street House · Demo` project with `is_demo:true` in the snapshot, if present. Review its records to confirm it is the disposable test job. If its identity is different or ambiguous, report the candidates and ask which one; do not archive real projects. If already Archived, make no write. Otherwise use its reviewed ID/version:

```json
{"operation":"update_project","args":{"id":"ACTUAL_PROJECT_UUID","version":1,"changes":{"status":"Archived"}}}
```

Run with `npm run --silent agent -- --write request.json`, substituting the actual current version. Reread it to verify `Archived`. This removes it from the active portfolio and retains audit/history. No direct SQL or permanent deletion is needed. Do not create another test property to prove the connection.

## Verify the first real update

Ask for the first real property if none has been supplied. Match by address and name before creating anything; use `is_demo:false`. Start with `template:false` for basic intake unless a full construction checklist is requested. Leave unknown dates and people unset. Use the existing record kinds for tasks, contractors, bids, materials, checks and other statuses.

Save a user-supplied property/update, reread the saved ID, and confirm that it appears in `/workspace` after refresh. Report the property, changed fields and unresolved facts. A read-only capabilities call proves access, not that a write or WhatsApp routing worked. Do not claim fully connected until the active office agent has successfully executed the CLI and verified a saved update (archiving the existing demo can supply the initial write check).

Session renewal runs before an operation and never retries a failed project mutation. On an expired/revoked session, reconnect. On a connection lock left by a crashed process, confirm that process stopped before removing the `.lock` directory. On 409 or an uncertain write, follow the reconciliation playbook.

This is requested data entry through the existing WhatsApp agent. It does not install a scheduler or sender, auto-approve inspections, send contractor messages, or synchronize the separate walkthrough app.
