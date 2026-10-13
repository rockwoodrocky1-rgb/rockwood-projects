import { attachFile, fileMetadata } from '@/lib/files';
import { ApiError, context, endpoint, jsonBody, response, safeStoragePath, validateFileBytes } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true), raw = await jsonBody(request), metadata = await fileMetadata(ctx, raw);
  if (!safeStoragePath(raw.path, ctx.workspace.id, metadata.projectId) || !raw.path.endsWith(`.${metadata.extension}`)) throw new ApiError(400, 'The upload path does not belong to this project.');
  const { data: blob, error } = await ctx.db.storage.from('pm-documents').download(raw.path);
  if (error || !blob) throw new ApiError(400, 'The upload is not available yet. Upload the file before saving.');
  if (blob.size !== raw.size || blob.size > 20 * 1024 * 1024) throw new ApiError(400, 'The uploaded file size does not match.');
  const bytes = new Uint8Array(await blob.arrayBuffer()); validateFileBytes(bytes, metadata.extension);
  // Retrying this final step is safe after a network interruption.
  const { data: existing } = await ctx.db.from('pm_records').select('*').eq('workspace_id', ctx.workspace.id).eq('kind', 'document').contains('data', { storage_path: raw.path }).maybeSingle();
  if (existing) return response({ record: existing });
  return response({ record: await attachFile(ctx, metadata, raw.path, bytes.length) }, 201);
}); }
