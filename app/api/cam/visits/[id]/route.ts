import { context, databaseError, endpoint, response, ApiError } from '@/lib/server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, route: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const ctx = await context(request), { id } = await route.params;
  const { data: visit, error } = await ctx.db.from('walkthroughs').select('*')
    .eq('workspace_id', ctx.workspace.id).eq('id', id).maybeSingle();
  if (error) databaseError(error);
  if (!visit) throw new ApiError(404, 'Walkthrough not found.');
  return response({ visit });
}); }
