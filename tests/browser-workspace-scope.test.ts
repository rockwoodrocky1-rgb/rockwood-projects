import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) } }) }));
import { request } from '../lib/client';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('preserves the explicitly selected workspace when following a Cam handoff', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  vi.stubGlobal('window', { location: { search: '?workspace=chosen-workspace&view=cam' } });
  const fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => Response.json({ projects: [] })); vi.stubGlobal('fetch', fetch);
  await request('/api/bootstrap');
  const headers = new Headers(fetch.mock.calls[0][1]?.headers);
  expect(headers.get('x-workspace-id')).toBe('chosen-workspace');
  expect(headers.get('Authorization')).toBe('Bearer user-token');
});
it('keeps an action’s explicit workspace instead of replacing it with page scope', async () => {
  vi.stubGlobal('window', { location: { search: '?workspace=page-workspace' } });
  const fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => Response.json({ visits: [] })); vi.stubGlobal('fetch', fetch);
  await request('/api/cam/visits', { headers: { 'x-workspace-id': 'action-workspace' } });
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('x-workspace-id')).toBe('action-workspace');
});
