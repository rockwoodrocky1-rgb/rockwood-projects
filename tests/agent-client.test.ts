import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { AgentApiError, RockwoodClient } from '../agents/client.mjs';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const token = 'private-test-session';
const config = { baseUrl: 'https://rockwood.example', workspaceId, accessToken: token };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const record = { id: recordId, workspace_id: workspaceId, project_id: projectId, kind: 'task', title: 'Rough work', status: 'Waiting', version: 4, data: { source_id: 'P3-20', source_row: { notes: 'Keep original source' }, check_ids: [projectId], notes: 'Existing', baseline_finish: '2026-11-01' } };
const directory = mkdtempSync(join(tmpdir(), 'rockwood-agent-test-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('agent client uses the shared application boundary', () => {
  it('scopes reads with verified-token headers, a timeout and no redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ workspace: { id: workspaceId } }));
    const client = new RockwoodClient({ ...config, fetch });
    await client.execute({ operation: 'snapshot' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://rockwood.example/api/bootstrap');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId } });
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(client)).not.toContain(token);
  });
  it('does not write or read files unless writes are explicitly enabled', async () => {
    const fetch = vi.fn(); const client = new RockwoodClient({ ...config, fetch });
    for (const operation of ['create_record', 'update_record', 'create_project', 'update_project', 'import_records', 'upload_file', 'configure_permit_monitor', 'claim_permit_check', 'complete_permit_check']) {
      await expect(client.execute({ operation, args: {} })).rejects.toMatchObject({ status: 403, code: 'WRITE_DISABLED', outcome: 'not_sent' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves source data, links and untouched fields when updating a matching version', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ record })).mockResolvedValueOnce(json({ record: { ...record, version: 5 } }));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    await client.execute({ operation: 'update_record', args: { id: recordId, version: 4, changes: { due_date: '2026-11-02', data: { notes: 'Delivery delayed' } } } });
    const sent = JSON.parse(fetch.mock.calls[1][1].body);
    expect(sent).toEqual({ due_date: '2026-11-02', version: 4, data: { ...record.data, notes: 'Delivery delayed' } });
    expect(fetch.mock.calls[0][0]).toBe(`https://rockwood.example/api/records/${recordId}`);
    expect(record.data.notes).toBe('Existing');
  });
  it('refuses a stale caller version without sending PATCH or adopting the newer version', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ record: { ...record, version: 5 } }));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    await expect(client.execute({ operation: 'update_record', args: { id: recordId, version: 4, changes: { title: 'My edit' } } })).rejects.toMatchObject({ status: 409, code: 'CONFLICT', outcome: 'not_sent' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a race conflict between GET and PATCH', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ record })).mockResolvedValueOnce(json({ error: 'This item changed.' }, 409));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    await expect(client.execute({ operation: 'update_record', args: { id: recordId, version: 4, changes: { status: 'Working' } } })).rejects.toMatchObject({ status: 409, code: 'CONFLICT', outcome: 'rejected' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uses the same version protection for project updates', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ project: { id: projectId, version: 2 } })).mockResolvedValueOnce(json({ project: { id: projectId, version: 3 } }));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    await client.execute({ operation: 'update_project', args: { id: projectId, version: 2, changes: { target_date: '2026-12-01' } } });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ version: 2, target_date: '2026-12-01' });
    await expect(client.execute({ operation: 'update_project', args: { id: projectId, version: 0, changes: {} } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('reports unknown write outcomes without repeating creates or leaking tokens', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error(`Transport error with ${token}`));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    const error = await client.execute({ operation: 'create_record', args: { record: { kind: 'contact', title: 'Example' } } }).catch(value => value);
    expect(error).toBeInstanceOf(AgentApiError);
    expect(error.toJSON()).toMatchObject({ code: 'NETWORK_ERROR', outcome: 'unknown' });
    expect(JSON.stringify(error.toJSON())).not.toContain(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves definite reader/auth rejections and treats server failures as uncertain writes', async () => {
    for (const status of [401, 403, 500]) {
      const fetch = vi.fn().mockResolvedValue(json({ error: `Rejected ${token}` }, status));
      const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
      const error = await client.execute({ operation: 'create_project', args: { project: { name: 'Example' } } }).catch(value => value);
      expect(error.status).toBe(status); expect(error.outcome).toBe(status === 500 ? 'unknown' : 'rejected');
      expect(JSON.stringify(error.toJSON())).not.toContain(token); expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it('refuses insecure URLs, embedded credentials, invalid IDs and redirect responses', async () => {
    for (const baseUrl of ['http://remote.example', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com/?token=bad', 'file:///tmp/app']) expect(() => new RockwoodClient({ ...config, baseUrl })).toThrow();
    for (const baseUrl of ['http://localhost:8792', 'http://127.0.0.1:8792', 'http://[::1]:8792']) expect(() => new RockwoodClient({ ...config, baseUrl })).not.toThrow();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://other.example' } }));
    const client = new RockwoodClient({ ...config, fetch });
    await expect(client.execute({ operation: 'get_record', args: { id: '../elsewhere' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
    await expect(client.execute({ operation: 'capabilities' })).rejects.toMatchObject({ code: 'REDIRECT_BLOCKED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses attempts to alter record identity or use an unsupported sending operation', async () => {
    const fetch = vi.fn(); const client = new RockwoodClient({ ...config, fetch, allowWrites: true });
    await expect(client.execute({ operation: 'update_record', args: { id: recordId, version: 4, changes: { project_id: workspaceId } } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(client.execute({ operation: 'send_reminder', args: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves claim keys and never retries an uncertain permit completion', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({run:{id:recordId}})).mockRejectedValueOnce(Error('timeout'));
    const client = new RockwoodClient({...config,fetch,allowWrites:true});
    await client.execute({operation:'claim_permit_check',args:{project_id:projectId,request_key:recordId}});
    expect(JSON.parse(fetch.mock.calls[0][1].body).request_key).toBe(recordId);
    await expect(client.execute({operation:'complete_permit_check',args:{id:recordId,outcome:'blocked',summary:'Portal unavailable',records:[]}})).rejects.toMatchObject({outcome:'unknown'});
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uploads through prepare, direct private Storage and complete without exposing the signing token', async () => {
    const filePath = join(directory, 'quote.txt'); writeFileSync(filePath, 'Fictional quote');
    const path = `${workspaceId}/${projectId}/${recordId}.txt`, signingToken = 'private-upload-token';
    const fetch = vi.fn().mockResolvedValueOnce(json({ path, token: signingToken, bucket: 'pm-documents', contentType: 'text/plain' })).mockResolvedValueOnce(json({ Key: `pm-documents/${path}` })).mockResolvedValueOnce(json({ record: { id: recordId, data: { storage_path: path } } }, 201));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true, supabaseUrl: 'https://storage.example', supabaseAnonKey: 'public-test-key' });
    const result = await client.execute({ operation: 'upload_file', args: { filePath, project_id: projectId, title: 'Quote', category: 'Bid' } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0][0]).toBe('https://rockwood.example/api/files/prepare');
    expect(fetch.mock.calls[1][0]).toContain(`https://storage.example/storage/v1/object/upload/sign/pm-documents/${path}`);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', redirect: 'error' });
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ name: 'quote.txt', size: 15, project_id: projectId, path });
    expect(JSON.stringify(result)).not.toContain(signingToken);
  });
  it('returns sanitized recovery metadata for an uncertain file finalization without retrying', async () => {
    const filePath = join(directory, 'recovery.txt'); writeFileSync(filePath, 'Test');
    const path = `${workspaceId}/shared/${recordId}.txt`, signingToken = 'signing-secret';
    const fetch = vi.fn().mockResolvedValueOnce(json({ path, token: signingToken, bucket: 'pm-documents', contentType: 'text/plain' })).mockResolvedValueOnce(json({ Key: path })).mockRejectedValueOnce(new Error(`Failed ${signingToken}`));
    const client = new RockwoodClient({ ...config, fetch, allowWrites: true, supabaseUrl: 'https://storage.example', supabaseAnonKey: 'public-key' });
    const error = await client.execute({ operation: 'upload_file', args: { filePath, title: 'Recovery example', category: 'Other' } }).catch(value => value);
    expect(error.toJSON()).toMatchObject({ outcome: 'unknown', recovery: { phase: 'finalize', path, metadata: { name: 'recovery.txt', size: 4 } } });
    expect(JSON.stringify(error.toJSON())).not.toContain(signingToken); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('prints CLI help without credentials and returns structured read-only errors from stdin', () => {
    const cli = new URL('../scripts/agent.mjs', import.meta.url).pathname;
    const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0); expect(help.stdout).toContain('get_record');
    const run = spawnSync(process.execPath, [cli, '-'], { encoding: 'utf8', input: JSON.stringify({ operation: 'create_record', args: { record: { kind: 'contact', title: 'Example' } } }), env: { ...process.env, PM_AGENT_BASE_URL: config.baseUrl, PM_AGENT_WORKSPACE_ID: workspaceId, PM_AGENT_ACCESS_TOKEN: token, PM_AGENT_TOKEN_FILE: '' } });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, error: { code: 'WRITE_DISABLED', outcome: 'not_sent' } });
    expect(run.stdout + run.stderr).not.toContain(token);
  });
});
