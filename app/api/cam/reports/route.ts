import { z } from 'zod';
import { context, databaseError, endpoint, response } from '../../../../lib/server';

export const dynamic = 'force-dynamic';
const querySchema = z.object({
  after: z.iso.datetime({ offset: true }),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const columns = 'id,workspace_id,walkthrough_id,report_id,revision,status,pdf_path,last_error,created_at,sent_at';

// Office-only read of the existing durable PDF outbox. This also finds reports
// superseded by a newer report on the same visit while the office host was offline.
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await context(request);
  const query = new URL(request.url).searchParams;
  const { after, offset } = querySchema.parse({ after: query.get('after'), offset: query.get('offset') ?? 0 });
  const { data: reports, error } = await ctx.db.from('report_deliveries').select(columns)
    .eq('workspace_id', ctx.workspace.id).gte('created_at', after)
    .order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 49);
  if (error) databaseError(error);
  return response({ reports, hasMore: reports.length === 50 });
}); }
