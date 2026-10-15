import { camContext } from '@/cam/server/context';
import { liveEnabled } from '@/cam/server/api';
import { z } from 'zod';
import { databaseError, endpoint, response } from '@/lib/server';
const deliveryColumns = 'id,workspace_id,walkthrough_id,report_id,revision,status,pdf_path,last_error,created_at,sent_at';

// The AWS worker renders PDFs. The web application only reads with the user's
// own workspace session; it never receives the worker's service-role key.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => {
  const ctx = await camContext(request);
  const query = new URL(request.url).searchParams;
  const report = z.string().min(1).max(100).parse(query.get('report'));
  const { data: job, error } = await ctx.db.from('report_deliveries').select(deliveryColumns)
    .eq('workspace_id', ctx.workspace.id).eq('report_id', report).maybeSingle();
  if (error) databaseError(error);
  let pdfUrl: string | null = null;
  if (job?.pdf_path) {
    const signed = await ctx.db.storage.from('walkthrough-reports').createSignedUrl(job.pdf_path, 300, { download: true });
    if (signed.error) databaseError(signed.error);
    pdfUrl = signed.data.signedUrl;
  }
  return response({ job, pdfUrl, reportUrl: null, configured: false, workerConfigured: liveEnabled() });
}); }
