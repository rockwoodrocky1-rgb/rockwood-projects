# Operating playbooks

For every workflow: read capabilities and the exact workspace/project, inspect existing records, act only within the human's scope, then verify saved results. Use current IDs and versions. If a prerequisite is missing, report it rather than bypassing it. [Human handoff](../docs/operations/HUMAN-HANDOFF.md) applies to failures and corrections.

## Start a project

1. Confirm job name, address, scope, project lead, rooms/areas, known dates and whether this is a demo, live job or past job.
2. Search existing projects to avoid creating a duplicate. Choose the source checklist and applicable phases, or an empty project for intake/past-job records.
3. Create the project once. Read the saved project and its generated work/checks. All phases produce 109 work items and 44 check stages.
4. Leave unknown dates, applicability and people unconfirmed. Assign known contacts and explicit dates. Selected phases may retain unresolved earlier prerequisites: resolve them with evidence instead of deleting gates.
5. Tell the human what is ready and what information remains needed. Never infer that template creation means permits or inspections are approved.

## Enter contacts, bids and past jobs

1. Match existing contacts by reviewed identity, not only similar company spelling. Preserve workspace-wide contacts when editing within a project.
2. Create contacts before records that reference them. Store scope, labor/material/equipment/tax, exclusions, missing scope, validity, lead time and supporting files separately.
3. Use imports for validated same-kind batches. A missing price is unknown, not a confirmed zero. Currency currently uses USD.
4. A comparison or recommendation is analysis; selecting a bid/recording an approval requires the human's granted scope and verified decision.
5. Use Past job projects and review records for actual costs, dates, contractor experience and lessons. Mark estimated or incomplete information plainly. AI analysis is not automatic.

## Report a delay and revise the plan

1. Read the affected task, its linked prerequisites/checks, related materials/holds, current dates and versions.
2. Record the actual blocker/revised delivery facts. Set `Blocked` and a useful `blocker_reason` when appropriate. If confirmed, set `owner_id` to the office lead (a Team member contact) and `data.contractor_id` to the sub or crew doing the work (a contact; no login). Today shows these as **Lead** and **Sub**.
3. Identify affected work. Propose specific start/due-date changes and preserve baseline dates. There is no CPM engine or automatic cascading shift.
4. Apply only the authorized changes one record at a time with reviewed versions. If any call fails, stop that sequence and report the successful and failed items. Do not represent a multi-record change as atomic.
5. Reread the records. A human can adjust dates in Plan and open the same blockers in Today.

## Move work forward

Use Waiting → Ready → Working → Ready to check → Done as the ordinary sequence. These are useful working stages, not proof that every intermediate status must be entered. Follow the actual server validation.

Before releasing work, inspect its prerequisites and unresolved excluded phases. Before marking Done, verify linked required checks have accepted results or confirmed non-applicability with a reason. Repeated walkthrough reports should update an existing record where it is the same issue rather than create duplicate tasks.

## Record a check result

1. Determine the check's applicability and the source authorized to give its result.
2. Record schedule, result date, inspector/reviewer and evidence from the actual result. Link private evidence documents by record ID.
3. A failure may need corrective tasks and a reinspection date. Complete linked corrections before recording a pass.
4. Never turn a work-item status, a photograph or elapsed time into a formal pass. Certificate application/issuance also depend on their retained checks and cleared holds.
5. If evidence is missing, leave the result pending and hand off the missing information.

## Ask for a decision or prepare a reminder

Create/update a decision or hold with the question, responsible contact and required date. Save a reminder preference only if requested. A draft can be kept in notes with the intended recipient and linked item; label it a draft.

The data-entry client has no sender. Do not claim delivery, schedule a background job, enable an external connector or send through another tool merely because the record mentions a reminder. The separately authorized [Cam PDF notification pilot](CAM-NOTIFICATIONS.md) has a fixed group, delivery journal and host stop controls; it does not enable general reminders or workspace edits. Its questions are proposals. Before acting on a later Chris/Mike reply, verify the trusted sender and quoted report/reference, clarify ambiguous scope, and reread current item versions.

## Conflict, uncertain result or human correction

On 409, compare the current record against the version you reviewed and the intended change. Accept the human's correction unless an explicitly authorized new decision resolves the disagreement. Do not keep retrying your older plan.

On a timeout/5xx, read current records and Activity. If the result is ambiguous, report the ambiguity and IDs instead of creating a second item. Never repeat a whole batch just because one step was uncertain.

If you made a wrong edit, stop further affected actions, report what changed and prepare a correction against the latest version. Do not erase audit history. A human can perform the same correction through the UI; there is no universal undo command.
