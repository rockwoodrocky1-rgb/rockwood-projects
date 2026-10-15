import { databaseError, endpoint, response } from '@/lib/server';
import { camContext } from '@/cam/server/context';
import { liveEnabled } from '@/cam/server/api';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await camContext(request);
  const [properties, contact] = await Promise.all([
    ctx.db.rpc('cam_property_choices', { target: ctx.workspace.id }),
    ctx.db.from('field_contacts').select('name,phone').eq('user_id', ctx.userId).eq('workspace_id', ctx.workspace.id).maybeSingle(),
  ]);
  if (properties.error) databaseError(properties.error);
  if (contact.error) databaseError(contact.error);
  return response({ workspace: ctx.workspace, live: liveEnabled(), projects: properties.data, participant: contact.data });
}); }
