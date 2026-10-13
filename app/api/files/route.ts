import { attachFile, fileMetadata } from '@/lib/files';
import { ApiError, context, endpoint, response, validateFileBytes } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true);
  if (Number(request.headers.get('content-length')) > 4_300_000) throw new ApiError(413, 'Use direct upload for files larger than 4 MB.');
  let form: FormData; try { form = await request.formData(); } catch { throw new ApiError(400, 'Choose a file to upload.'); }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Choose a file to upload.');
  if (file.size > 4_000_000) throw new ApiError(413, 'Use direct upload for files larger than 4 MB.');
  const metadata = await fileMetadata(ctx, { name: file.name, size: file.size, project_id: form.get('project_id'), title: form.get('title'), category: form.get('category'), record_id: form.get('record_id') });
  const bytes = new Uint8Array(await file.arrayBuffer()); validateFileBytes(bytes, metadata.extension);
  const path = `${ctx.workspace.id}/${metadata.projectId || 'shared'}/${crypto.randomUUID()}.${metadata.extension}`;
  const { error } = await ctx.db.storage.from('pm-documents').upload(path, bytes, { contentType: metadata.mime, upsert: false });
  if (error) throw new ApiError(502, 'Private storage could not accept the file. Please try again.');
  try { return response({ record: await attachFile(ctx, metadata, path, bytes.length) }, 201); }
  catch (error) { await ctx.db.storage.from('pm-documents').remove([path]); throw error; }
}); }
