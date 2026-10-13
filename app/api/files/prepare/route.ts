import { fileMetadata } from '@/lib/files';
import { ApiError, context, endpoint, jsonBody, response } from '@/lib/server';
export async function POST(request: Request) { return endpoint(async () => {
  const ctx = await context(request, true), metadata = await fileMetadata(ctx, await jsonBody(request));
  const path = `${ctx.workspace.id}/${metadata.projectId || 'shared'}/${crypto.randomUUID()}.${metadata.extension}`;
  const { data, error } = await ctx.db.storage.from('pm-documents').createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new ApiError(502, 'Private file storage could not prepare the upload.');
  return response({ path, token: data.token, contentType: metadata.mime, bucket: 'pm-documents' });
}); }
