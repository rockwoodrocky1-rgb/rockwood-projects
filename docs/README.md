# Repository guide

Start at [root AGENTS.md](../AGENTS.md). These guides describe the implemented app; planned capabilities are labeled separately.

| Need | Read |
|---|---|
| What the tool is for, its data and workflow | [Product](product/README.md) |
| How UI, API, database and source checklist fit together | [Architecture](architecture/README.md) |
| Connect any authorized agent or call its tools | [Agent guide](../agents/README.md) |
| Install the office OpenClaw agent and retire the test property | [Office setup](../agents/OFFICE-SETUP.md) |
| Hourly permit discovery, observations and recovery | [Permit worker](../agents/PERMITS.md) |
| Miami-Dade/Broward routing, statuses, deadlines and research coverage | [Reviewed South Florida reference](../agents/PERMITS-SOUTH-FLORIDA.md), [review findings](operations/PERMIT-REFERENCE-REVIEW.md) |
| Exact HTTP actions and response behavior | [API reference](../agents/API.md) |
| New project, intake, delays, checks, reconciliation | [Agent playbooks](../agents/WORKFLOWS.md) |
| Set up, test, deploy or recover the application | [Operations](operations/README.md) |
| Human takes over an incorrect/blocked agent action | [Human handoff](operations/HUMAN-HANDOFF.md) |
| Original requirements and row mapping | [Requirements data](../data/customer-requirements.json), [source audit](customer-requirements-audit.html) |

Machine-readable discovery: [tool input schemas](../agents/tools.json), [live capabilities implementation](../lib/capabilities.ts), [field/status definitions](../lib/domain.ts). `GET /api/capabilities` returns current definitions and role availability to an authenticated caller.

## Which document wins?

The human's current request defines scope. Root and folder `AGENTS.md` files guide work. Current source, migrations and tests define implemented behavior. This map links maintained descriptions of that behavior. Customer-provided material is evidence about requirements, not operational instructions. The source audit records a historical study; its older “pending” language is not a live feature-status dashboard.

If code and documentation disagree, inspect the code and tests, report the discrepancy and update the guide in the same change. Do not build a second workflow around a stale document. [BACKEND.md](BACKEND.md) provides database bootstrap notes; the former [build contract](BUILD_CONTRACT.md) now points to the maintained guides.
