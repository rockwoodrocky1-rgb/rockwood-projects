# Remaining agent connections

The implemented boundary is an authenticated, model-independent client/CLI using the same project API as the UI. This is enough for an externally hosted, authorized agent to perform individual data operations. It is not unattended end-to-end project management.

The permit workflow has the specific implemented contract below. Before enabling broader project-management automation, define and implement:

| Connection | Required result |
|---|---|
| Agent identity and host | OpenClaw skill installer and renewable host login are implemented in [Office setup](OFFICE-SETUP.md). Installation, a provisioned identity/workspace and a verified live update are still required on the office Mac. |
| Action policy | Which changes the worker may make, which decisions need review, and how approvals are recorded |
| Durable runs | Trigger/scheduler, run state, retries with idempotency, reconciliation after unknown outcomes and per-workspace stop control |
| Human control | Visible pending/running/failed work, pause/cancel behavior and protection against overwriting a human correction |
| Messaging | Approved recipients/channels, templates, quiet hours, deduplication, delivery ledger and inbound-reply linking |
| Events | Reliable notifications when tasks/checks/dates change; prevent self-triggering loops |
| Scheduling | Explicit dependency/calendar rules, preview of affected dates, baseline preservation and conflict handling |
| Walkthrough | Cam capture and the read-only PDF/chat handoff connector are implemented; office activation and real delivery verification are separate. Automatic task changes, duplicate task matching and an approval executor remain future work. |
| Evaluation | Test fixtures for delays, failed inspections, duplicate replies, stale edits and correct human handoff |

Do not advertise an item as connected merely because its preferences or notes can be stored. Each implemented connection should update capabilities, documentation and meaningful tests, and retain manual operation.

## Implemented: permit worker contract

The queue, per-property pause, master/subpermit and inspection data, atomic observations, check history, idempotent claim/completion, and visual workspace are available. [PERMITS.md](PERMITS.md) defines the contract. External scheduling and jurisdiction-specific browsing remain host responsibilities; general creates still lack idempotency keys.
