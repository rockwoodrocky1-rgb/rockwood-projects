import { authenticatedUser, databaseError, endpoint, response } from '@/lib/server';

// This endpoint deliberately needs an authenticated user, not an existing member.
// The RPC alone selects the configured workspace, caller and role; no body is used.
export async function POST(request: Request) { return endpoint(async () => {
  const { db } = await authenticatedUser(request);
  const { data, error } = await db.rpc('pm_join_open_workspace');
  if (error) databaseError(error);
  return response({ membership: data });
}); }
