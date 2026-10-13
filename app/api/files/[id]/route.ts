import { ApiError, context, endpoint, findRecord, response, safeStoragePath } from '@/lib/server';
export async function GET(request: Request, args: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const ctx = await context(request), { id } = await args.params, record = await findRecord(ctx, id);
  if (record.kind !== 'document' || !safeStoragePath(record.data.storage_path, ctx.workspace.id, record.project_id)) throw new ApiError(404, 'No uploaded file is attached to this record.');
  const { data, error } = await ctx.db.storage.from('pm-documents').createSignedUrl(record.data.storage_path, 60, { download: typeof record.data.file_name === 'string' ? record.data.file_name : true });
  if (error || !data) throw new ApiError(502, 'The private file could not be opened.');
  return response({ url: data.signedUrl });
}); }
