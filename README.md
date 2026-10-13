# Rockwood Projects

A manual project-management workspace for Rockwood Development. Bring in project details, contractors, bids, prices and past-job records; organize the work; and move it forward with clear responsibilities and recorded checks.

The app uses the supplied Rockwood brand and works on desktop and mobile. Project records save to Supabase, and files are private to the workspace.

Repository: [rockwoodrocky1-rgb/rockwood-projects](https://github.com/rockwoodrocky1-rgb/rockwood-projects). Live app: [rockwood-projects.vercel.app](https://rockwood-projects.vercel.app). Production sign-in, data persistence, private files and conflict handling were verified on October 13, 2026.

## Start with a real project

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
| **Activity** | Recent saved changes and who made them |

For a **past job**, create a project with status **Past job** and choose **Start empty**. Add its contractors, prices and supporting documents, then capture actual cost, finish dates and lessons in **Reviews**. This collects information for later evaluation; it does not automatically evaluate the records with AI.

For spreadsheet intake, open the relevant view and select **Import**. Download its CSV template, fill in the columns, select the destination project and review the preview. Fix all reported issues before saving. Imports support up to 500 rows; duplicates in an import or matching existing record titles are rejected. Dates use `YYYY-MM-DD`. An uploaded Excel workbook is stored as a file; use CSV to create structured records.

## Move the work forward

**Project plan** offers a list, a status board and a Gantt timeline. The Gantt timeline displays entered start and finish dates. It does not calculate a critical path or automatically reschedule following work.

The usual work sequence is **Waiting → Ready → Working → Ready to check → Done**. Use **Blocked** when work cannot proceed, and record why. A person makes each change.

Prerequisites control release. Required checks need a recorded pass, or confirmed non-applicability with a reason. A pass requires the result date, inspector or reviewer, and evidence. Marking an inspection's work item done cannot substitute for its linked check result. Corrections, open holds and certificate prerequisites also have completion checks.

Save the original planned dates separately from revised dates and actual dates. If another person has changed an item while it was open, refresh and review the newer version before saving.

## Demonstrate without mixing in customer data

Create a project with **This is a demonstration project** selected and use the project checklist. It contains clearly fictional contacts, a sample bid, delivery issue and rough-work-to-drywall dates. Demo projects are labeled separately from live projects. They are still saved records; use a new demo project when you need a fresh example.

## What is not active yet

Reminder preferences can be saved, but **no automatic reminders, emails or texts are sent**. There is no background AI agent, automatic date shifting, contractor-response processing or AI bid analysis yet. Accounting, payment processing, external calendars and messaging services are not connected. Payment entries are records, not transfers of money.

The existing walkthrough app remains a separate application. Its reports can be uploaded as supporting files; automatic synchronization, voice extraction and duplicate matching are not implemented here. This version also requires an internet connection to save live data.

For setup, access management, deployment and recovery, see [Operations](docs/OPERATIONS.md). The original coverage reference is in [the customer audit](docs/customer-requirements-audit.html) and [requirements data](data/customer-requirements.json).
