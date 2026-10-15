# Rockwood Projects

The shared Rockwood property and project workspace for the team and its authorized office agent. Add real properties, track tasks and statuses, and keep supporting records in one authenticated workspace.

Repository: [rockwoodrocky1-rgb/rockwood-projects](https://github.com/rockwoodrocky1-rgb/rockwood-projects). App: [rockwood-projects.vercel.app/workspace](https://rockwood-projects.vercel.app/workspace).

The home page and old showcase links now redirect to the private workspace. The fictional public Oak Street example is retired. Local demonstration fixtures remain for automated tests. Any older persisted demonstration is a separate database record; archive the verified test property through the API as described in [Office setup](agents/OFFICE-SETUP.md).

## For agents and developers

Start with [AGENTS.md](AGENTS.md) and the [documentation map](docs/README.md). The repository includes a [product guide](docs/product/README.md), [architecture map](docs/architecture/README.md), [operations guide](docs/operations/README.md) and instructions in each major code folder.

Authorized external AI agents can operate the private workspace through a [model-independent client and CLI](agents/README.md), using the same records, permissions, workflow checks, edit versions and audit trail as humans. [Tool schemas](agents/tools.json) describe the actions; authenticated `GET /api/capabilities` exposes current fields/statuses and availability. Use `npm run agent -- --help` to start. Credentials and an explicit workspace are required for live calls; repository access alone grants neither.

The client supports reads, project/record creation and updates, imports and private files. It stops on stale edits and does not retry uncertain writes. Humans retain the UI for corrections and continuation; see [Human handoff](docs/operations/HUMAN-HANDOFF.md). No hosted AI runner, background reminders or messaging service is activated. Those remaining connections are tracked in [the agent roadmap](agents/ROADMAP.md).

## Connect the office agent

Follow [Office setup](agents/OFFICE-SETUP.md) on the Rockwood Mac Mini. Install the OpenClaw skill in the active agent's workspace with `npm run agent:install -- --workspace /absolute/workspace`, then use `npm run agent:login` with a privately supplied, provisioned user identity and explicit workspace. The CLI stores a renewable session outside Git and refreshes it before an operation when needed. It never retries uncertain data writes.

Property updates use the same database/API as the app. Git holds the software and operating instructions, not the live property list. Installation on a Mac alone is not evidence that WhatsApp routing, authentication or a saved update works; verify those on the actual agent host.

## Start with a real project in the private workspace

1. Select **New project**. Enter the job name, address, lead, planned dates and rooms or areas. Use the scope notes for known permit scope and jurisdiction details.
2. Choose **Project checklist** and the applicable phases, or **Start empty**. Leave the demonstration option off for customer work.
3. Review and create the project. Add the known contacts, bids, materials and documents.
4. Confirm what applies, assign responsible people, enter dates and connect any additional prerequisites.

The full checklist starts with **109 work items across 15 phases**. Its **35 inspection-list entries become 44 separate check records**, because entries such as pool inspections and certificate application/issuance contain multiple stages. An overlapping roof-final entry shares its authoritative result. Original source rows, notes, responsibility and relative timing remain attached to the records.

Template dates are not guessed. Local inspection applicability starts as **Needs confirming** and must be reviewed against the actual project. Choosing only some phases can leave earlier work to resolve; record its completion evidence and resolve the retained inspection gates.

## Bring in the information you have

| View | Information to collect |
|---|---|
| **Contacts** | Companies, trades, email, phone, licenses, insurance, references and past-job experience |
| **Bids & prices** | Scope, separate labor/material/equipment prices, tax, exclusions, gaps, lead time and terms |
| **Materials** | Supplier, specifications, quantities, price, order details, approvals and delivery dates |
| **Project plan** | Work, phases, locations, responsible people, dates, priorities, blockers and prerequisites |
| **Checks** | Applicability, permit and inspection codes, scheduling, findings, reviewer and result evidence |
| **Files** | Plans, permits, bids, contracts, photos, warranties, manuals, certificates and other supporting files |
| **Closeout** | Decisions and changes, contracts, payments, holds and reviews / lessons learned |
| **Activity** | Recent saved-change summaries; authenticated actor IDs are retained in the API/database audit |

For a **past job**, create a project with status **Past job** and choose **Start empty**. Add its contractors, prices and supporting documents, then capture actual cost, finish dates and lessons in **Reviews**. This collects information for later evaluation; it does not automatically evaluate the records with AI.

For spreadsheet intake, open the relevant view and select **Import CSV**. Download its CSV template, fill in the columns, select the destination project and review the preview. Fix all reported issues before saving. Imports support up to 500 rows; duplicates in an import or matching existing record titles are rejected. Dates use `YYYY-MM-DD`. An uploaded Excel workbook is stored as a file; use CSV to create structured records.

## Move the work forward

**Project plan** offers a list, a status board and a Gantt timeline. The Gantt timeline displays entered start and finish dates. It does not calculate a critical path or automatically reschedule following work.

The usual work sequence is **Waiting → Ready → Working → Ready to check → Done**. Use **Blocked** when work cannot proceed, and record why. A person or an authorized external agent makes each change through the same validated API.

Prerequisites control release. Required checks need a recorded pass, or confirmed non-applicability with a reason. A pass requires the result date, inspector or reviewer, and evidence. Marking an inspection's work item done cannot substitute for its linked check result. Corrections, open holds and certificate prerequisites also have completion checks.

Save the original planned dates separately from revised dates and actual dates. If another person has changed an item while it was open, refresh and review the newer version before saving.

## Private workspace demo records

`/workspace` supports explicitly labeled persisted demo projects for operator testing: create a project with **This is a demonstration project** selected and use the project checklist. These authenticated demo records are saved to Supabase and labeled separately from live projects. They do not appear in the public showcase.

## What is not active yet

Reminder preferences can be saved, but **no automatic reminders, emails or texts are sent**. There is no background AI agent, automatic date shifting, contractor-response processing or AI bid analysis yet. Accounting, payment processing, external calendars and messaging services are not connected. Payment entries are records, not transfers of money.

The existing walkthrough app remains a separate application. Its reports can be uploaded as supporting files; automatic synchronization, voice extraction and duplicate matching are not implemented here. This version also requires an internet connection to save live data.

For setup, access management, deployment and recovery, see [Operations](docs/operations/README.md). The original coverage reference is in [the customer audit](docs/customer-requirements-audit.html) and [requirements data](data/customer-requirements.json).

## Permit monitoring

The authenticated workspace includes **Permits**: master/subpermit hierarchy, linked inspections, source evidence, upcoming dates, monitoring controls and check history. Rocky can discover due real properties and save atomic observations through the permit queue API. [Worker contract and hourly activation](agents/PERMITS.md). The hourly runner and municipal portal access are configured separately on the office Mac.
