# Human handoff

People use the UI; authorized agents can use the [client/CLI](../../agents/README.md) or [API](../../agents/API.md). Both update the same records and follow the same checks. The repository does not run a background agent, send reminders, or provide a **Pause automation** button. Use these steps when handling work yourself or taking over an unsuccessful agent action. Technical recovery is in [Operations](README.md).

## Open the right place

- **Real saved work:** sign into `/workspace`, then select the project. On a phone, use **Today**, **Plan**, and **More**. On desktop, use the sidebar.
- **Old showcase links:** redirect to the authenticated workspace. The fictional example is retained only in local test fixtures.
- **Today** shows released work, blocked work, near-term waiting work, and work ready to check, with office lead cards and sub/crew chips. Choose **Everyone** and **All** subs to see everything; the choice is remembered on that device. Use **Plan → List** to find other work; clear status, phase, or search filters if an item appears missing.

## Take over an unfinished action

1. Identify the project and existing item, the intended change, the last confirmed result, and the person responsible. If the previous action's outcome is unknown, inspect the item and **More → Activity** before repeating it.
2. If an external agent has been connected separately, its operator must stop or suspend that runner in its own platform before conflicting manual edits. Turning a task's reminder preference off, changing project status, or closing this app does not stop an external agent.
3. Open the item, review its current values, and make the smallest needed correction. Use **More details**, **More dates & reminders**, and the named relationship sections for additional fields.
4. Select **Save changes**, confirm the saved message, then reopen the item to verify its values. Check Activity when the previous outcome was uncertain. A timeout is not proof that the server failed to save.
5. Record the result and next owner in the item's **Notes** under its details section. Keep the work open or blocked if the prerequisite is still unresolved.

If live access is unavailable, keep a temporary note through your team's approved channel with project, item, observation time, proposed change, and owner. Enter it once access returns, after checking current state. The app does not queue offline edits. Do not enter real information into the public showcase as a substitute.

## Manual actions in the current UI

| Need | What to do |
|---|---|
| Assign work | Open its card or Plan row. Set **Lead (office)**, **Lead sub** and **Due date**. If more subs work the job together, add them under **Other subs on this job**. Then save. Add the person through **More → Contacts** first if needed; give office staff the role **Team member**. |
| Move work forward | Review **What needs to happen first?** and **Checks required to finish**. Set the appropriate status: Waiting, Ready, Working, Ready to check, or Done. Save after the actual work or review supports that status. |
| Work cannot proceed | Set **Blocked** and fill **What is stopping the work?**. Keep an owner and realistic date. For a separate shared obstacle, use **More → Closeout → Holds** and link it as a prerequisite where relevant. |
| Move a date | Change **Planned start** and **Due date** on the work item. **More dates & reminders** contains original planned dates and actual dates; retain the original plan when revising current dates. Record why in Notes. |
| Review the effect of a delay | Use **Plan → Gantt timeline** and the linked prerequisites to inspect following work. Update affected dates individually after coordination. The Gantt does not calculate a critical path or move following work automatically. |
| Record an inspection result | Open **More → Checks**. Select the check; confirm **Does this apply?**. A pass requires **Required**, **Result date**, **Inspector / reviewer**, and a result reference or linked supporting file. Complete linked corrections first. |
| A check failed | Select **Failed** and enter findings, result details, and evidence. Add correction work in Plan and link it in **Corrections to complete**. Record a later pass only after the corrections and required review. |
| Work or a check does not apply | Confirm this with the responsible project authority, select **Not applicable**, and record the applicability reason. Do not remove original checklist links to get around a check. |
| An earlier phase was excluded | In the work item's **More details**, use **Excluded earlier work: completion evidence** to document the actual completed earlier work or confirmed project sequence. Retained inspection gates still require their own results. |
| Make a reminder | Use the team's normal phone, email, or messaging process. Record whom you contacted, when, the outcome, and the next follow-up in Notes. Saving **Reminder preference** does not send anything. |
| Add evidence | Use **More → Files → Upload file**, then link it from the item's **Supporting files** section. Select the correct project; same-project links are required. |
| Record a decision or clear a hold | Use **More → Closeout → Decisions** or **Holds**. Record the actual answer/resolution and responsible person before selecting the completed status. A payment entry records payment information; it does not transfer money. |
| Edit project information | Use **More → Projects**, select the project, then **Edit project**. Project address, dates, notes, and status are edited here. |

**Ready to check** means the work is reported ready for review; it is not an inspection pass. Do not infer a pass from a photo, an agent summary, or an optimistic status. Original checklist notes remain under **Original project checklist**.

## When a save fails

| Message or situation | Next step |
|---|---|
| “This item changed while you were editing” | Copy any unsaved information you need to retain. Close the panel, refresh the workspace, reopen the item, and compare the latest values before reapplying your change. Do not overwrite the other person's update by repeatedly saving the old form. |
| Duplicate import or uncertain create result | Search for the existing title and inspect Activity before retrying. The current private UI can show the generic conflict message above for a duplicate too. Repeated create/import attempts can produce confusion; use the existing record where appropriate. |
| Required check, earlier work, or hold prevents saving | Open the named related record and resolve the actual issue. The editor reveals additional sections after a server error. Ask the project decision-maker if applicability or acceptance is unclear. |
| Sign-in expired or read-only access | Preserve unsaved information, sign in again, or ask the workspace administrator to check access. An external agent’s operator renews its token separately. There is no in-app password reset or membership editor. |
| Upload/save timed out | First look in Files and Activity. If the document exists, try its download. If absent, retry the upload after reconnecting. Do not assume a Storage upload alone means the file record was saved. |
| Download no longer opens | Return to Files and download again for a fresh link. |
| CSV will not import | Use **Import CSV → Download CSV template** in the correct view. Re-select the file after a reading error, fix every reported row issue, and confirm the destination project. Import accepts CSV up to 5 MB and 500 rows; an Excel attachment is only a stored file. |
| Wrong project selected for a saved record | Existing records cannot be moved between projects in this UI. Ask the coordinator to create the correct destination entry and review its links; there is no delete/undo button for removing the original. |

## What to give the next person

Send a short handoff through the team's established channel; the app does not send it for you:

```text
Project and item:
What should happen:
Last confirmed saved value/result and time:
What failed or remains unknown:
Evidence or file reference:
Action already taken:
Next owner and follow-up date:
External agent stopped by / where (if one exists):
```

Use the item name and original checklist source ID when available. An operator can obtain internal record IDs from the API when needed. Never include passwords, access tokens, or expiring signed file URLs as permanent evidence.

Before resuming an external agent, its operator should fetch current records, compare any pending action with the manual changes, discard obsolete retries, and confirm the next authorized action. Never replay an uncertain reminder or status update simply because an earlier attempt did not report success.
