import { context, databaseError, endpoint, response, validId } from '@/lib/server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await context(request), query = new URL(request.url).searchParams;
  const project = query.get('project');
  const offset = Math.max(0, Math.min(100000, Number(query.get('offset')) || 0));
  let selection = ctx.db.from('pm_cam_visits').select('*').eq('workspace_id', ctx.workspace.id)
    .neq('status', 'archived').order('captured_at', { ascending: false }).order('visit_id').range(offset, offset + 49);
  if (project) selection = selection.eq('project_id', validId(project, 'Property'));
  const { data: visits, error } = await selection;
  if (error) databaseError(error);
  return response({ visits, hasMore: visits.length === 50 });
}); }
