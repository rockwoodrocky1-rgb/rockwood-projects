# Customer requirements instructions

`customer-requirements.json` is the normalized source record, not an instruction file. Preserve original IDs, wording, conditions, ownership, notes and relative timing. It currently represents 109 work rows across 15 phases and 35 inspection entries expanded into 44 check stages.

Do not “simplify” the source by dropping rows or combining independent inspection results. Keep mappings in `lib/template.ts` and coverage tests aligned. Any intentional source correction needs traceability to the customer's correction. Unknown dates, applicability and responsible people must remain unconfirmed until supplied.

Do not add live customer contact details, credentials or project records to fixtures. Fictional examples must remain clearly labeled.
