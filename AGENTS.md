# Rockwood Projects
Build the manual project-management application from data/customer-requirements.json. Preserve every source ID, condition, note and relative timing. The public home page is a no-login showcase with view selection and an interactive fictional project. Showcase data and changes stay in an isolated browser-memory runtime; never query or write live workspace data from showcase routes, even if the visitor is signed in elsewhere. Keep the private workspace at /workspace protected by Supabase authentication and workspace RLS; never fall back to local storage for live customer data. No real customer password or secret may be committed. Automation execution and outgoing messages stay disabled until explicitly configured later. Keep demo projects clearly labeled and separate. Use the supplied brand logo unchanged and ivory/burgundy/ink palette. All mutations need validation, conflict checks and audit history. Test meaningful project creation, data persistence, access control, dates/dependencies, bids, imports and private documents. Changes to user-facing workflow must preserve manual operation. Product sequence: showcase, then agent workflows, then v1 with a real project.

## Interface requirements

Design for workers using a phone. Use plain labels, 16–18px everyday text, secondary text at least 14px, strong contrast and controls at least 48px tall. Do not shrink the desktop UI to fit a phone. Show tables as readable cards on small screens, keep schedules scrollable within their frame, and make save actions easy to reach. Put secondary fields behind clearly named sections without dropping fields, source notes, checks or workflow rules. Avoid decorative mini-previews, marketing slogans, repeated explanations and redundant controls.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
