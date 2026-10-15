# App and route instructions

Root instructions apply. Public routes use the isolated showcase runtime; `/workspace` uses authenticated persistence. Never mix those runtimes.

For project-data API routes use `context`, `endpoint` and `response` from `lib/server.ts`. The self-service `POST /api/account/join` is an intentional exception: use `authenticatedUser` plus `endpoint`/`response` before membership exists, and only the zero-argument enrollment RPC. Reads must verify membership; writes use `context(request, true)`. Validate inputs and relationships, then call the existing narrow RPC. Do not substitute a service-role client or direct table mutation.

Return current versions after writes and HTTP 409 on stale edits. All private responses remain `no-store`. Keep HTTP actions documented in `agents/API.md` and expose discovery in `lib/capabilities.ts` where relevant. Read installed Next.js route-handler guidance before changing routes.

CSS changes must honor the root 16–18px text / 48px control requirements and be checked at phone and desktop widths.
