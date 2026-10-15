import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createProjectRecords } from '../lib/domain';
import { fileInfo, safeStoragePath, validateFileBytes, validateRelationships } from '../lib/server';

const ids = { admin: '11111111-1111-4111-8111-111111111111', reader: '22222222-2222-4222-8222-222222222222', outsider: '33333333-3333-4333-8333-333333333333', workspace: '44444444-4444-4444-8444-444444444444', otherWorkspace: '55555555-5555-4555-8555-555555555555', project: '66666666-6666-4666-8666-666666666666' };
let db: PGlite;
async function asUser(user: string) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated'); }
async function rpc(name: string, params: unknown[]) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query<{ result: any }>(`select public.${name}(${placeholders}) as result`, params)).rows[0].result;
}
const record = (title: string, extra: any = {}) => ({ kind: 'task', title, status: 'Waiting', project_id: ids.project, data: {}, ...extra });

describe('permit monitoring database contract', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610130001_pm.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/202610130002_conflict_http_status.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/202610150001_permit_monitoring.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users values($1),($2),($3)', [ids.admin, ids.reader, ids.outsider]);
    await db.query('insert into public.pm_workspaces(id,name) values($1,$2),($3,$4)', [ids.workspace, 'Main', ids.otherWorkspace, 'Other']);
    await db.query("insert into public.pm_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'reader'),($4,$5,'admin')", [ids.workspace, ids.admin, ids.reader, ids.otherWorkspace, ids.outsider]);
    await asUser(ids.admin);
    await rpc('pm_create_project', [ids.workspace, { id: ids.project, name: 'Real project' }, []]);
  }, 30000);
  afterAll(async () => { await db?.close(); });


  const permit = (projectId: string, extra: any = {}) => record('Building permit', { id: crypto.randomUUID(), kind:'permit', project_id:projectId, status:'In review', data:{permit_number:crypto.randomUUID(),jurisdiction:'Example City',permit_type:'Master',source_url:'https://example.gov/permit/1',evidence:'Portal reports under review.',source_observed_at:new Date().toISOString()},...extra });
  const project = async (extra: any = {}) => {await asUser(ids.admin);const p=await rpc('pm_create_project',[ids.workspace,{id:crypto.randomUUID(),name:'Permit workflow',...extra},[]]);return p.id;};
  const claim = (projectId:string,key=crypto.randomUUID()) => rpc('pm_claim_permit_check',[ids.workspace,projectId,key]);
  const complete = (run:any,updates:any[]=[],outcome='success',hash='a'.repeat(64)) => rpc('pm_complete_permit_check',[ids.workspace,run.id,outcome,'Observed official property portal','https://example.gov/permit/1',hash,updates]);
  it('creates master, subpermit and linked inspection in one atomic check with audit',async()=>{
    const pid=await project(),run=await claim(pid),master=permit(pid),child=permit(pid,{title:'Plumbing subpermit'});
    child.data={...child.data,permit_type:'Subpermit',parent_permit_id:master.id};
    const inspection=record('Rough plumbing',{id:crypto.randomUUID(),project_id:pid,kind:'check',status:'Scheduled',data:{permit_id:child.id,external_key:'example:inspection:1',scheduled_date:'2026-11-01',source_url:'https://example.gov/permit/1',evidence:'Scheduled by the city',source_observed_at:new Date().toISOString()}});
    const result=await complete(run,[master,child,inspection]);expect(result.status).toBe('success');expect(result.result.records).toHaveLength(3);
    expect(result.result.records[0].data.last_permit_run_id).toBe(run.id);
    expect((await db.query('select * from pm_audit where project_id=$1 and record_id is not null',[pid])).rows).toHaveLength(3);
    const monitor=(await db.query<any>('select * from pm_permit_monitors where project_id=$1',[pid])).rows[0];expect(monitor.last_success_at).toBeTruthy();expect(monitor.failure_count).toBe(0);
    const nextDue=new Date(monitor.next_check_at);expect(nextDue.getUTCMinutes()).toBe(0);expect(nextDue.getUTCSeconds()).toBe(0);expect(nextDue.getTime()).toBeGreaterThan(Date.now());expect(nextDue.getTime()-Date.now()).toBeLessThanOrEqual(3600000);
  });
  it('deduplicates claims and completion replay; refuses overlapping claims and altered replays',async()=>{
    const pid=await project(),key=crypto.randomUUID(),run=await claim(pid,key),item=permit(pid);
    expect((await claim(pid,key)).id).toBe(run.id);await expect(claim(pid)).rejects.toThrow(/already|progress|claimed/i);
    const result=await complete(run,[item]);expect((await complete(run,[item])).result).toEqual(result.result);
    await expect(complete(run,[item],'success','b'.repeat(64))).rejects.toThrow(/already ended/);
    expect((await db.query('select * from pm_records where project_id=$1',[pid])).rows).toHaveLength(1);
    await expect(claim(pid)).rejects.toThrow(/due/);
  });
  it('rolls back all observations, audit and run outcome on stale human edits',async()=>{
    const pid=await project(),existing=await rpc('pm_save_record',[ids.workspace,permit(pid),null]),run=await claim(pid);
    await rpc('pm_save_record',[ids.workspace,{...existing,title:'Human correction'},existing.version]);
    const fresh=permit(pid);await expect(complete(run,[fresh,existing])).rejects.toThrow(/changed/);
    expect((await db.query('select * from pm_records where id=$1',[fresh.id])).rows).toHaveLength(0);
    expect((await db.query<any>('select status from pm_permit_runs where id=$1',[run.id])).rows[0].status).toBe('running');
  });
  it('preserves known statuses when the portal fails and shows failure without false freshness',async()=>{
    const pid=await project(),existing=await rpc('pm_save_record',[ids.workspace,permit(pid),null]),run=await claim(pid);
    await expect(complete(run,[existing],'error')).rejects.toThrow(/cannot change/);
    await complete(run,[],'blocked');
    const m=(await db.query<any>('select * from pm_permit_monitors where project_id=$1',[pid])).rows[0];expect(m.last_success_at).toBeNull();expect(m.failure_count).toBe(1);
    expect((await db.query<any>('select version,status from pm_records where id=$1',[existing.id])).rows[0]).toMatchObject({version:1,status:'In review'});
  });
  it('excludes demo/completed properties and honors versioned pause settings',async()=>{
    for(const extra of [{is_demo:true},{status:'Complete'},{status:'Archived'},{status:'Past job'}])await expect(claim(await project(extra))).rejects.toThrow(/eligible/);
    const pid=await project(),m=await rpc('pm_configure_permit_monitor',[ids.workspace,pid,0,{enabled:false}]);
    await expect(claim(pid)).rejects.toThrow(/paused/);await expect(rpc('pm_configure_permit_monitor',[ids.workspace,pid,0,{enabled:true}])).rejects.toThrow(/changed/);
    await rpc('pm_configure_permit_monitor',[ids.workspace,pid,m.version,{enabled:true}]);expect((await claim(pid)).status).toBe('running');
  });
  it('rejects reader, outsider, raw writes and completing another operator check',async()=>{
    const pid=await project(),run=await claim(pid);
    for(const user of [ids.reader,ids.outsider]){await asUser(user);await expect(claim(pid)).rejects.toThrow(/cannot change/);await expect(complete(run,[],'error')).rejects.toThrow(/cannot change/);}
    expect((await db.query('select * from pm_permit_runs where id=$1',[run.id])).rows).toHaveLength(0);
    await asUser(ids.admin);await expect(db.query("update pm_permit_monitors set enabled=false where project_id=$1",[pid])).rejects.toThrow(/permission denied/);
    await db.exec('reset role');await db.query("insert into pm_members(workspace_id,user_id,role) values($1,$2,'manager')",[ids.workspace,ids.outsider]);await asUser(ids.outsider);
    await expect(complete(run,[],'error')).rejects.toThrow(/another operator/);
  });
  it('recovers expired leases and refuses expired results',async()=>{
    const pid=await project(),run=await claim(pid);await db.exec('reset role');await db.query("update pm_permit_runs set lease_expires_at=now()-interval '1 second' where id=$1",[run.id]);await db.query("update pm_permit_monitors set next_check_at=now()-interval '1 second' where project_id=$1",[pid]);await asUser(ids.admin);
    await expect(complete(run,[],'error')).rejects.toThrow(/expired/);const next=await claim(pid);expect(next.id).not.toBe(run.id);
    expect((await db.query<any>('select status from pm_permit_runs where id=$1',[run.id])).rows[0].status).toBe('interrupted');
  });
  it('enforces same-property hierarchy, unique identity and child closure',async()=>{
    const pid=await project(),master=await rpc('pm_save_record',[ids.workspace,permit(pid),null]),child=permit(pid);child.data={...child.data,permit_type:'Subpermit',parent_permit_id:master.id};
    await rpc('pm_save_record',[ids.workspace,child,null]);await expect(rpc('pm_save_record',[ids.workspace,{...master,status:'Closed'},1])).rejects.toThrow(/open subpermits/);
    await expect(rpc('pm_save_record',[ids.workspace,{...master,id:crypto.randomUUID()},null])).rejects.toThrow(/duplicate/);
    const other=await project();await expect(rpc('pm_save_record',[ids.workspace,{...child,id:crypto.randomUUID(),project_id:other},null])).rejects.toThrow(/same property/);
  });
  it('requires full open-permit coverage and refuses false no-permits reports',async()=>{
    const pid=await project(),existing=await rpc('pm_save_record',[ids.workspace,permit(pid),null]),run=await claim(pid);
    await expect(complete(run,[],'no_permits')).rejects.toThrow(/Known permits/);
    await expect(complete(run,[permit(pid)])).rejects.toThrow(/every open permit/);
    expect((await complete(run,[],'partial')).status).toBe('partial');
  });
  it('protects manual corrections and older observations; requires evidence and timestamps',async()=>{
    const pid=await project(),original=permit(pid);original.data.automation_paused=true;const saved=await rpc('pm_save_record',[ids.workspace,original,null]),run=await claim(pid);
    await expect(complete(run,[saved])).rejects.toThrow(/protects/);
    const unlocked=await rpc('pm_save_record',[ids.workspace,{...saved,data:{...saved.data,automation_paused:false}},saved.version]);
    await expect(complete(run,[{...unlocked,data:{...unlocked.data,source_observed_at:'2020-01-01T00:00:00Z'}}])).rejects.toThrow(/older/);
    await expect(complete(run,[{...unlocked,data:{...unlocked.data,evidence:''}}])).rejects.toThrow(/evidence/);
    await expect(complete(run,[{...unlocked,data:{...unlocked.data,source_observed_at:null}}])).rejects.toThrow(/timestamp/);
  });
  it('uses permits as work prerequisites without accepting approved-but-unissued permits',async()=>{
    const pid=await project(),original=permit(pid,{status:'Approved'}),saved=await rpc('pm_save_record',[ids.workspace,original,null]);
    const task=record('Start work',{project_id:pid,status:'Ready',data:{prerequisite_ids:[saved.id]}});
    await expect(rpc('pm_save_record',[ids.workspace,task,null])).rejects.toThrow(/prerequisite/);
    await rpc('pm_save_record',[ids.workspace,{...saved,status:'Issued'},saved.version]);expect((await rpc('pm_save_record',[ids.workspace,task,null])).status).toBe('Ready');
  });
});
