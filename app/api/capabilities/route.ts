import { agentCapabilities } from '@/lib/capabilities';
import { context, endpoint, response } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return endpoint(async () => {
    const { workspace } = await context(request);
    return response(agentCapabilities(workspace));
  });
}
