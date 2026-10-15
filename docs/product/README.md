# Product, data and everyday workflow

Rockwood Projects organizes a residential job from approved plans through bids, construction, checks and handover. It is a manual tool today. A person enters information, assigns work, changes dates and records accepted results. The same records appear in different views; changing a task in Today changes the task shown in the list, board and schedule.

This describes the implementation reviewed on October 14, 2026. Start with [the main README](../../README.md) for the short introduction. Developers and agents should also read [Architecture](../architecture/README.md), [Operations](../operations/README.md) and [AGENTS.md](../../AGENTS.md).

## Choose the correct environment

| Environment | Use it for | What is saved |
|---|---|---|
| `/` and known `/showcase/...` links | Open the real workspace | Redirect to `/workspace`; sign-in is required. |
| Private `/workspace`, demonstration project | Authenticated testing with clearly labeled sample data | Persistent Supabase records and private files; no demo-reset UI |
| Private `/workspace`, real project | Authorized customer data entry | Persistent Supabase records and private files |

The public showcase is retired. The office agent can be installed through [Office setup](../../agents/OFFICE-SETUP.md); host authentication and a saved update still need verification. A presentation is not acceptance of a real construction schedule. Public demonstrations never read the private workspace, even if the visitor is signed in elsewhere.

The retained local demo fixture has **Worker**, **Project manager** and **Schedule (Gantt)** view choices. They are not security roles. Private `admin` and `manager` members can create/update workspace data; `reader` members can inspect it. Access is workspace-wide, including other projects. A contact or task assignee does not automatically get a login. An administrator provisions accounts; there is no signup or member-management screen.

## Where people find things

| Screen | Question it answers | Current behavior |
|---|---|---|
| **Projects** | Which job needs attention? | Project cards, task counts, blocked/overdue work and upcoming checks. Select a project here to edit its details. |
| **Today** | What can we work on? | Ready/working, blocked or near-term waiting work, and work ready for review; filter by responsible person. It is not an attendance sheet or daily log. |
| **Plan → List** | What is in the job? | All work, ordered by phase/source row, with search and phase/status filters |
| **Plan → Board** | What stage is each task in? | Same work grouped by status; open a card to change it, not drag and drop |
| **Plan → Gantt timeline** | When is the entered work planned? | Three- or six-week windows, manual date edits, unscheduled-work list and prerequisite counts |
| **Bids & prices** | Who can do the work, for what scope and price? | Quotes, included/excluded scope, component prices and comparison |
| **Contacts** | Who is involved, and what do we know about them? | People/companies, trade, contact information, experience and linked bids/history |
| **Materials** | What needs selecting, ordering or delivering? | Supplier, specifications, quantity, cost and order/delivery details |
| **Checks** | What needs verification and what result was recorded? | Applicability, inspection details, results, evidence and corrections |
| **Files** | Where is the supporting information? | Categorized uploads and authorized downloads; open the title to edit metadata |
| **Closeout** | What decisions, agreements, money records or issues remain? | Tabs for Decisions, Contracts, Payments, Holds and Reviews; useful throughout the job, not only at the end |
| **Activity** | What was saved recently? | Saved-change summaries, project and time; private API returns the latest 250 events |
| **Settings** | What is connected and how can I export? | Access/runtime information, workspace CSV export and the explicit “Agent & follow-ups — Not active” state |

On a phone use **Today**, **Plan** and **More**. More opens the full menu. Lists become cards and the schedule scrolls within its frame. Open an item, change the needed fields, then **Save changes**. Secondary fields remain under sections such as **More details**, **More dates & reminders**, **What needs to happen first?**, **Checks required to finish** and **Supporting files**. Original customer text is under **Original project checklist**.

The schedule showcase opens with phase 7 selected to make rough-in work readable. Choose **All phases** to see the rest. Filters affect what is displayed and what a module CSV export contains; a hidden item has not been deleted.

## Records and statuses

Every record has a title, status, optional project, responsible contact, due date and type-specific details. Contacts do not display the common responsible-person/due-date inputs. Use the project and record IDs when integrating; names can repeat or change.

| Kind / screen | Main information | Allowed statuses |
|---|---|---|
| `task` / Work | Phase, trade, area, responsible role/contact, priority, planned/baseline/actual dates, duration, waiting/blocker reasons, completion criteria, budget, applicability and reminder preference | Waiting, Ready, Working, Blocked, Ready to check, Done, Not applicable |
| `contact` / Contacts | Company, trade, email, phone, role, address, license, insurance expiry, service area, past jobs, references and quality notes | Active, Considering, Inactive |
| `bid` / Bids & prices | Contractor, trade, scope, labor/material/equipment/tax/other prices, exclusions, gaps, alternatives, lead time, validity, terms and technical approvals | Need someone, Requested, Received, Comparing, Selected, Declined |
| `material` / Materials | Supplier, specification, area, quantities, unit/total costs, order number, order/expected/received dates, long-lead flag, product approvals and opening readiness | Need to select, Need to order, Ordered, Confirmed, In transit, Delivered, Delayed, Cancelled |
| `check` / Checks | Check type, discipline, jurisdiction, permit/code, area, applicability, schedule/result/reinspection dates, inspector/reviewer, findings and evidence | Needs confirming, Waiting, Scheduled, Passed, Failed, Not applicable |
| `document` / Files | Category, revision/date/expiry, source, approver, related record and uploaded-file metadata when present | Needed, Draft, Current, Superseded, Accepted |
| `decision` / Closeout | Question, proposed/approved answer, approver/date, cost/day impact and evidence | Needed, Proposed, Approved, Rejected, Implemented |
| `contract` / Closeout | Contractor, trade, agreed scope/value, dates, exclusions, retainage, terms and signed-document reference | Needed, Draft, Sent, Signed, Complete, Cancelled |
| `payment` / Closeout | Contractor/payee, contract, invoice, payment type, invoice/paid amounts, retainage, changes, dates, payment reference and reconciliation | Expected, Invoiced, Under review, Approved, Paid, Disputed |
| `hold` / Closeout | Hold type, reason, person/role arranging resolution, clearance evidence, resolution and cleared date | Open, Working, Cleared |
| `review` / Closeout | Past-job/closeout/contractor/lessons review, job reference, budget/final cost, planned/actual finish, contractor, problems and lessons | Draft, In review, Complete |

Status lists are not strict step-by-step state machines. A person can revise a status when the applicable validation permits it. A label such as **Selected**, **Signed**, **Approved** or **Paid** records a person's entry; it does not send an award, obtain a signature, authorize a purchase or move money. The tool does not enforce a complete commercial approval chain between those records.

Phase, trade and area are separate dimensions. A phase groups work; a trade identifies the discipline; an area locates it. This version stores a flat project checklist with phase numbers, free-text trade/area and explicit links. There is no nested WBS/work-package editor, standalone milestone record or formal weekly commitment/PPC module.

## Start a job and collect information

1. In **Projects**, choose **New project**. Enter its name, address, type, lead, planned start, target finish, rooms/areas and scope notes. For a real job, leave the demonstration option off.
2. Choose **Project checklist** and the applicable phases, or **Start empty**. Review and create. An empty job is useful for initial intake or past-job records.
3. Add shared or project-specific contacts before assigning people. **Person responsible** means who follows through; **Contractor** identifies who performs the quoted/contracted work. They may be different people.
4. Upload plans, permit information and existing proposals into **Files**. Use clear names/categories and retain their versions. Uploading them does not automatically extract or interpret the content.
5. Review scope and permit applicability with the project lead. Confirm check names, local codes and permit numbers in **Checks**. Project-level jurisdiction and permit scope currently go in project scope notes; structured jurisdiction/code fields are on each check.
6. Collect bids and materials, resolve missing information, assign the work, enter dates and add project-specific dependencies. Leave unknown details blank or explicitly unconfirmed; do not invent them to make a chart look complete.

For a missing contractor, create a bid with **Need someone**, describe the trade/scope and assign the person arranging it. Use a **Hold** if the missing contractor blocks work, and link that hold as a prerequisite of affected tasks. Adding a contact or selecting a bid does not automatically clear the hold or create a contract.

For a past job, choose project status **Past job** and **Start empty**. Enter its contacts, historical bids/prices and supporting files. Add a **Review** with original budget, final cost, planned/actual finish, problems and lessons. This collects comparable history; automated AI evaluation is not active.

## Run the work manually

The usual sequence is **Waiting → Ready → Working → Ready to check → Done**. Use **Waiting** for work that has not been released, and **Blocked** for work that cannot proceed. Record what is needed, who is arranging it and when it is due. **Ready to check** is a reported handoff for review; it does not create an inspection or mean that one passed.

For example, if plumbing fittings are late:

1. Update the material to **Delayed** and enter the expected date and supplier information.
2. Open the affected plumbing work, mark it **Blocked** and explain the delay. Add or update a linked hold if coordination is needed.
3. Review downstream prerequisites and dates. Change each affected task's planned start/due date manually; keep original dates in the baseline fields.
4. When delivery is confirmed, record **Delivered**, the received date, and evidence/notes. Clear the hold with its resolution and date. Release the work when its prerequisites are resolved.
5. Finish the work, obtain the required check result, record that result in **Checks**, then mark the associated work item **Done** when permitted.

None of those actions updates the other records automatically. A delay reason or material's `linked_task_ids` association alone does not create an enforceable dependency; use **What needs to happen first?** on the affected work. Reopening an upstream check also does not automatically push back tasks that were already marked complete. Review affected downstream work and make explicit corrections.

The Gantt uses the dates entered on work items. If only one of planned start or due date exists, it displays that date as a one-day bar. Items with neither remain under **Dates still needed** and in List. The timeline does not calculate critical paths, draw dependency arrows, shift following dates, account for working calendars or forecast the finish from durations. The project target date is also manual.

The overview's work percentage counts task records, including **Not applicable** as resolved. It is not earned value, labor-weighted physical completion, or Percent Plan Complete for weekly promises.

## Checks and release rules

Checks hold the result. A source work item such as “Plumbing rough inspection” is a scheduling/checklist item linked to that result. Marking the work item complete cannot substitute for recording the check.

| Action | What the implemented rule requires |
|---|---|
| Release work as Ready, Working, Ready to check or Done | Resolve linked prerequisites; confirm unknown applicability; document excluded earlier work when present |
| Mark work Done | Also resolve every check in its **Checks required to finish** links |
| Record a check Passed | Set applicability to Required; enter a real result date, inspector/reviewer and evidence text or a linked document; resolve prerequisites and complete linked corrections |
| Mark an item Not applicable | Record a reason; keep its source record and links |
| Clear a hold | Enter its resolution and clearance date |
| Pass certificate application or issuance | Clear project holds and resolve other non-certificate checks; template issuance also depends on application |

For a prerequisite, work must be Done with its linked checks resolved; a material must be Delivered; a hold Cleared; a decision Approved or Implemented; a check must have an accepted result or documented non-applicability. Dates that overlap a predecessor produce warnings, but those warnings do not reschedule anything.

**Inspection Required** is descriptive metadata. It does not create a check or a gate by itself. For new work, create the check in **Checks** and select it under **Checks required to finish**; add it as a prerequisite to any work that must wait for its pass. The source template already supplies many of these links.

For a failed inspection, enter findings and the result information, create correction work, and link it under **Corrections to complete**. Record the later accepted result and evidence after the correction and reinspection. The form reveals result fields when passing/failing; evidence requirements are enforced for a pass. The app stores the submitted evidence; it does not verify an inspector's identity, obtain an official approval or authenticate a municipal report.

Before drywall, the supplied template includes framing and applicable electrical, plumbing, mechanical and gas rough checks; insulation installation and acceptance; and included low-voltage/security work. A required drywall screw/nail check precedes finishing. For a scope without gas, pool work or another conditional item, record confirmed non-applicability with the reason instead of deleting its gate.

Only unambiguous source handoffs are encoded. Review the actual permit, assembly and project sequence; the template is not a complete automatically generated dependency network. If only some phases were selected, the tool retains linked checks and records earlier omitted task IDs. **Excluded earlier work: completion evidence** resolves the omitted-work explanation; it does not waive retained checks.

## Bids, materials, documents and closeout

For bids, keep labor, materials, equipment, tax and other costs separate. The entered subtotal is their sum. Missing numbers are not confirmed zero; the comparison explicitly calls out missing prices/scope. Compare the same scope and exclusions before selecting a contractor. Current UI totals display whole dollars, while stored numbers and calculations retain cents. Only USD is offered.

Material unit cost and total cost are separate entered values. The app does not calculate purchase orders, place orders or automatically multiply quantity into the total. Shop drawings, engineering packages, product approvals/NOAs, field measurements and opening readiness have fields or supporting files; their review remains manual.

File categories include plans, permits, bids, contracts, selections, inspections, separate trade/manufacturer warranties, product approvals/NOAs, as-built surveys, manuals, contacts, colors, certificates and invoices. Files remain separate from the actions that obtain or review them. A document marked Current/Accepted does not automatically pass a linked inspection. Upload a new revision separately and manually mark the old record Superseded; there is no formal document-version workflow or generated handover binder.

The source punch sequence is walkthrough, same-day assignment, correction, final cleaning and owner walkthrough/acceptance. Add each actual correction as a work item with its trade, location, owner, priority, date and supporting evidence. A second visit should update the existing item when appropriate. Automatic walkthrough synchronization, extraction and duplicate matching are not implemented.

Keep certificate application and issued certificate evidence separate. Upload the actual CO/CC and record the accepted issuance result. Financial closeout retains invoices, retainage, change orders and reconciliation records. The tool records those facts but does not verify balances, process payments or perform accounting. Add lessons learned in Reviews after turnover.

## CSV intake and exports

Open the intended module, choose **Import CSV**, download its template, replace the example row, choose the destination project, then review and import. Import one kind at a time, preferably contacts before bids or other records that refer to them.

- Files must be comma-separated UTF-8 CSV, at most 5 MB and 500 data rows. The API also limits the submitted JSON body to 4 MB; split unusually large rows into smaller batches.
- Use the template headers or the recognized field labels. Title is required. Dates use `YYYY-MM-DD`; status/select values must belong to that kind; numeric and yes/no fields are checked.
- Unknown/duplicate columns, malformed rows and invalid values must be fixed before saving. The preview shows the first 20 valid rows and up to 20 error messages, while the full parsed batch is checked.
- Imports create records. They do not update existing records. Duplicate titles in the batch, or an existing record of the same kind/title/destination, cause rejection rather than an overwrite.
- Relationship ID columns require existing record IDs; the import does not match contractor names or resolve newly imported references. For a human workflow, leave unknown links blank and choose the contact/contract afterward in the editor.
- The browser handles reading failures and times out an unreadable file after 15 seconds. Ensure the file is actually downloaded to the device before retrying.

Module **Export** includes the current filtered rows and configured fields. **Settings → Export workspace records** includes broader record details. Neither is a full database backup or guaranteed round-trip import: IDs, relationship reconstruction, file bytes, membership and the complete audit history need a separate recovery process. Keep the original source file when collecting customer data. Exporting an Excel workbook as CSV creates records; uploading the workbook in Files only stores it.

## Customer source coverage

The source is [customer-requirements.json](../../data/customer-requirements.json), transcribed/audited from seven named photos. It preserves 109 task rows, 35 inspection-list entries, 12 tracker fields, three scope notes, four inspection notes and two customer-provided reference links. The HTML audit and `remaining_design_details` describe the planning state at that audit date; their “pending” wording must not be treated as current implementation status.

### The 15 phases

| Phase | Work items | Covered scope |
|---|---:|---|
| 1. Approved Plans Received | 5 | Current approved plans, project folder, permit/inspection review, trade scope and long-lead identification |
| 2. Bidding | 19 | Bid package/invitations, 13 trade follow-ups, comparison, scope questions, recommendation and agreements |
| 3. Preconstruction | 6 | Baseline schedule, posted documents, kickoff, long-lead orders, utilities and survey |
| 4. Sitework/Foundation | 8 | Site preparation, layout, underground work, steel, footing/slab checks and pour |
| 5. Shell / Structure | 6 | Masonry, lintels/columns, trusses, sheathing and framing |
| 6. Exterior Envelope | 9 | Windows/doors, roof stages and checks, stucco/lath |
| 7. Rough MEP | 7 | HVAC, plumbing and electrical work/checks; conditional low-voltage work |
| 8. Insulation / Drywall | 5 | Insulation, its check, board, fastener check and finishing |
| 9. Interior Finishes | 7 | Doors/trim, millwork, countertop measurement, tile, paint, flooring and railing |
| 10. Trim-Out | 5 | Electrical/plumbing/HVAC trim, appliances, accessories/hardware |
| 11. Exterior / Site Final | 4 | Driveway/walkways, landscaping/irrigation, fence/gates and drainage |
| 12. Final Inspections | 12 | Building/trade/site finals and conditional fire, pool, elevator and leakage test |
| 13. Punch List | 5 | Walk, assign, correct, clean and owner acceptance |
| 14. Closeout Package | 6 | Trade/manufacturer warranties, approvals, survey, final approvals and handoff binder |
| 15. CO / Turnover | 5 | Holds, certificate application/receipt, financial reconciliation and review |

All phases together generate **109 task records plus 44 check records**. The 35 source inspection entries become 44 records because these entries contain distinct stages:

| Source | Generated checks |
|---|---|
| `P6-09` | Masonry wall; tie beam/lintel |
| `P6-15` | Window/door installation; conditional separate-permit final |
| `P6-16` | Conditional waterproofing; conditional flashing |
| `P6-25` | Conditional pool steel, shell, plumbing, electrical, barrier and final |
| `P6-35` | Certificate application; certificate issuance |

The other 30 entries each produce one check. Roof-final tasks `P3-17` and `P4-17` share the same authoritative `P6-14` result. Gas rough, termite documentation and the pool stages remain explicit even when the master task list lacks a matching standalone task. A project manager's drainage review does not substitute for a required municipal inspection. A partial template can retain checks outside the chosen phase because other work depends on them.

### The 12 tracker fields

| Customer field | Current representation |
|---|---|
| Address / Project | Project name/address and record project |
| Phase | Task phase number/name |
| Task | Task title |
| Trade | Trade field |
| Owner | Responsible contact plus suggested role; original source owner preserved separately |
| Status | Original Waiting/Working/Blocked/Done plus Ready, Ready to check and Not applicable |
| Priority | High / Medium / Low; High appears on work cards; no dedicated priority filter/sort |
| Due Date | Entered due date; original relative timing retained separately |
| Inspection Required | Descriptive flag plus explicit authoritative check links |
| Inspection Type | Discipline/type, check type and permit-specific details |
| Notes | Editable notes and preserved original source row/notes |
| Reminder | Due + overdue / Overdue only / Off; preference only, default Off |

For private source templates, work starts Waiting, dates/durations are not inferred, and every check's applicability starts Needs confirming. Conditional work also needs confirmation. Original source rows, responsibility, conditions and timing stay attached. “Day 0,” “after approval,” “late-stage” and the tile phrase “wet areas/floors” are not silently converted into dates. The public fixture uses clearly fictional progress and dates for presentation.

Coverage means the customer's information has a preserved place in the tool. It does not mean that every note has a specialized subsystem, every conditional inspection applies, or every source requirement has been independently accepted. Verify local requirements against the actual permit with the responsible project professional; the stored customer references are provenance, not freshly checked legal guidance.

## Human fallback and handoff

The repository supplies a model-independent agent client and CLI for authorized external agents. It does not host a built-in worker. Every current data action remains available to a person; stop any externally running agent in its host before making conflicting corrections. See [agent connection](../../agents/README.md) and [human handoff](../operations/HUMAN-HANDOFF.md).

| Situation | Human action now |
|---|---|
| An item is blocked | Open it, explain the cause, assign the resolver and update dates/linked holds manually |
| A reminder is needed | Contact the person through an approved external channel, then record the outcome in notes. Saving a reminder preference does not send it. |
| Save fails a check or prerequisite rule | Open the linked record, collect the real result/evidence or confirm non-applicability; resolve it before retrying |
| Another edit caused a conflict | Retain your intended notes, close the editor, refresh, inspect the latest version and reapply only the needed change |
| A save has an uncertain outcome | Refresh and search before creating it again; there is no universal duplicate-prevention key for manual creates |
| Login or membership is unavailable | Ask the workspace administrator to provision/repair access using Operations; the public demo cannot save real work |
| Internet connection is unavailable | Keep a separate field note and enter it once connected; the live app has no offline queue |
| A file is missing or unreadable | Confirm the correct project, retry its download/upload and preserve the original; do not claim it was saved until it appears and reopens |
| A record appears absent | Clear search/status/phase/person filters and check All projects or the selected demo/past/archived project |

When handing work between a person and an agent, provide the environment, workspace/project and record IDs, the observed facts and their source, intended changes, unresolved decisions and the last confirmed save/error. Do not include passwords or tokens in the handoff document. Both should use current record versions and the same validations. Authority to read this repository does not by itself grant a live account or permission to send a message, approve a result or change a schedule.

## Planned capabilities and current limits

Agent reminders, outbound email/SMS, incoming contractor replies, event-triggered work, automatic rescheduling and AI bid/past-job evaluation are not implemented. Reminder preferences are stored only. The integrated Cam uses workspace properties and accounts. Submissions appear under the selected property in Walkthroughs and Activity. Background report/PDF processing uses the separately configured AWS worker. Legacy visits stay in the original Cam database. Rocky can read the durable visit inbox, but automatic task/check changes and human approval routing are future work.

Also absent are a formal weekly commitment/PPC system, pull/takt planning, a CPM engine, resource calendars, nested work packages, automatic purchase orders, financial processing, e-signatures, multi-step commercial approvals, generated closeout binders, offline synchronization and project-scoped worker permissions. Project Complete is a manual label, not an automatic certification that every task and document is accepted.

Before real-project v1, confirm the actual template/permit scope, responsibilities, dates, access roles, file/backup process and intended approval rules with the team. Before ongoing autonomous work, configure the agent identity and host, agree allowed actions, and implement triggers, message channels, retry/deduplication behavior, delivery history and handoff/escalation rules. The authenticated action client is ready; those remaining connections are not switches in the current Settings screen.

## Permits

Each property can hold master, subpermit and standalone permit records, linked inspection checks and official evidence. The Permits view shows current statuses, next actions, deadlines, last successful verification and failed check history. New incomplete real properties automatically appear in the worker queue. Pause controls and protected manual corrections remain available to humans. Tasks can use permits as prerequisites; Gantt shows permit dates and blocked-work warnings. See [permit workflow](../../agents/PERMITS.md).

### Reading the permit view

Permit statuses have text and icons alongside color: yellow means unfinished (including Approved, Issued and Final inspections); red identifies corrections, holds, expiry or failed checks; green is reserved for recorded closure or a supported inspection pass; gray distinguishes unverified information from cancelled/not-required records. Rocky’s check freshness is a separate label and does not imply a permit is approved.

Each property starts with **What needs to happen next**, showing blockers, missing verification, next actions, responsible contacts and dates. These suggestions summarize saved records; they do not establish which permits are legally required. Missing people/dates remain unassigned or unconfirmed. Recorded expiration dates prompt verification without automatically changing a status.

Master cards contain their subpermits; independent permits retain a Standalone label and the actual trade is shown separately. Search by address, permit, trade or status. Filters include unfinished, blocked, unverified and closed permits, plus active or past properties. When only a subpermit matches, its master remains visible as context. A missing parent link shows a warning instead of hiding the record.

Open **Checks & verification** for inspections, document reviews and certificates. Checks without a permit link remain visible at property level. Counts describe only recorded checks, not a complete set of jurisdiction requirements. Open **Source evidence & details** for source URLs, notes, fees and related work. Titles, checks and next-action rows open the existing editor with the same validation and conflict handling.
