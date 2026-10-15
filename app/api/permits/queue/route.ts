import { allRows, context, endpoint, response } from '@/lib/server';
import { permitRuns } from '@/lib/permit-server';
import { permitQueue } from '@/lib/permits';
export async function GET(request: Request) { return endpoint(async()=>{ const ctx=await context(request); const [projects,monitors,runs,records]=await Promise.all([allRows(ctx,'pm_projects'),allRows(ctx,'pm_permit_monitors'),permitRuns(ctx),allRows(ctx,'pm_records')]); return response({queue:permitQueue(projects,monitors,runs,records),generated_at:new Date().toISOString(),lease_minutes:30,interval_minutes:60}); }); }
