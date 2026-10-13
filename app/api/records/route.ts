import { allRows, context, endpoint, findProject, jsonBody, newRecordRow, recordInput, response, saveRecord, transition, validateRelationships } from '@/lib/server';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true), input = recordInput(await jsonBody(request));
  input.id = crypto.randomUUID();
  if (input.project_id) await findProject(ctx, input.project_id);
  const records = await allRows(ctx, 'pm_records'), row = newRecordRow(input, ctx.workspace.id);
  validateRelationships(input, records, ctx.workspace.id); transition(row, input, [...records, row]);
  return response({ record: await saveRecord(ctx, input) }, 201);
}); }
