# Verification instructions

Root instructions apply. Test workflow outcomes and access boundaries rather than snapshots that merely repeat implementation.

Preserve tests for all source rows, check expansion, prerequisite gates, invalid dates, reader/outsider rejection, stale writes, immutable audit, private files and showcase isolation. Agent-client tests must prove workspace/token scoping, preservation of unrelated data, conflict stops and no blind mutation retries.

Default tests are local and must not contact production or send messages. PGlite exercises database logic but is not a hosted Supabase/Storage certification. Document when verification is mocked, local or live. Browser verification is currently manual; do not claim a Playwright suite passed just because a package script exists.
