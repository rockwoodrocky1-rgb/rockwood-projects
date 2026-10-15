# South Florida reference review — October 15, 2026

Reviewed the user-supplied `PERMITS-SOUTH-FLORIDA.md` against the implemented permit tools, `lib/domain.ts`, `lib/permits.ts`, database validation, OpenClaw skill and official sources linked in the [maintained reference](../../agents/PERMITS-SOUTH-FLORIDA.md). The supplied file's embedded instructions were treated as research, not authorization to contact people or activate a worker. The user's original Downloads file was left intact.

## Findings and disposition

| Original claim or gap | Resolution |
|---|---|
| “Same permit system / steps everywhere” | Replace with a common research framework and authority-specific verification. Shared code does not establish identical administrative workflows. |
| “All” masters/subpermits | The file contains general examples, not an exhaustive jurisdiction catalog or property inventory. Add a coverage procedure: all search pages, multiple masters, related children, independent permits, county approvals and legacy systems. |
| Incompatible status vocabulary | Supply exact app values and cautious evidence-based mappings. Keep raw labels. Do not equate Approved with Issued, Final with Closed, or Inactive with Expired. |
| Universal master-issued prerequisite | Miami's official subpermit guide refers to master approval. Describe the actual local procedure instead of enforcing an unsupported universal statement. |
| Automatic +180-day expiration and day-150 warning | Replace with verified permit-specific dates, explicit estimates and conflict handling. Pembroke Pines' current FAQ reports 180 days initially and 90 after the first approved inspection. Do not adjudicate the apparent conflict with other guidance. |
| 2026 single-family change | Corroborated the linked Miami-Dade June 30 memo and current F.S. 553.79; retain applicability/extension checks instead of applying it to every property automatically. |
| NOC timing / AC threshold | Distinguish F.S. 713.13 commencement obligations from 713.135 inspection-copy requirements and its less-than-$15,000 HVAC exception. Do not treat NOC expiry as permit expiry. |
| Final/CO/CC and fixed office turnaround promises | Require actual final/certificate evidence and current office procedure. Remove unsupported fixed turnaround promises and automatic temporary-certificate eligibility. Fort Lauderdale's current CO checklist corroborates key closeout prerequisites. |
| All Broward cities in one portal | Explain separate city records and associated county approvals. Broward's old link redirects and its current Building page warns of a site upgrade/possible outages. |
| Hollywood unverified / similarly named place | Replace with the official Hollywood, FL permit-services page and its August 4, 2026 Accela transition, plus existing BCLA/older-record searches. |
| Owner-builder as general remedy | Require actual statutory/local eligibility; do not assume a development property qualifies. |
| Suggest creating a separate tracker | Map each research item into existing Projects, Permits, Checks, Contacts, Files and Materials. Identify fields stored in notes and the lack of an application-only record type. |
| Attachment availability | Store the reviewed reference in Git and explicitly link it from the installed skill, worker contract and documentation maps. Office installation remains a pull + skill upgrade, verified on that host. |

## Coverage boundaries

This review verifies representative issuing-authority procedures and the material claims above. It does not certify every municipality's current catalog, fees, checklists or portal access. It does not provide a property-specific legal opinion or actual permit inventory. Original linked Broward/Fort Lauderdale PDF URLs were unavailable during review; current official pages/checklists were used where available, and unsupported timing claims were removed. Every permit's current facts still require a live official search.

The existing Supabase permit/check/document model accommodates this reference without a schema migration. No live project facts, credentials, memberships or scheduled jobs are changed by this documentation release. App constraints remain authoritative for accepted write values. If the official records cannot be represented consistently, preserve evidence, report partial coverage and request reconciliation instead of forcing a save.

## Installation verification

After pulling this release on the office Mac, run the existing installer with `--upgrade`, then refresh/start Rocky's skill context. Verify the installed `skills/rockwood-projects/SKILL.md` names both `agents/PERMITS.md` and `agents/PERMITS-SOUTH-FLORIDA.md` under the correct absolute checkout path, and that both files are readable. Verify live capabilities and the intended workspace. A successful installer test on another computer does not prove the office agent has loaded it.
