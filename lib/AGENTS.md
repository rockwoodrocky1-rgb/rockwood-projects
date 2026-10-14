# Shared logic instructions

Root instructions apply. `domain.ts` defines record kinds, fields, statuses and JavaScript validation; `template.ts` and the source JSON define checklist expansion. `showcase.ts` is disposable demo behavior. `server.ts` enforces authenticated application access. `capabilities.ts` exposes discovery, not a second authorization system.

When changing workflow rules, update both shared validation and the corresponding database RPC validation in a new migration. Check the public showcase still behaves consistently. Preserve immutable source references, linked gates, relationship scope and dates.

Add meaningful tests for changed rules. Derive machine-readable field/status discovery from `KIND_CONFIG`, not a stale copy. Never import server secrets into client modules.
