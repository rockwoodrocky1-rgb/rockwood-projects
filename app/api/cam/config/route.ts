import { camContext } from '@/cam/server/context';
import { liveEnabled } from '@/cam/server/api';
import { endpoint, response } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  await camContext(request);
  return response({ live: liveEnabled(), processing: process.env.AI_PROVIDER === 'aws' ? 'background' : 'request' });
}); }
