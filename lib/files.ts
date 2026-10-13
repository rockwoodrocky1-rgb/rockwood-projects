import { KIND_CONFIG, type RecordInput } from './domain';
import { ApiError, type Context, fileInfo, findProject, findRecord, recordInput, saveRecord, validId, validProjectId } from './server';

export async function fileMetadata(ctx: Context, raw: Record<string, unknown>) {
  const info = fileInfo(raw.name, raw.size), projectId = validProjectId(raw.project_id);
  if (projectId) await findProject(ctx, projectId);
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : info.name;
  if (title.length > 240) throw new ApiError(400, 'File title must be 240 characters or fewer.');
  const category = raw.category || 'Other';
  if (typeof category !== 'string' || !KIND_CONFIG.document.fields.find(f => f.key === 'category')?.options?.includes(category)) throw new ApiError(400, 'Choose a valid document category.');
  let relatedId: string | undefined;
  if (raw.record_id) {
    relatedId = validId(raw.record_id, 'Related item');
    const related = await findRecord(ctx, relatedId);
    if (related.project_id !== projectId) throw new ApiError(400, 'The related item must belong to this project.');
  }
  return { ...info, projectId, title, category, relatedId };
}
export async function attachFile(ctx: Context, metadata: Awaited<ReturnType<typeof fileMetadata>>, path: string, size: number) {
  const input: RecordInput = recordInput({ kind: 'document', project_id: metadata.projectId, title: metadata.title, status: 'Current', data: {
    category: metadata.category, storage_path: path, file_name: metadata.name, file_size: size, mime_type: metadata.mime,
    ...(metadata.relatedId ? { related_record_id: metadata.relatedId } : {}),
  } });
  return saveRecord(ctx, input);
}
