import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CHECK_OUTCOMES, safePermitUrl, type PermitRun } from './permits';
import { allRows, ApiError, databaseError, newRecordRow, recordInput, transition, validateRelationships, type Context } from './server';
import type { RecordRow } from './domain';
export const sourceUrl = z.string().max(2048).refine(v => v === '' || safePermitUrl(v), 'Use an HTTPS source URL without credentials.');
export const monitorInput = z.object({ project_id: z.string().uuid(), version: z.number().int().min(0), settings: z.object({ enabled: z.boolean().optional(), jurisdiction: z.string().trim().max(200).optional(), source_url: sourceUrl.optional(), check_now: z.boolean().optional() }).strict() }).strict();
export const claimInput = z.object({ project_id: z.string().uuid(), request_key: z.string().uuid() }).strict();
export const completionInput = z.object({ outcome: z.enum(CHECK_OUTCOMES), summary: z.string().trim().min(1).max(4000), source_url: sourceUrl.default(''), records: z.array(z.object({ id: z.string().uuid(), version: z.number().int().positive().optional(), kind: z.enum(['permit','check']), title: z.string().optional(), status: z.string().optional(), owner_id: z.string().uuid().nullable().optional(), due_date: z.string().nullable().optional(), data: z.record(z.string(),z.unknown()) }).strict()).max(200).default([]) }).strict();
export function payloadHash(value: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k,stable(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export async function permitRuns(ctx: Context) {
  const [recent, active] = await Promise.all([
    ctx.db.from('pm_permit_runs').select('id,workspace_id,project_id,actor_id,request_key,status,started_at,lease_expires_at,finished_at,summary,source_url').eq('workspace_id',ctx.workspace.id).order('started_at',{ascending:false}).limit(100),
    ctx.db.from('pm_permit_runs').select('id,workspace_id,project_id,actor_id,request_key,status,started_at,lease_expires_at,finished_at,summary,source_url').eq('workspace_id',ctx.workspace.id).eq('status','running'),
  ]);
  if(recent.error) databaseError(recent.error); if(active.error) databaseError(active.error);
  return [...new Map([...recent.data!,...active.data!].map(r => [r.id,r])).values()].sort((a,b)=>b.started_at.localeCompare(a.started_at)) as PermitRun[];
}
export async function permitRun(ctx: Context, id: string) {
  const {data,error}=await ctx.db.from('pm_permit_runs').select('*').eq('workspace_id',ctx.workspace.id).eq('id',id).maybeSingle();
  if(error) databaseError(error); if(!data) throw new ApiError(404,'Permit check not found.'); return data as PermitRun;
}
export async function completePermitCheck(ctx: Context, run: PermitRun, raw: unknown) {
  const input=completionInput.parse(raw), hash=payloadHash(input);
  if(run.status !== 'running') {
    if(run.actor_id===ctx.userId && run.payload_hash===hash) return run;
    throw new ApiError(409,'This check already ended. Read its saved result.');
  }
  if(new Set(input.records.map(r=>r.id)).size!==input.records.length) throw new ApiError(400,'Submit each record only once.');
  const records = await allRows(ctx,'pm_records') as RecordRow[];
  const updates=input.records.map(item => {
    const previous=records.find(r=>r.id===item.id);
    if(previous && (previous.project_id!==run.project_id || previous.kind!==item.kind)) throw new ApiError(400,'Record belongs to another property or kind.');
    if(previous ? previous.version!==item.version : item.version!==undefined) throw new ApiError(409,'Record version changed. Reread and reconcile this observation.');
    const value=recordInput({...previous,...item,project_id:run.project_id,data:{...previous?.data,...item.data}});
    return {...value,id:item.id,...(item.version ? {version:item.version} : {})};
  });
  const finalRecords=records.filter(r=>!updates.some(u=>u.id===r.id)).concat(updates.map(u=>({...records.find(r=>r.id===u.id),...newRecordRow(u,ctx.workspace.id)})));
  for(const update of updates) {
    validateRelationships(update,finalRecords,ctx.workspace.id);
    transition(records.find(r=>r.id===update.id)||newRecordRow(update,ctx.workspace.id),update,finalRecords);
  }
  const {data,error}=await ctx.db.rpc('pm_complete_permit_check',{p_workspace_id:ctx.workspace.id,p_run_id:run.id,p_outcome:input.outcome,p_summary:input.summary,p_source_url:input.source_url,p_payload_hash:hash,p_updates:updates});
  if(error) databaseError(error); return data as PermitRun;
}
