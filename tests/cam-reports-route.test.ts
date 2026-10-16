import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspace = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const fixture = vi.hoisted(() => ({ member: true, validToken: true, tables: [] as string[], filters: [] as any[], reports: [] as any[] }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: fixture.validToken ? { id: 'test-user' } : null }, error: null }) },
  from: (table: string) => {
    fixture.tables.push(table);
    const conditions: any[] = []; let range = [0, 49];
    const query: any = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: any) => { conditions.push([key, value]); fixture.filters.push([table, key, value]); return query; },
      gte: (key: string, value: string) => { fixture.filters.push([table, key, value]); return query; },
      range: (start: number, end: number) => { range = [start, end]; return query; },
      maybeSingle: async () => ({ data: fixture.member && conditions.every(([key, value]) => key !== 'workspace_id' || value === workspace) ? { workspace_id: workspace, role: 'reader' } : null, error: null }),
      single: async () => ({ data: { id: workspace, name: 'Example' }, error: null }),
      then: (resolve: any) => resolve({ data: fixture.reports.filter(item => conditions.every(([key, value]) => item[key] === value)).slice(range[0], range[1] + 1), error: null }),
    };
    return query;
  },
}) }));
import { GET } from '../app/api/cam/reports/route';

beforeEach(() => { fixture.member = true; fixture.validToken = true; fixture.tables = []; fixture.filters = []; fixture.reports = []; vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key'); });
afterEach(() => vi.unstubAllEnvs());
const request = (query = 'after=2026-10-16T00%3A00%3A00Z', selected = workspace) => new Request(`https://app.example/api/cam/reports?${query}`, { headers: { Authorization: 'Bearer test-token', 'x-workspace-id': selected } });

describe('office Cam report discovery', () => {
  it('requires authenticated office membership, including for a valid field session', async () => {
    expect((await GET(new Request('https://app.example/api/cam/reports'))).status).toBe(401);
    fixture.member = false;
    expect((await GET(request())).status).toBe(403);
    expect(fixture.tables).not.toContain('report_deliveries');
    fixture.member = true; fixture.validToken = false;
    expect((await GET(request())).status).toBe(401);
  });
  it('allows an office reader and isolates the selected workspace with no-store pagination', async () => {
    fixture.reports = Array.from({ length: 51 }, (_, i) => ({ id: String(i), workspace_id: workspace, walkthrough_id: 'same-visit', report_id: `report-${i}` }));
    fixture.reports.push({ id: 'other', workspace_id: other });
    const first = await GET(request());
    expect(first.status).toBe(200); expect(first.headers.get('cache-control')).toBe('no-store');
    expect((await first.json()).reports).toHaveLength(50);
    const second = await GET(request('after=2026-10-16T00%3A00%3A00Z&offset=50'));
    expect(await second.json()).toMatchObject({ reports: [{ report_id: 'report-50' }], hasMore: false });
    expect(fixture.filters).toContainEqual(['report_deliveries', 'workspace_id', workspace]);
    expect(fixture.filters).toContainEqual(['report_deliveries', 'created_at', '2026-10-16T00:00:00Z']);
    expect((await GET(request(undefined, other))).status).toBe(403);
  });
  it('rejects invalid start dates and unbounded offsets', async () => {
    for (const query of ['', 'after=bad', 'after=2026-10-16T00:00:00Z&offset=-1', 'after=2026-10-16T00:00:00Z&offset=100001']) expect((await GET(request(query))).status).toBe(400);
    expect(fixture.tables).not.toContain('report_deliveries');
  });
});
