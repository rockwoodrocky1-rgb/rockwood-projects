import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', reader = '22222222-2222-4222-8222-222222222222', outsider = '33333333-3333-4333-8333-333333333333';
const workspace = '44444444-4444-4444-8444-444444444444', property = '55555555-5555-4555-8555-555555555555';
const visitId = '66666666-6666-4666-8666-666666666666';
const source = { id: visitId, project_id: property, started_at: '2026-10-15T15:00:00Z', payload: { status: 'saved', notes: 'Shower needs caulking.', duration: 0, mime: '', photos: [] } };
async function asUser(id: string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); }
async function save(input: any = source, revision = 0) {
  return (await db.query<{ row: any }>('select public.cam_save_visit($1,$2,$3) as row', [workspace, input, revision])).rows[0].row;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated,anon,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2),($3)', [owner, reader, outsider]);
  await db.query('insert into pm_workspaces(id,name) values($1,$2)', [workspace, 'Rockwood']);
  await db.query("insert into pm_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'reader')", [workspace, owner, reader]);
  await asUser(owner);
  await db.query('select pm_create_project($1,$2,$3)', [workspace, { id: property, name: 'Actual property', locations: ['Bathroom'] }, []]);
}, 30000);
afterAll(() => db.close());

describe('Cam uses workspace properties and preserves evidence', () => {
  it('mirrors real IDs and saves one visit and audit entry atomically; retries do not duplicate', async () => {
    await asUser(owner);
    expect((await db.query('select id from projects')).rows).toEqual([{ id: property }]);
    const first = await save(); const replay = await save();
    expect(replay.id).toBe(first.id); expect(replay.revision).toBe(1);
    expect((await db.query('select project_id,status from pm_cam_visits')).rows).toEqual([{ project_id: property, status: 'received' }]);
    expect((await db.query("select * from pm_audit where action='cam_visit'")).rows).toHaveLength(1);
  });
  it('rejects reader/outsider mutation, raw writes and unconfigured field enrollment', async () => {
    await asUser(reader);
    expect((await db.query('select * from pm_cam_visits')).rows).toHaveLength(1);
    await expect(save()).rejects.toThrow(/cannot record/);
    await expect(db.query("update walkthroughs set payload='{}'")).rejects.toThrow(/permission denied/);
    await expect(db.query("select register_field_contact('Bad','13055550123')")).rejects.toThrow(/not enabled/);
    await asUser(outsider);
    expect((await db.query('select * from pm_cam_visits')).rows).toHaveLength(0);
    expect((await db.query('select * from walkthroughs')).rows).toHaveLength(0);
    await expect(save()).rejects.toThrow(/cannot record/);
  });
  it('rejects invented properties, foreign evidence and stale overwrites', async () => {
    await asUser(owner);
    await expect(save({ ...source, id: crypto.randomUUID(), project_id: crypto.randomUUID() })).rejects.toThrow(/active workspace property/);
    const foreignAudio = { ...source, payload: { ...source.payload, audio: { path: `${workspace}/${outsider}/${visitId}/audio`, size: 10 } } };
    await expect(save(foreignAudio, 1)).rejects.toThrow(/Invalid audio path/);
    const changed = { ...source, payload: { ...source.payload, notes: 'Human correction' } };
    expect((await save(changed, 1)).revision).toBe(2);
    await expect(save(source, 1)).rejects.toThrow(/changed/);
  });
  it('publishes the generated report to the property and queues its PDF without changing tasks', async () => {
    await asUser(owner);
    const jobId = (await db.query<{ id: string }>('select enqueue_report_processing($1,$2) as id', [workspace, visitId])).rows[0].id;
    await db.exec('reset role; set role service_role');
    const job = (await db.query<{ lease_token: string }>('select * from claim_report_processing($1)', [jobId])).rows[0];
    await db.query('select complete_report_processing($1,$2,$3,$4)', [jobId, job.lease_token, { source: 'manual', text: '', segments: [] }, { summary: 'Caulking needs review.', observations: [], actionItems: [], captions: [] }]);
    await asUser(owner);
    const inbox = (await db.query<{ status: string; summary: string }>('select status,summary from pm_cam_visits')).rows[0];
    expect(inbox).toEqual({ status: 'ready_for_review', summary: 'Caulking needs review.' });
    expect((await db.query('select id from report_deliveries')).rows).toHaveLength(1);
    expect((await db.query('select * from pm_records')).rows).toHaveLength(0);
  });
  it('accepts a manager adding media to another author’s visit and rejects different-visit media', async () => {
    await db.exec('reset role; begin');
    try {
      await db.query("insert into pm_members(workspace_id,user_id,role) values($1,$2,'manager')", [workspace, outsider]);
      await asUser(outsider);
      const current = (await db.query<{ payload: any; revision: number }>('select payload,revision from walkthroughs where id=$1', [visitId])).rows[0];
      const path = `${workspace}/${outsider}/${visitId}/new-photo`;
      await db.query("insert into storage.objects(bucket_id,name) values('walkthrough-media',$1)", [path]);
      const input = { ...source, payload: { ...current.payload, audio: { path, size: 10 } } };
      const updated = await save(input, current.revision);
      expect(updated.created_by).toBe(owner);
      expect(updated.payload.audio.path).toBe(path);
      const otherPath = `${workspace}/${outsider}/another-visit/photo`;
      await db.query("insert into storage.objects(bucket_id,name) values('walkthrough-media',$1)", [otherPath]);
      await expect(save({ ...input, payload: { ...input.payload, audio: { path: otherPath, size: 10 } } }, updated.revision)).rejects.toThrow(/Invalid audio path/);
    } finally { await db.exec('rollback; reset role'); }
  });
  it('charges AI budgets to the requested workspace and denies outsider scope', async () => {
    await asUser(owner);
    expect((await db.query<{ ok: boolean }>('select consume_cam_ai_budget($1) as ok', [workspace])).rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>('select consume_cam_ai_budget($1) as ok', [crypto.randomUUID()])).rows[0].ok).toBe(false);
    await expect(db.query('select consume_field_ai_budget()')).rejects.toThrow(/permission denied/);
  });
  it('revokes Cam access when workspace membership is removed', async () => {
    await db.exec('reset role');
    await db.query('delete from pm_members where workspace_id=$1 and user_id=$2', [workspace, reader]);
    await asUser(reader);
    expect((await db.query('select * from walkthroughs')).rows).toHaveLength(0);
    expect((await db.query('select * from pm_cam_visits')).rows).toHaveLength(0);
  });
});

const guest = '77777777-7777-4777-8777-777777777777';
const secondGuest = '88888888-8888-4888-8888-888888888888';
const guestVisit = 'field-visit-one';
const fieldSource = { ...source, id: guestVisit, payload: { ...source.payload, participant: { name: 'Forged name', phone: '19999999999' } } };
describe('name and phone capture without a workspace account', () => {
  it('enrolls a field session with only contributor access and validates attribution', async () => {
    await db.exec('reset role');
    await db.query('insert into auth.users(id,is_anonymous) values($1,true),($2,true)', [guest, secondGuest]);
    await db.query('insert into pm_cam_registration(workspace_id,enabled) values($1,true)', [workspace]);
    await db.query('insert into pm_registration(workspace_id,enabled) values($1,true)', [workspace]);
    await asUser(guest);
    await expect(db.query("select register_field_contact(null,'13055550123')")).rejects.toThrow(/name and phone/);
    await expect(db.query("select register_field_contact('Field Person','bad')")).rejects.toThrow(/name and phone/);
    await db.query("select register_field_contact('Field Person','13055550123')");
    await db.query("select register_field_contact('Field Person','13055550123')");
    expect((await db.query('select role from workspace_members')).rows).toEqual([{ role: 'contributor' }]);
    expect((await db.query('select * from pm_members')).rows).toEqual([]);
    expect((await db.query('select * from pm_projects')).rows).toEqual([]);
    expect((await db.query('select * from pm_records')).rows).toEqual([]);
    await expect(db.query('select pm_join_open_workspace()')).rejects.toThrow(/workspace account/);
    await expect(db.query('select pm_create_project($1,$2,$3)', [workspace, { name: 'Not allowed' }, []])).rejects.toThrow(/cannot change/);
    const choices = (await db.query<{ result: any[] }>('select cam_property_choices($1) as result', [workspace])).rows[0].result;
    expect(choices).toHaveLength(1); expect(choices[0]).toMatchObject({ id: property, name: 'Actual property' });
    expect(Object.keys(choices[0]).sort()).toEqual(['address','areas','id','image','name','number','stage','type']);
    await expect(db.query('select cam_property_choices($1)', [crypto.randomUUID()])).rejects.toThrow(/name and phone/);
  });
  it('saves and replays a stamped visit; rejects cross-author writes and forged evidence', async () => {
    await asUser(guest);
    const row = await save(fieldSource);
    expect(row.created_by).toBe(guest);
    expect(row.payload.participant).toEqual({ name: 'Field Person', phone: '13055550123' });
    expect((await save(fieldSource)).revision).toBe(1);
    await expect(save(source, 3)).rejects.toThrow(/only change your own/);
    await expect(db.query('select cam_archive_visit($1,$2,$3)', [workspace, visitId, 3])).rejects.toThrow(/changed/);
    expect((await db.query('select id from walkthroughs')).rows).toEqual([{ id: guestVisit }]);
    expect((await db.query('select * from pm_cam_visits')).rows).toEqual([]);
    const ownedPath = `${workspace}/${guest}/${guestVisit}/audio`;
    await db.query("insert into storage.objects(bucket_id,name) values('walkthrough-media',$1)", [ownedPath]);
    const updated = { ...fieldSource, payload: { ...fieldSource.payload, notes: 'Updated source', audio: { path: ownedPath, size: 10, type: 'audio/webm' } } };
    expect((await save(updated,1)).revision).toBe(2);
    await db.query("select register_field_contact('Changed Person','13055550124')");
    const changed = await save({ ...updated, payload: { ...updated.payload, notes: 'Corrected note' } },2);
    expect(changed.payload.participant.name).toBe('Field Person');
    await expect(save(updated,1)).rejects.toThrow(/changed/);
    await asUser(secondGuest);
    await db.query("select register_field_contact('Second Person','13055550125')");
    expect((await db.query('select * from walkthroughs')).rows).toEqual([]);
    expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    await expect(save(updated,3)).rejects.toThrow(/only change your own/);
    await expect(save({ ...updated, id: 'second-visit' })).rejects.toThrow(/Invalid audio path/);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('walkthrough-media',$1)",[ownedPath+'/bad'])).rejects.toThrow(/row-level security/);
    await expect(db.query("update walkthroughs set payload='{}'")).rejects.toThrow(/permission denied/);
  });
  it('queues the field visit once, completes a report, and publishes to the property inbox', async () => {
    await asUser(guest);
    const jobId = (await db.query<{ id: string }>('select enqueue_report_processing($1,$2) as id', [workspace,guestVisit])).rows[0].id;
    expect((await db.query<{ id: string }>('select enqueue_report_processing($1,$2) as id', [workspace,guestVisit])).rows[0].id).toBe(jobId);
    expect((await db.query('select id from processing_jobs')).rows).toHaveLength(1);
    await asUser(secondGuest);
    expect((await db.query('select id from processing_jobs')).rows).toHaveLength(0);
    await expect(db.query('select enqueue_report_processing($1,$2)', [workspace,guestVisit])).rejects.toThrow(/visit author/);
    await db.exec('reset role; set role service_role');
    const lease = (await db.query<{ lease_token: string }>('select * from claim_report_processing($1)', [jobId])).rows[0];
    await db.query('select complete_report_processing($1,$2,$3,$4)', [jobId,lease.lease_token,{source:'audio',text:'Field notes',segments:[]},{summary:'Field report',observations:[],actionItems:[],captions:[]}]);
    await asUser(guest);
    const saved = (await db.query<{ payload: any }>('select payload from walkthroughs where id=$1',[guestVisit])).rows[0];
    expect(saved.payload.participant.name).toBe('Field Person');
    expect(saved.payload.report.summary).toBe('Field report');
    expect((await db.query('select id from report_deliveries')).rows).toHaveLength(1);
    await asUser(secondGuest);
    expect((await db.query('select id from report_deliveries')).rows).toHaveLength(0);
    await asUser(owner);
    expect((await db.query('select status,summary from pm_cam_visits where visit_id=$1',[guestVisit])).rows).toEqual([{status:'ready_for_review',summary:'Field report'}]);
    expect((await db.query("select id from pm_audit where action='cam_visit' and actor_id=$1",[guest])).rows.length).toBeGreaterThan(0);
    expect((await db.query('select id from pm_records')).rows).toEqual([]);
  });
  it('keeps workspace account signup working and honors field-entry disablement', async () => {
    await db.exec('reset role');
    await db.query('update auth.users set is_anonymous=false where id=$1',[outsider]);
    await asUser(outsider);
    expect((await db.query<{ member: any }>('select pm_join_open_workspace() as member')).rows[0].member.role).toBe('manager');
    await db.exec('reset role; update pm_cam_registration set enabled=false');
    await asUser(secondGuest);
    await expect(db.query("select register_field_contact('Second Person','13055550125')")).rejects.toThrow(/not enabled/);
    await expect(save({ ...fieldSource, id: 'disabled-entry' })).rejects.toThrow(/cannot record/);
    expect((await db.query<{ ok: boolean }>('select consume_cam_ai_budget($1) as ok',[workspace])).rows[0].ok).toBe(false);
  });
});
