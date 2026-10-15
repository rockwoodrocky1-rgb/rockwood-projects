import { liveEnabled } from '@/cam/server/api';
import { context, endpoint, response } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  await context(request);
  return response({ live: liveEnabled(), processing: process.env.AI_PROVIDER === 'aws' ? 'background' : 'request' });
}); }
