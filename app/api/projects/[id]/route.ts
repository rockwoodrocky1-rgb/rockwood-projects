import { context, databaseError, endpoint, findProject, jsonBody, projectSchema, response, version } from '@/lib/server';
export async function GET(request: Request, args: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const ctx = await context(request), { id } = await args.params;
  return response({ project: await findProject(ctx, id) });
}); }
export async function PATCH(request: Request, args: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const ctx = await context(request, true), { id } = await args.params, raw = await jsonBody(request), expectedVersion = version(raw.version), previous = await findProject(ctx, id);
  const project = projectSchema.parse({ ...previous, ...raw });
  const { data, error } = await ctx.db.rpc('pm_update_project', { p_workspace_id: ctx.workspace.id, p_id: id, p_expected_version: expectedVersion, p_project: project });
  if (error) databaseError(error); return response({ project: data });
}); }
