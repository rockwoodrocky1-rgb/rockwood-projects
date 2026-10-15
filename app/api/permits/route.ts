import { allRows, context, endpoint, response } from '@/lib/server';
import { permitRuns } from '@/lib/permit-server';
export async function GET(request: Request) { return endpoint(async()=>{ const ctx=await context(request); const [monitors,runs]=await Promise.all([allRows(ctx,'pm_permit_monitors'),permitRuns(ctx)]); return response({monitors,runs}); }); }
