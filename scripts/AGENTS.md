# Script instructions

Root instructions apply. Read each script before running it: provisioning and integration verification can change persisted data. Use explicit target environment/workspace, not whichever account happens to be connected.

`agent.mjs` accepts one JSON action and prints one JSON result. Credentials belong in the process environment or a private ignored token file. Never print them or accept them as model tool arguments. Mutations require `--write` and still use the ordinary authenticated API.

`verify-api.mjs`, demo preparation and provisioning scripts are operational tools, not routine read-only tests. The API verification script creates/changes labeled demo records in its target database. Do not run it against a customer's real project. Do not add automatic credential resets or broad cleanup.
