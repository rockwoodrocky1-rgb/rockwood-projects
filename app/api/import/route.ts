import { allRows, ApiError, context, databaseError, endpoint, findProject, jsonBody, kind, newRecordRow, recordInput, response, transition, validateRelationships, validProjectId } from '@/lib/server';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true), raw = await jsonBody(request, 4_000_000), selectedKind = kind(raw.kind), projectId = validProjectId(raw.project_id);
  if (!Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > 500) throw new ApiError(400, 'Import 1 to 500 rows at a time.');
  if (projectId) await findProject(ctx, projectId);
  const rows = raw.rows.map((value, index) => { if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== selectedKind) throw new ApiError(400, `Row ${index + 1} has a different record type.`); return recordInput({ ...value, id: undefined, project_id: projectId }); });
  const records = await allRows(ctx, 'pm_records'), seen = new Set(records.filter(r => r.project_id === projectId && r.kind === selectedKind).map(r => r.title.trim().toLowerCase()));
  for (const input of rows) {
    if (seen.has(input.title.toLowerCase())) throw new ApiError(409, `An item with this title already exists: ${input.title}.`);
    seen.add(input.title.toLowerCase()); validateRelationships(input, records, ctx.workspace.id); transition(newRecordRow(input, ctx.workspace.id), input, records);
  }
  const { data, error } = await ctx.db.rpc('pm_import_records', { p_workspace_id: ctx.workspace.id, p_project_id: projectId, p_kind: selectedKind, p_records: rows });
  if (error) databaseError(error); return response({ count: data }, 201);
}); }
