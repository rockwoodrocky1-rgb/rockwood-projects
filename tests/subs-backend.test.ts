import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ids = { admin: '11111111-1111-4111-8111-111111111111', reader: '22222222-2222-4222-8222-222222222222', outsider: '33333333-3333-4333-8333-333333333333', workspace: '44444444-4444-4444-8444-444444444444', otherWorkspace: '55555555-5555-4555-8555-555555555555', project: '66666666-6666-4666-8666-666666666666', otherProject: '77777777-7777-4777-8777-777777777777' };
let db: PGlite;
async function asUser(user: string) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated'); }
async function rpc(name: string, params: unknown[]) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query<{ result: any }>(`select public.${name}(${placeholders}) as result`, params)).rows[0].result;
}
const migration = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const record = (title: string, extra: any = {}) => ({ kind: 'task', title, status: 'Waiting', project_id: ids.project, data: {}, ...extra });
const contact = (title: string, extra: any = {}) => record(title, { kind: 'contact', status: 'Active', project_id: null, ...extra });
const refused = (message: RegExp) => ({ code: '23514', message: expect.stringMatching(message) });

describe('database check for other subs on a job', () => {
  let legacy: any, shared: any, projectContact: any, otherProjectContact: any, task: any, foreign: any, crew: string[];
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of ['202610130001_pm.sql', '202610130002_conflict_http_status.sql', '202610150001_permit_monitoring.sql']) await db.exec(migration(file));
    await db.query('insert into auth.users values($1),($2),($3)', [ids.admin, ids.reader, ids.outsider]);
    await db.query('insert into public.pm_workspaces(id,name) values($1,$2),($3,$4)', [ids.workspace, 'Main', ids.otherWorkspace, 'Other']);
    await db.query("insert into public.pm_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'reader'),($4,$5,'admin')", [ids.workspace, ids.admin, ids.reader, ids.otherWorkspace, ids.outsider]);
    await asUser(ids.outsider);
    foreign = await rpc('pm_save_record', [ids.otherWorkspace, contact('Other company crew'), null]);
    await asUser(ids.admin);
    await rpc('pm_create_project', [ids.workspace, { id: ids.project, name: 'Real project' }, []]);
    await rpc('pm_create_project', [ids.workspace, { id: ids.otherProject, name: 'Another job' }, []]);
    shared = await rpc('pm_save_record', [ids.workspace, contact('Cesar framing'), null]);
    projectContact = await rpc('pm_save_record', [ids.workspace, contact('Ricardo electric', { project_id: ids.project }), null]);
    otherProjectContact = await rpc('pm_save_record', [ids.workspace, contact('Luis drywall', { project_id: ids.otherProject }), null]);
    task = await rpc('pm_save_record', [ids.workspace, record('Not a person'), null]);
    await rpc('pm_import_records', [ids.workspace, null, 'contact', Array.from({ length: 21 }, (_, i) => contact(`Crew member ${i + 1}`))]);
    crew = (await db.query<{ id: string }>("select id from pm_records where workspace_id=$1 and title like 'Crew member %' order by title", [ids.workspace])).rows.map(r => r.id);
    // Before this migration the database stored any ID in the list.
    legacy = await rpc('pm_save_record', [ids.workspace, record('Saved before the check', { data: { contractor_id: shared.id, other_contractor_ids: [task.id] } }), null]);
    await db.exec('reset role');
    await db.exec(migration('202610170001_other_subs_check.sql'));
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it('accepts workspace contacts from any project, an empty list and no list', async () => {
    await asUser(ids.admin);
    const subs = [projectContact.id, otherProjectContact.id, shared.id];
    const job = await rpc('pm_save_record', [ids.workspace, record('Trusses measurement', { data: { contractor_id: shared.id, other_contractor_ids: subs } }), null]);
    expect(job.data.other_contractor_ids).toEqual(subs);
    const changed = await rpc('pm_save_record', [ids.workspace, { ...job, data: { ...job.data, other_contractor_ids: [projectContact.id] } }, job.version]);
    expect(changed.data.other_contractor_ids).toEqual([projectContact.id]);
    for (const data of [{ other_contractor_ids: [] }, { other_contractor_ids: null }, {}]) {
      expect((await rpc('pm_save_record', [ids.workspace, record('Sub list optional', { data }), null])).data).toEqual(data);
    }
  });
  it('refuses a non-contact, a contact from another workspace and unknown IDs', async () => {
    await asUser(ids.admin);
    for (const bad of [task.id, foreign.id, crypto.randomUUID()]) {
      await expect(rpc('pm_save_record', [ids.workspace, record('Bad sub', { data: { other_contractor_ids: [shared.id, bad] } }), null])).rejects.toMatchObject(refused(/contact in this workspace for each sub/));
    }
    for (const bad of [['Ricardo'], [42], [null]]) {
      await expect(rpc('pm_save_record', [ids.workspace, record('Bad sub ID', { data: { other_contractor_ids: bad } }), null])).rejects.toMatchObject(refused(/Invalid related record identifier/));
    }
    for (const bad of ['Ricardo', shared.id, { id: shared.id }]) {
      await expect(rpc('pm_save_record', [ids.workspace, record('Not a list', { data: { other_contractor_ids: bad } }), null])).rejects.toMatchObject(refused(/must be an array/));
    }
    expect((await db.query("select id from pm_records where title in ('Bad sub','Bad sub ID','Not a list')")).rows).toHaveLength(0);
  });
  it('allows 20 other subs and refuses 21', async () => {
    await asUser(ids.admin);
    expect((await rpc('pm_save_record', [ids.workspace, record('Full crew', { data: { other_contractor_ids: crew.slice(0, 20) } }), null])).data.other_contractor_ids).toHaveLength(20);
    await expect(rpc('pm_save_record', [ids.workspace, record('Too many subs', { data: { other_contractor_ids: crew } }), null])).rejects.toMatchObject(refused(/at most 20/));
  });
  it('applies to imports and project templates, rolling back the whole write', async () => {
    await asUser(ids.admin);
    await expect(rpc('pm_import_records', [ids.workspace, ids.project, 'task', [record('Import ok'), record('Import bad', { data: { other_contractor_ids: [task.id] } })]])).rejects.toMatchObject(refused(/for each sub/));
    expect((await db.query("select id from pm_records where title like 'Import %'")).rows).toHaveLength(0);
    const projectId = crypto.randomUUID();
    await expect(rpc('pm_create_project', [ids.workspace, { id: projectId, name: 'Must roll back' }, [record('Template bad', { data: { other_contractor_ids: [foreign.id] } })]])).rejects.toMatchObject(refused(/for each sub/));
    expect((await db.query('select id from pm_projects where id=$1', [projectId])).rows).toHaveLength(0);
  });
  it('keeps rows saved before the migration; their next save must fix the list', async () => {
    await asUser(ids.admin);
    expect((await db.query<any>('select data from pm_records where id=$1', [legacy.id])).rows[0].data.other_contractor_ids).toEqual([task.id]);
    await expect(rpc('pm_save_record', [ids.workspace, { ...legacy, title: 'Renamed' }, legacy.version])).rejects.toMatchObject(refused(/for each sub/));
    const fixed = await rpc('pm_save_record', [ids.workspace, { ...legacy, data: { ...legacy.data, other_contractor_ids: [projectContact.id] } }, legacy.version]);
    expect(fixed).toMatchObject({ version: 2, data: { contractor_id: shared.id, other_contractor_ids: [projectContact.id] } });
  });
});
