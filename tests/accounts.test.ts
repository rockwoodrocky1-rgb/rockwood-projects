import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { authMessage, recoveryRequested } from '../lib/auth';
import { authenticatedUser, endpoint } from '../lib/server';

const target = '80c3b3e9-025c-45e1-81fd-bfdbd2f56be2';
const other = '55555555-5555-4555-8555-555555555555';
const newcomer = '11111111-1111-4111-8111-111111111111';
const reader = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
async function asUser(id: string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); }
async function join() { return (await db.query<{ result: { role: string; workspace_id: string; user_id: string } }>('select pm_join_open_workspace() as result')).rows[0].result; }

describe('self-service workspace enrollment', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of ['202610130001_pm.sql', '202610130002_conflict_http_status.sql', '202610150001_permit_monitoring.sql']) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await db.query('insert into pm_workspaces(id,name) values($1,$2),($3,$4)', [target, 'Rockwood', other, 'Separate team']);
    await db.query('insert into auth.users values($1),($2),($3)', [newcomer, reader, admin]);
    await db.query("insert into pm_members(workspace_id,user_id,role) values($1,$2,'reader'),($1,$3,'admin')", [target, reader, admin]);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610150002_self_service_accounts.sql', import.meta.url), 'utf8'));
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it('joins the configured workspace, enables real saves, and audits enrollment once', async () => {
    await asUser(newcomer);
    expect((await db.query('select * from pm_workspaces')).rows).toHaveLength(0);
    expect(await join()).toMatchObject({ role: 'manager', workspace_id: target, user_id: newcomer });
    expect(await join()).toMatchObject({ role: 'manager' });
    expect((await db.query('select id from pm_workspaces')).rows).toEqual([{ id: target }]);
    const saved = await db.query<{ result: { name: string } }>('select pm_create_project($1,$2,$3) as result', [target, { name: 'New member project' }, []]);
    expect(saved.rows[0].result.name).toBe('New member project');
    expect((await db.query("select * from pm_audit where action='join'")).rows).toHaveLength(1);
    await expect(db.query('select pm_create_project($1,$2,$3)', [other, { name: 'Wrong workspace' }, []])).rejects.toThrow(/cannot change/);
  });
  it('preserves reader and administrator roles, with no role escalation through retries', async () => {
    await asUser(reader); expect((await join()).role).toBe('reader');
    await expect(db.query('select pm_create_project($1,$2,$3)', [target, { name: 'No access' }, []])).rejects.toThrow(/cannot change/);
    await asUser(admin); expect((await join()).role).toBe('admin');
    expect((await db.query("select * from pm_audit where action='join'")).rows).toHaveLength(1);
  });
  it('rejects anonymous enrollment and direct membership/configuration mutations', async () => {
    await asUser(''); await expect(join()).rejects.toThrow(/sign in/);
    await db.exec('reset role; set role anon'); await expect(join()).rejects.toThrow(/permission denied/);
    await asUser(newcomer);
    await expect(db.exec("update pm_members set role='admin'")).rejects.toThrow(/permission denied/);
    await expect(db.exec('update pm_registration set enabled=false')).rejects.toThrow(/permission denied/);
    await expect(db.exec('select * from pm_registration')).rejects.toThrow(/permission denied/);
  });
  it('fails closed when registration is disabled or unconfigured without revoking existing access', async () => {
    await db.exec('reset role; update pm_registration set enabled=false');
    await asUser(newcomer); await expect(join()).rejects.toThrow(/not enabled/);
    expect((await db.query('select * from pm_projects')).rows).toHaveLength(1);
    await db.exec('reset role; delete from pm_registration');
    await asUser(newcomer); await expect(join()).rejects.toThrow(/not enabled/);
  });
});

it('keeps recovery links in the password form and explains authentication failures', () => {
  expect(recoveryRequested('?recovery=1', '')).toBe(true);
  expect(recoveryRequested('', '#type=recovery&access_token=fixture')).toBe(true);
  expect(recoveryRequested('', '#type=signup')).toBe(false);
  expect(authMessage({ code: 'signup_disabled' })).toContain('not enabled');
  expect(authMessage({ code: 'invalid_credentials' })).toContain('Forgot password');
});

it('requires a bearer token before account enrollment and returns no-store errors', async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture';
  try {
    const response = await endpoint(async () => { await authenticatedUser(new Request('https://test.invalid/api/account/join', { method: 'POST' })); return new Response(); });
    expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
  } finally {
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  }
});
