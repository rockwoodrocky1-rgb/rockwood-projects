import { allRows, context, endpoint, findRecord, jsonBody, recordInput, response, saveRecord, transition, validateRelationships, version } from '@/lib/server';
export async function PATCH(request: Request, args: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const ctx = await context(request, true), { id } = await args.params, raw = await jsonBody(request), expectedVersion = version(raw.version), previous = await findRecord(ctx, id);
  const input = recordInput({ ...previous, ...raw, id });
  const records = await allRows(ctx, 'pm_records');
  validateRelationships(input, records, ctx.workspace.id); transition(previous, input, records);
  return response({ record: await saveRecord(ctx, input, expectedVersion) });
}); }
