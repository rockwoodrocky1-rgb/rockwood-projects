import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isDate, KIND_CONFIG, validateRecord, validateTransition, type Kind, type RecordInput, type RecordRow } from './domain';

export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export type Context = { db: SupabaseClient; userId: string; workspace: { id: string; name: string; role: string } };
export function validId(value: unknown, name = 'ID'): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, `${name} must be a valid ID.`);
  return value;
}
export function validProjectId(value: unknown): string | null { return value == null || value === '' ? null : validId(value, 'Project'); }
export function response(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function endpoint(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
    if (error instanceof z.ZodError) return response({ error: error.issues.map(issue => `${issue.path.join('.') || 'Input'}: ${issue.message}`).join('; ') }, 400);
    console.error('Project API failure', error instanceof Error ? error.message : 'Unknown error');
    return response({ error: 'The request could not be completed. Please try again.' }, 500);
  }
}
export async function jsonBody(request: Request, max = 1_000_000): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > max) throw new ApiError(413, 'This request is too large.');
  const body = await request.text();
  if (Buffer.byteLength(body) > max) throw new ApiError(413, 'This request is too large.');
  let value: unknown; try { value = JSON.parse(body); } catch { throw new ApiError(400, 'Send valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Send a JSON object.');
  return value as Record<string, unknown>;
}
export function databaseError(error: { code?: string; message?: string }): never {
  if (error.code === '40001' || error.code === 'PT409' || error.code === '23505') throw new ApiError(409, error.message || 'This item has changed or already exists.');
  if (error.code === '42501') throw new ApiError(403, 'You do not have permission to change this workspace.');
  if (error.code === 'P0002' || error.code === 'PGRST116') throw new ApiError(404, 'The requested item was not found.');
  if (['23514', '23503', '22P02', '22007', '22008', '23502'].includes(error.code || '')) throw new ApiError(400, error.code === '23514' ? error.message || 'Check the submitted details.' : 'A date, required field or related item is invalid.');
  if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202') throw new ApiError(503, 'The project database needs its setup migration.');
  console.error('Project database error', error.code, error.message);
  throw new ApiError(500, 'The database could not save or retrieve this request.');
}
// Account enrollment authenticates the person before they have a membership.
// All project-data endpoints continue to use context(), which requires membership.
export async function authenticatedUser(request: Request): Promise<{ db: SupabaseClient; userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError(503, 'Project storage is not configured yet.');
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) throw new ApiError(401, 'Please sign in.');
  const token = authorization.slice(7);
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) throw new ApiError(401, 'Your session expired. Please sign in again.');
  return { db, userId: auth.user.id };
}
export async function context(request: Request, write = false): Promise<Context> {
  const { db, userId } = await authenticatedUser(request);
  let membershipQuery = db.from('pm_members').select('workspace_id,role,created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1);
  const requestedWorkspace = request.headers.get('x-workspace-id');
  if (requestedWorkspace) membershipQuery = membershipQuery.eq('workspace_id', validId(requestedWorkspace, 'Workspace'));
  const { data: membership, error } = await membershipQuery.maybeSingle();
  if (error) databaseError(error);
  if (!membership) throw new ApiError(403, 'This account has not been added to a project workspace.', 'workspace_missing');
  if (write && !['admin', 'manager'].includes(membership.role)) throw new ApiError(403, 'Your account has read-only access.');
  const { data: workspace, error: workspaceError } = await db.from('pm_workspaces').select('id,name').eq('id', membership.workspace_id).single();
  if (workspaceError) databaseError(workspaceError);
  return { db, userId, workspace: { id: workspace.id, name: workspace.name, role: membership.role } };
}
export async function allRows(ctx: Context, table: 'pm_records' | 'pm_projects' | 'pm_permit_monitors'): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.db.from(table).select('*').eq('workspace_id', ctx.workspace.id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
    if (error) databaseError(error);
    rows.push(...data!); if (data!.length < 1000) break;
  }
  return rows;
}
export async function findProject(ctx: Context, id: string): Promise<any> {
  const { data, error } = await ctx.db.from('pm_projects').select('*').eq('id', validId(id)).eq('workspace_id', ctx.workspace.id).maybeSingle();
  if (error) databaseError(error); if (!data) throw new ApiError(404, 'Project not found.'); return data;
}
export async function findRecord(ctx: Context, id: string): Promise<RecordRow> {
  const { data, error } = await ctx.db.from('pm_records').select('*').eq('id', validId(id)).eq('workspace_id', ctx.workspace.id).maybeSingle();
  if (error) databaseError(error); if (!data) throw new ApiError(404, 'Item not found.'); return data as RecordRow;
}
const date = z.union([z.string().refine(isDate, 'Use a real date in YYYY-MM-DD format.'), z.null(), z.literal('')]).transform(v => v || null);
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200), address: z.string().max(1000).default(''), project_type: z.string().max(100).default('Residential'),
  status: z.string().trim().min(1).max(50).default('Planning'), start_date: date.default(null), target_date: date.default(null),
  lead: z.string().max(200).default(''), description: z.string().max(20000).default(''), locations: z.array(z.string().trim().min(1).max(200)).max(200).default([]), is_demo: z.boolean().default(false),
}).refine(p => !p.start_date || !p.target_date || p.target_date >= p.start_date, { message: 'Target finish cannot be before the start.', path: ['target_date'] });
export function version(value: unknown): number { if (!Number.isInteger(value) || Number(value) < 1) throw new ApiError(400, 'Supply the current version before saving.'); return Number(value); }
export function recordInput(value: unknown): RecordInput { try { return validateRecord(value); } catch (error) { throw new ApiError(400, (error as Error).message); } }
export function kind(value: unknown): Kind { if (typeof value !== 'string' || !Object.hasOwn(KIND_CONFIG, value)) throw new ApiError(400, 'Choose a supported record type.'); return value as Kind; }

export function validateRelationships(input: RecordInput, records: RecordRow[], workspaceId: string): void {
  const d = input.data || {}, projectId = input.project_id || null;
  const linked = (id: unknown, key: string, strictProject: boolean, requiredKind?: Kind) => {
    if (id == null || id === '') return;
    const r = records.find(r => r.id === validId(id, key) && r.workspace_id === workspaceId);
    if (!r || (strictProject ? r.project_id !== projectId : r.project_id !== null && r.project_id !== projectId)) throw new ApiError(400, `${key.replaceAll('_', ' ')} must refer to an item in this project or an allowed shared contact/file.`);
    if (requiredKind && r.kind !== requiredKind) throw new ApiError(400, `${key.replaceAll('_', ' ')} must refer to ${KIND_CONFIG[requiredKind].label.toLowerCase()}.`);
  };
  // A contractor can be assigned across projects in the same workspace.
  if (input.owner_id) { const owner = records.find(r => r.id === input.owner_id); if (!owner || owner.workspace_id !== workspaceId || owner.kind !== 'contact') throw new ApiError(400, 'Choose a contact in this workspace as the responsible person.'); }
  for (const key of ['contractor_id', 'supplier_id', 'contact_id']) {
    if (!d[key]) continue;
    const owner = records.find(r => r.id === validId(d[key], key));
    if (!owner || owner.workspace_id !== workspaceId || owner.kind !== 'contact') throw new ApiError(400, 'Choose a contact in this workspace.');
  }
  // Further subs on the job are contacts too, from anywhere in the workspace.
  for (const id of d.other_contractor_ids || []) {
    const sub = records.find(r => r.id === validId(id, 'other_contractor_ids'));
    if (!sub || sub.workspace_id !== workspaceId || sub.kind !== 'contact') throw new ApiError(400, 'Choose a contact in this workspace for each sub.');
  }
  for (const key of ['contract_id', 'bid_id', 'task_id', 'material_id', 'related_record_id', 'linked_record_id']) linked(d[key], key, true, key === 'contract_id' ? 'contract' : undefined);
  for (const key of ['prerequisite_ids', 'check_ids', 'corrective_action_ids', 'document_ids', 'linked_task_ids', 'related_record_ids']) {
    if (d[key] == null) continue;
    if (!Array.isArray(d[key])) throw new ApiError(400, `${key} must be a list.`);
    for (const id of d[key]) linked(id, key, !['document_ids', 'related_record_ids'].includes(key), key === 'check_ids' ? 'check' : key === 'document_ids' ? 'document' : undefined);
  }
  for (const key of ['parent_permit_id', 'permit_id']) linked(d[key], key, true, 'permit');
  if (d.storage_path != null && !safeStoragePath(d.storage_path, workspaceId, projectId)) throw new ApiError(400, 'Invalid document storage path.');
}
export function transition(previous: RecordRow, next: RecordInput, records: RecordRow[]): void { try { validateTransition(previous, next, records); } catch (error) { throw new ApiError(400, (error as Error).message); } }
export function newRecordRow(input: RecordInput, workspaceId: string): RecordRow {
  return { id: input.id || crypto.randomUUID(), workspace_id: workspaceId, project_id: input.project_id || null, kind: input.kind, title: input.title, status: input.status || KIND_CONFIG[input.kind].statuses[0], owner_id: input.owner_id || null, due_date: input.due_date || null, data: input.data || {}, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
export async function saveRecord(ctx: Context, input: RecordInput, expectedVersion?: number): Promise<RecordRow> {
  const { data, error } = await ctx.db.rpc('pm_save_record', { p_workspace_id: ctx.workspace.id, p_record: input, p_expected_version: expectedVersion ?? null });
  if (error) databaseError(error); return data as RecordRow;
}
export const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
  csv: 'text/csv', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', rtf: 'application/rtf',
};
export function fileInfo(name: unknown, size: unknown): { extension: string; mime: string; name: string } {
  if (typeof name !== 'string' || !name.trim() || name.length > 240 || /[\x00-\x1f/\\]/.test(name)) throw new ApiError(400, 'Choose a file with a valid name.');
  if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > MAX_FILE_BYTES) throw new ApiError(400, 'Files must be between 1 byte and 20 MB.');
  const extension = name.split('.').pop()?.toLowerCase() || '', mime = FILE_TYPES[extension];
  if (!mime) throw new ApiError(400, 'Choose a PDF, image, Office document, CSV or text file.');
  return { extension, mime, name };
}
export function validateFileBytes(bytes: Uint8Array, extension: string): void {
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  const text = new TextDecoder().decode(bytes.subarray(0, 512));
  let valid = true;
  if (extension === 'pdf') valid = text.startsWith('%PDF-');
  else if (extension === 'png') valid = starts(137, 80, 78, 71, 13, 10, 26, 10);
  else if (['jpg', 'jpeg'].includes(extension)) valid = starts(255, 216, 255);
  else if (extension === 'gif') valid = /^GIF8[79]a/.test(text);
  else if (extension === 'webp') valid = text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP';
  else if (['heic', 'heif'].includes(extension)) valid = text.slice(4, 8) === 'ftyp';
  else if (['tif', 'tiff'].includes(extension)) valid = starts(73, 73, 42, 0) || starts(77, 77, 0, 42);
  else if (['docx', 'xlsx', 'pptx'].includes(extension)) valid = starts(80, 75, 3, 4);
  else if (['doc', 'xls', 'ppt'].includes(extension)) valid = starts(208, 207, 17, 224, 161, 177, 26, 225);
  else if (extension === 'rtf') valid = text.startsWith('{\\rtf');
  else if (['csv', 'txt'].includes(extension)) valid = !bytes.subarray(0, 8192).includes(0) && !/^\s*(<!doctype html|<html|<svg|<script)/i.test(text);
  if (!valid) throw new ApiError(400, 'The file contents do not match its extension.');
}
export function safeStoragePath(path: unknown, workspaceId: string, projectId?: string | null): path is string {
  if (typeof path !== 'string' || path.includes('..') || path.includes('\\')) return false;
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === workspaceId && (projectId === undefined ? parts[1] === 'shared' || UUID.test(parts[1]) : parts[1] === (projectId || 'shared')) && /^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(parts[2]) && !!FILE_TYPES[parts[2].split('.').pop()!.toLowerCase()];
}
