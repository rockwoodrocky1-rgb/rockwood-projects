import { createProjectRecords } from '@/lib/domain';
import { ApiError, context, databaseError, endpoint, jsonBody, newRecordRow, projectSchema, recordInput, response, transition, validateRelationships } from '@/lib/server';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true), raw = await jsonBody(request), project = projectSchema.parse(raw), id = crypto.randomUUID();
  if (raw.template != null && typeof raw.template !== 'boolean') throw new ApiError(400, 'Template must be yes or no.');
  if (raw.selected_phases != null && (!Array.isArray(raw.selected_phases) || raw.selected_phases.some(p => !Number.isInteger(p) || Number(p) < 1 || Number(p) > 15))) throw new ApiError(400, 'Choose phases from 1 to 15.');
  const records = raw.template ? createProjectRecords(id, { selectedPhases: raw.selected_phases as number[] | undefined, isDemo: project.is_demo, startDate: project.start_date || undefined }).map(recordInput) : [];
  const rows = records.map(record => newRecordRow(record, ctx.workspace.id));
  for (let i = 0; i < records.length; i++) { validateRelationships(records[i], rows, ctx.workspace.id); transition(rows[i], records[i], rows); }
  const { data, error } = await ctx.db.rpc('pm_create_project', { p_workspace_id: ctx.workspace.id, p_project: { ...project, id }, p_records: records });
  if (error) databaseError(error);
  return response({ project: data }, 201);
}); }
