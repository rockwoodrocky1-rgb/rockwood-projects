import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShowcaseClient, SHOWCASE_PROJECT_ID } from '../lib/showcase';
import { scheduleWarnings, validateTransition, type Bootstrap, type RecordRow } from '../lib/domain';

afterEach(() => vi.restoreAllMocks());
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

describe('isolated public showcase', () => {
  it('includes every source task and inspection stage with consistent fictional progress', async () => {
    const client = createShowcaseClient();
    const snapshot = await client.request<Bootstrap>('/api/bootstrap');
    expect(client.initialProjectId).toBe(SHOWCASE_PROJECT_ID);
    expect(snapshot.projects.every(project => project.is_demo)).toBe(true);
    const tasks = snapshot.records.filter(record => record.kind === 'task');
    expect(tasks).toHaveLength(109);
    expect(new Set(tasks.map(task => task.data.source_id)).size).toBe(109);
    expect(snapshot.records.filter(record => record.kind === 'check')).toHaveLength(44);
    expect(tasks.some(task => task.status === 'Working')).toBe(true);
    expect(tasks.some(task => task.status === 'Blocked')).toBe(true);
    expect(tasks.some(task => task.status === 'Ready to check')).toBe(true);
    for (const task of tasks.filter(task => ['Done', 'Ready', 'Working'].includes(task.status))) {
      expect(() => validateTransition(task, task, snapshot.records)).not.toThrow();
      expect(scheduleWarnings(task, snapshot.records).filter(warning => warning.startsWith('Check needed:') || warning.startsWith('Waiting for '))).toEqual([]);
    }
    expect(JSON.stringify(snapshot)).not.toMatch(/\bChris\b|\bRVS\b/);
    for (const check of snapshot.records.filter(record => record.kind === 'check' && record.status === 'Passed')) expect(check.data.evidence).toMatch(/SIMULATED RESULT/);
    client.dispose();
  });
  it('never calls a network or shares edits between visitors and cloned snapshots', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    const first = createShowcaseClient(), second = createShowcaseClient();
    const contact = first.snapshot().records.find(record => record.kind === 'contact')!;
    const changed = await first.request<{ record: RecordRow }>(`/api/records/${contact.id}`, json('PATCH', { version: contact.version, title: 'My browser only' }));
    expect(changed.record.version).toBe(2);
    expect(second.snapshot().records.some(record => record.title === 'My browser only')).toBe(false);
    const external = first.snapshot(); external.records[0].title = 'Mutation outside client';
    expect(first.snapshot().records[0].title).not.toBe('Mutation outside client');
    first.reset();
    expect(first.snapshot().records.some(record => record.title === 'My browser only')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    first.dispose(); second.dispose();
  });
  it('orders schedule handoffs and aligns task wrappers with their inspection dates', () => {
    const client = createShowcaseClient(), snapshot = client.snapshot();
    const tasks = snapshot.records.filter(record => record.kind === 'task');
    for (const task of tasks) {
      expect(scheduleWarnings(task, snapshot.records).filter(warning => warning.startsWith('Planned start is before')), task.title).toEqual([]);
      if (task.data.is_inspection_wrapper) for (const id of task.data.check_ids || []) {
        const check = snapshot.records.find(record => record.id === id)!;
        if (check.status !== 'Not applicable') expect(check.due_date, task.title).toBe(task.due_date);
      }
    }
    const bySource = (id: string) => tasks.find(task => task.data.source_id === id)!;
    for (const [before, after] of [['P3-20','P3-21'], ['P3-24','P3-25'], ['P3-22','P3-23'], ['P3-27','P3-28'], ['P3-28','P3-29'], ['P3-29','P3-30'], ['P3-30','P3-31']]) {
      expect(bySource(after).data.start_date > bySource(before).due_date!, `${before} → ${after}`).toBe(true);
    }
    const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const id of ['P2-22','P2-23','P2-24']) { expect(bySource(id).due_date! >= current).toBe(true); expect(bySource(id).data.notes).toMatch(/remaining interior package/); }
    for (const task of tasks.filter(task => task.status === 'Done')) expect(task.data.actual_finish <= current, task.title).toBe(true);
    const project = snapshot.projects.find(project => project.id === SHOWCASE_PROJECT_ID)!;
    expect((Date.parse(project.target_date!) - Date.parse(current)) / 86400000).toBeLessThanOrEqual(60);
    expect(tasks.every(task => !task.due_date || task.due_date <= project.target_date!)).toBe(true);
    const past = snapshot.projects.find(project => project.status === 'Past job')!;
    expect(snapshot.records.filter(record => record.project_id === past.id).map(record => record.kind).sort()).toEqual(['bid', 'contact', 'review']);
  });
  it('creates disposable projects and preserves full or selected templates', async () => {
    const client = createShowcaseClient();
    const created = await client.request<{ project: { id: string; is_demo: boolean } }>('/api/projects', json('POST', { name: 'Visitor example', is_demo: false, template: true, start_date: '2026-10-13', target_date: '2027-01-01', selected_phases: [7] }));
    expect(created.project.is_demo).toBe(true);
    const records = client.snapshot().records.filter(record => record.project_id === created.project.id);
    expect(records.filter(record => record.kind === 'task').every(task => task.data.phase === 7)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    const before = client.snapshot().projects.length;
    await expect(client.request('/api/projects', json('POST', { name: 'Bad dates', start_date: '2026-10-14', target_date: '2026-10-13' }))).rejects.toThrow(/before/);
    expect(client.snapshot().projects.length).toBe(before);
    client.reset(); expect(client.snapshot().projects.some(project => project.id === created.project.id)).toBe(false);
  });
  it('checks versions, immutable source gates and recorded inspection evidence', async () => {
    const client = createShowcaseClient(), snapshot = client.snapshot();
    const contact = snapshot.records.find(record => record.kind === 'contact')!;
    await client.request(`/api/records/${contact.id}`, json('PATCH', { version: 1, title: 'Updated contact' }));
    await expect(client.request(`/api/records/${contact.id}`, json('PATCH', { version: 1, title: 'Stale title' }))).rejects.toThrow(/changed/);
    const drywall = snapshot.records.find(record => record.kind === 'task' && record.data.source_id === 'P3-29')!;
    await expect(client.request(`/api/records/${drywall.id}`, json('PATCH', { version: 1, status: 'Working' }))).rejects.toThrow(/prerequisite/);
    await expect(client.request(`/api/records/${drywall.id}`, json('PATCH', { version: 1, data: { ...drywall.data, prerequisite_ids: [] } }))).rejects.toThrow(/cannot be removed/);
    const check = snapshot.records.find(record => record.kind === 'check' && record.status === 'Scheduled')!;
    await expect(client.request(`/api/records/${check.id}`, json('PATCH', { version: 1, status: 'Passed' }))).rejects.toThrow(/result date/);
    expect(client.snapshot().events[0].summary).toBe('Updated Updated contact');
  });
  it('rejects invalid new records and rolls back an entire invalid or duplicate import', async () => {
    const client = createShowcaseClient(), count = client.snapshot().records.length;
    await expect(client.request('/api/records', json('POST', { kind: 'check', title: 'Unsupported approval', project_id: SHOWCASE_PROJECT_ID, status: 'Passed', data: {} }))).rejects.toThrow(/required/);
    await expect(client.request('/api/import', json('POST', { kind: 'bid', project_id: SHOWCASE_PROJECT_ID, rows: [{ kind: 'bid', title: 'Good row', data: { labor_cost: 50 } }, { kind: 'bid', title: 'Bad row', data: { labor_cost: -1 } }] }))).rejects.toThrow(/negative/);
    expect(client.snapshot().records.length).toBe(count);
    await expect(client.request('/api/import', json('POST', { kind: 'contact', project_id: SHOWCASE_PROJECT_ID, rows: [{ kind: 'contact', title: 'Duplicate contact' }, { kind: 'contact', title: 'Duplicate contact' }] }))).rejects.toThrow(/already exists/);
    expect(client.snapshot().records.length).toBe(count);
    const imported = await client.request<{ count: number }>('/api/import', json('POST', { kind: 'bid', project_id: SHOWCASE_PROJECT_ID, rows: [{ kind: 'bid', title: 'Visitor price', data: { labor_cost: 3200, material_cost: 900 } }] }));
    expect(imported.count).toBe(1); expect(client.snapshot().events[0].action).toBe('import');
  });
  it('keeps uploads and sample downloads local and revokes URLs on reset', async () => {
    const createURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:showcase-${crypto.randomUUID()}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    const client = createShowcaseClient();
    const document = client.snapshot().records.find(record => record.kind === 'document' && record.data.storage_path)!;
    const sample = await client.request<{ url: string }>(`/api/files/${document.id}`);
    expect(sample.url).toMatch(/^blob:/); expect(createURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(await (createURL.mock.calls[0][0] as Blob).text()).toMatch(/FICTIONAL EXAMPLE ONLY/);
    const file = new File(['Local visitor note'], 'visitor-note.txt', { type: 'text/plain' });
    await client.uploadFile(file, { name: file.name, size: file.size, project_id: SHOWCASE_PROJECT_ID, title: 'Visitor file', category: 'Other' });
    const uploaded = client.snapshot().records.find(record => record.title === 'Visitor file')!;
    const download = await client.request<{ url: string }>(`/api/files/${uploaded.id}`);
    expect(download.url).toMatch(/^blob:/); expect(fetch).not.toHaveBeenCalled();
    client.reset(); expect(revoke).toHaveBeenCalledWith(sample.url); expect(revoke).toHaveBeenCalledWith(download.url);
    expect(client.snapshot().records.some(record => record.id === uploaded.id)).toBe(false);
    // StrictMode disposal is reversible: the instance can serve new local blob URLs.
    client.dispose(); const newDocument = client.snapshot().records.find(record => record.kind === 'document' && record.data.storage_path)!;
    expect((await client.request<{ url: string }>(`/api/files/${newDocument.id}`)).url).toMatch(/^blob:/);
    client.dispose();
  });
  it('rejects disguised HTML and normalizes the MIME of a browser-only upload', async () => {
    const client = createShowcaseClient(), before = client.snapshot().records.length;
    const disguised = new File(['<html><script>alert(1)</script></html>'], 'disguised.pdf', { type: 'text/html' });
    await expect(client.uploadFile(disguised, { name: disguised.name, size: disguised.size, project_id: SHOWCASE_PROJECT_ID, title: 'Bad file', category: 'Other' })).rejects.toThrow(/contents/);
    expect(client.snapshot().records.length).toBe(before);
    const text = new File(['A safe plain text note'], 'note.txt', { type: 'text/html' });
    await client.uploadFile(text, { name: text.name, size: text.size, project_id: SHOWCASE_PROJECT_ID, title: 'Local note', category: 'Other' });
    expect(client.snapshot().records.find(record => record.title === 'Local note')?.data.mime_type).toBe('text/plain');
  });
});
