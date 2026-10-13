import { allRows, context, databaseError, endpoint, response } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await context(request);
  const [projects, records, eventsResult] = await Promise.all([allRows(ctx, 'pm_projects'), allRows(ctx, 'pm_records'), ctx.db.from('pm_audit').select('id,workspace_id,project_id,record_id,action,summary,actor_id,created_at').eq('workspace_id', ctx.workspace.id).order('created_at', { ascending: false }).limit(250)]);
  if (eventsResult.error) databaseError(eventsResult.error);
  return response({ workspace: ctx.workspace, projects, records, events: eventsResult.data });
}); }
