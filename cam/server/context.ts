import { ApiError, authenticatedUser, databaseError, validId, type Context } from '@/lib/server';

// Cam sessions grant field capture only. Workspace APIs retain context()/pm_members.
export async function camContext(request: Request, write = false): Promise<Context> {
  const { db, userId } = await authenticatedUser(request);
  let query = db.from('workspace_members').select('workspace_id,role').eq('user_id', userId).order('workspace_id').limit(1);
  const selected = request.headers.get('x-workspace-id');
  if (selected) query = query.eq('workspace_id', validId(selected, 'Workspace'));
  const { data: member, error } = await query.maybeSingle();
  if (error) databaseError(error);
  if (!member) throw new ApiError(403, 'Enter your name and phone number to start.', 'cam_contact_required');
  if (write && member.role === 'viewer') throw new ApiError(403, 'This visit is read-only.');
  const { data: workspace, error: workspaceError } = await db.from('workspaces').select('id,name').eq('id', member.workspace_id).single();
  if (workspaceError) databaseError(workspaceError);
  return { db, userId, workspace: { ...workspace, role: member.role } };
}
