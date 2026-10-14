# Instructions for agent integration

Read the root instructions, this folder's [README](README.md), [API](API.md) and [playbooks](WORKFLOWS.md).

- Expose operations from `tools.json` through the external agent's native tool interface; keep credentials in the host runtime, never in model arguments.
- Use `RockwoodClient.execute({ operation, args })`. It is read-only unless the host explicitly enables writes for an authorized task. The server independently enforces role and workspace permissions.
- Require an explicit workspace and current versions. Never silently select a different workspace, refresh a version on conflict, auto-retry a mutation, or bypass validation.
- Changes to `data` must preserve the snapshot's source fields and unrelated values. Relationship arrays are whole-array replacements, not append operations.
- Do not claim arbitrary agents connect automatically. They need a provisioned identity, token handling and an adapter to this client or API.
- Keep `tools.json`, the client dispatcher, capabilities and tests in agreement. Add meaningful tests for authentication scope, conflicts, unknown outcomes and preservation of source data.
- Do not add a runner, message sender, autonomous approval or financial action as a side effect of a data-entry tool.
