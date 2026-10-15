import { context, endpoint } from '@/lib/server';
import { handleReport } from '@/cam/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(request: Request) { return endpoint(async () => {
  await context(request, true);
  return handleReport(request);
}); }
