# Rockwood Projects
Build the full manual data-entry application from data/customer-requirements.json. Preserve every source ID, condition, note and relative timing. No real customer password or secret may be committed. Supabase authentication and workspace RLS are mandatory; never fall back to local storage for live customer data. Automation execution and outgoing messages stay disabled until explicitly configured later. Keep demo projects clearly labeled and separate. Use the supplied brand logo unchanged and ivory/burgundy/ink palette. All mutations need validation, conflict checks and audit history. Test meaningful project creation, data persistence, access control, dates/dependencies, bids, imports and private documents. Changes to user-facing workflow must preserve manual operation.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
