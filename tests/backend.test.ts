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

describe('database security and atomic work operations', () => {
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
    await db.query('insert into auth.users values($1),($2),($3)', [ids.admin, ids.reader, ids.outsider]);
    await db.query('insert into public.pm_workspaces(id,name) values($1,$2),($3,$4)', [ids.workspace, 'Main', ids.otherWorkspace, 'Other']);
    await db.query("insert into public.pm_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'reader'),($4,$5,'admin')", [ids.workspace, ids.admin, ids.reader, ids.otherWorkspace, ids.outsider]);
    await asUser(ids.admin);
    await rpc('pm_create_project', [ids.workspace, { id: ids.project, name: 'Real project' }, []]);
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it('creates the complete customer template atomically with resolved links', async () => {
    await asUser(ids.admin);
    const id = crypto.randomUUID(), template = createProjectRecords(id, {});
    await rpc('pm_create_project', [ids.workspace, { id, name: 'Template proof' }, template]);
    const saved = await db.query<{ count: number }>('select count(*)::int as count from pm_records where project_id=$1', [id]);
    expect(saved.rows[0].count).toBe(template.length);
    const badId = crypto.randomUUID();
    await expect(rpc('pm_create_project', [ids.workspace, { id: badId, name: 'Must roll back' }, [{ ...record('Bad relation'), data: { check_ids: [crypto.randomUUID()] } }]])).rejects.toThrow();
    expect((await db.query('select id from pm_projects where id=$1', [badId])).rows).toHaveLength(0);
  });
  it('uses RLS and refuses reader/outsider writes and raw table writes', async () => {
    await asUser(ids.reader);
    expect((await db.query('select * from pm_projects')).rows.length).toBeGreaterThan(0);
    await expect(rpc('pm_save_record', [ids.workspace, record('Reader mutation'), null])).rejects.toThrow(/cannot change/);
    await expect(db.query('insert into pm_projects(workspace_id,name) values($1,$2)', [ids.workspace, 'Bypass'])).rejects.toThrow(/permission denied/);
    await asUser(ids.outsider);
    expect((await db.query('select * from pm_projects')).rows).toHaveLength(0);
    await expect(rpc('pm_save_record', [ids.workspace, record('Outsider mutation'), null])).rejects.toThrow(/cannot change/);
  });
  it('checks versions and writes immutable before/after audit snapshots', async () => {
    await asUser(ids.admin);
    const item = await rpc('pm_save_record', [ids.workspace, record('Original title'), null]);
    const changed = await rpc('pm_save_record', [ids.workspace, { ...item, title: 'Updated title' }, 1]);
    expect(changed.version).toBe(2);
    await expect(rpc('pm_save_record', [ids.workspace, { ...item, title: 'Stale overwrite' }, 1])).rejects.toThrow(/changed/);
    const events = (await db.query<{ before_data: any; after_data: any }>("select before_data,after_data from pm_audit where record_id=$1 and action='update'", [item.id])).rows;
    expect(events[0].before_data.title).toBe('Original title'); expect(events[0].after_data.title).toBe('Updated title');
  });
  it('rolls back imports on duplicates, invalid dates and numeric data', async () => {
    await asUser(ids.admin);
    const first = record('Import duplicate');
    await expect(rpc('pm_import_records', [ids.workspace, ids.project, 'task', [first, first]])).rejects.toThrow(/already exists/);
    expect((await db.query('select * from pm_records where title=$1', [first.title])).rows).toHaveLength(0);
    await expect(rpc('pm_save_record', [ids.workspace, record('Impossible date', { due_date: '2026-02-30' }), null])).rejects.toThrow();
    await expect(rpc('pm_save_record', [ids.workspace, record('Bad price', { kind: 'bid', status: 'Received', data: { labor_cost: -4 } }), null])).rejects.toThrow(/negative/);
    expect(await rpc('pm_import_records', [ids.workspace, ids.project, 'bid', [{ kind: 'bid', title: 'Plumber price', status: 'Received', data: { labor_cost: 100, material_cost: 50 } }]])).toBe(1);
  });
  it('enforces check evidence, linked gates, source preservation and cycles', async () => {
    await asUser(ids.admin);
    const check = await rpc('pm_save_record', [ids.workspace, record('Plumbing check', { kind: 'check', status: 'Waiting', data: { applicability: 'Required' } }), null]);
    const task = await rpc('pm_save_record', [ids.workspace, record('Inspection task', { data: { source_id: 'test', check_ids: [check.id] } }), null]);
    await expect(rpc('pm_save_record', [ids.workspace, { ...task, status: 'Done' }, task.version])).rejects.toThrow(/checks/);
    await expect(rpc('pm_save_record', [ids.workspace, { ...check, status: 'Passed' }, check.version])).rejects.toThrow(/needs/);
    const passed = await rpc('pm_save_record', [ids.workspace, { ...check, status: 'Passed', data: { ...check.data, result_date: '2026-10-13', inspector: 'Example inspector', evidence: 'Recorded result #1' } }, check.version]);
    const done = await rpc('pm_save_record', [ids.workspace, { ...task, status: 'Done' }, task.version]);
    await rpc('pm_save_record', [ids.workspace, { ...passed, status: 'Failed' }, passed.version]);
    await expect(rpc('pm_save_record', [ids.workspace, record('Drywall start', { status: 'Ready', data: { prerequisite_ids: [done.id] } }), null])).rejects.toThrow(/prerequisites/);
    await expect(rpc('pm_save_record', [ids.workspace, { ...done, data: { ...done.data, check_ids: [] } }, done.version])).rejects.toThrow(/original customer/);
    const a = await rpc('pm_save_record', [ids.workspace, record('Dependency A'), null]);
    const b = await rpc('pm_save_record', [ids.workspace, record('Dependency B', { data: { prerequisite_ids: [a.id] } }), null]);
    await expect(rpc('pm_save_record', [ids.workspace, { ...a, data: { prerequisite_ids: [b.id] } }, a.version])).rejects.toThrow(/cycle/);
  });
  it('requires clearance and certificate application before issuance', async () => {
    await asUser(ids.admin);
    const projectId = crypto.randomUUID();
    await rpc('pm_create_project', [ids.workspace, { id: projectId, name: 'Certificate flow' }, []]);
    const application = await rpc('pm_save_record', [ids.workspace, record('Certificate application', { project_id: projectId, kind: 'check', status: 'Waiting', data: { check_type: 'Certificate application', applicability: 'Required' } }), null]);
    const issuance = await rpc('pm_save_record', [ids.workspace, record('Certificate issuance', { project_id: projectId, kind: 'check', status: 'Waiting', data: { check_type: 'Certificate issuance', applicability: 'Required', prerequisite_ids: [application.id] } }), null]);
    const passedData = { result_date: '2026-10-13', inspector: 'Official', evidence: 'Municipal record' };
    await expect(rpc('pm_save_record', [ids.workspace, { ...issuance, status: 'Passed', data: { ...issuance.data, ...passedData } }, 1])).rejects.toThrow(/prerequisite/);
    const hold = await rpc('pm_save_record', [ids.workspace, record('Fee hold', { project_id: projectId, kind: 'hold', status: 'Open' }), null]);
    await expect(rpc('pm_save_record', [ids.workspace, { ...application, status: 'Passed', data: { ...application.data, ...passedData } }, 1])).rejects.toThrow(/holds/);
    await rpc('pm_save_record', [ids.workspace, { ...hold, status: 'Cleared', data: { resolution: 'Paid fee', cleared_date: '2026-10-13' } }, 1]);
    await rpc('pm_save_record', [ids.workspace, { ...application, status: 'Passed', data: { ...application.data, ...passedData } }, 1]);
    expect((await rpc('pm_save_record', [ids.workspace, { ...issuance, status: 'Passed', data: { ...issuance.data, ...passedData } }, 1])).status).toBe('Passed');
  });
  it('rejects invalid workflow flags through direct RPC calls', async () => {
    await asUser(ids.admin);
    for (const data of [{ applicability: 'skip' }, { reminder_mode: 'Daily' }, { priority: 'urgent' }, { phase: 1.5 }, { inspection_required: 'false' }]) {
      await expect(rpc('pm_save_record', [ids.workspace, record('Invalid flags', { data }), null])).rejects.toThrow();
    }
  });
  it('enforces workspace and role boundaries on private Storage paths', async () => {
    const path = `${ids.workspace}/shared/${crypto.randomUUID()}.pdf`;
    await asUser(ids.admin); await db.query("insert into storage.objects(bucket_id,name) values('pm-documents',$1)", [path]);
    await asUser(ids.reader); expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('pm-documents',$1)", [path + '.pdf'])).rejects.toThrow(/row-level security/);
    await asUser(ids.outsider); expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
});

describe('API file and relation boundaries', () => {
  it('rejects unsafe names, mismatched file signatures and traversal', () => {
    expect(() => fileInfo('../../file.pdf', 10)).toThrow(); expect(() => fileInfo('bad.html', 100)).toThrow(); expect(() => fileInfo('good.pdf', 21 * 1024 * 1024)).toThrow();
    expect(() => validateFileBytes(new TextEncoder().encode('<html>not a PDF</html>'), 'pdf')).toThrow();
    expect(safeStoragePath(`${ids.workspace}/../a.pdf`, ids.workspace)).toBe(false);
    expect(safeStoragePath(`${ids.otherWorkspace}/shared/${crypto.randomUUID()}.pdf`, ids.workspace)).toBe(false);
    expect(safeStoragePath(`${ids.workspace}/shared/${crypto.randomUUID()}.pdf`, ids.workspace, null)).toBe(true);
  });
  it('rejects cross-project links even in the same workspace', () => {
    expect(() => validateRelationships(record('Linked', { data: { check_ids: [ids.reader] } }), [{ id: ids.reader, workspace_id: ids.workspace, project_id: crypto.randomUUID(), kind: 'check' } as any], ids.workspace)).toThrow(/project/);
  });
});
