import { allRows, context, endpoint, response } from '@/lib/server';
import { liveEnabled } from '@/cam/server/api';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await context(request);
  const projects = (await allRows(ctx, 'pm_projects')).filter(p => !p.is_demo);
  return response({ workspace: ctx.workspace, live: liveEnabled(), projects: projects.map((p, index) => ({
    id: p.id, name: p.name, address: p.address, type: p.project_type, stage: p.status,
    areas: p.locations, image: '', number: String(index + 1).padStart(2, '0'),
  })) });
}); }
