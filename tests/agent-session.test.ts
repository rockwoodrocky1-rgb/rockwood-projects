import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, stat, chmod, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readConnection, saveConnection, savedClientOptions } from '../agents/session.mjs';

const dirs: string[] = [];
async function location() { const dir = await mkdtemp(join(tmpdir(), 'rockwood-session-')); dirs.push(dir); return join(dir, 'connection.json'); }
const connection = (expires_at = Date.now() / 1000 + 3600) => ({ baseUrl: 'https://rockwood.example', workspaceId: '11111111-1111-4111-8111-111111111111', supabaseUrl: 'https://db.example', supabaseAnonKey: 'public-test-key', session: { access_token: 'private-old-access', refresh_token: 'private-old-refresh', expires_at } });
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('host connection lifecycle', () => {
  it('stores private sessions and reuses a fresh token without a network call', async () => {
    const file = await location(); await saveConnection(file, connection());
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const fetch = vi.fn(); const options = await savedClientOptions(file, fetch);
    expect(options.workspaceId).toBe(connection().workspaceId);
    expect(options.accessToken).toBe('private-old-access');
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(file, 'utf8')).not.toContain('password');
  });
  it('rotates and persists an expiring session before giving a token to the client', async () => {
    const file = await location(); await saveConnection(file, connection(1));
    const session = { access_token: 'private-new-access', refresh_token: 'private-new-refresh', expires_at: Date.now() / 1000 + 3600 };
    const fetch = vi.fn().mockResolvedValue(Response.json(session));
    const options = await savedClientOptions(file, fetch);
    expect(options.accessToken).toBe(session.access_token);
    expect((await readConnection(file)).session.refresh_token).toBe(session.refresh_token);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://db.example/auth/v1/token?grant_type=refresh_token');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', body: JSON.stringify({ refresh_token: 'private-old-refresh' }) });
  });
  it('fails closed on refresh rejection, preserves the old file and redacts server errors', async () => {
    const file = await location(); await saveConnection(file, connection(1));
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'private-old-refresh' }, { status: 401 }));
    await expect(savedClientOptions(file, fetch)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    expect((await readConnection(file)).session.access_token).toBe('private-old-access');
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(stat(`${file}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('refuses concurrent rotation, readable secrets and symlinked files', async () => {
    const file = await location(); await saveConnection(file, connection(1));
    const fetch = vi.fn(); await mkdir(`${file}.lock`);
    await expect(savedClientOptions(file, fetch)).rejects.toThrow('lock');
    expect(fetch).not.toHaveBeenCalled();
    await chmod(file, 0o644); await expect(readConnection(file)).rejects.toThrow('600');
    await chmod(file, 0o600); const alias = `${file}.alias`; await symlink(file, alias);
    await expect(readConnection(alias)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });
  it('refuses service-role credentials and mismatched CLI destinations', async () => {
    const file = await location(); const elevated = connection();
    elevated.session.access_token = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    await expect(saveConnection(file, elevated)).rejects.toThrow('Service-role');
    await saveConnection(file, connection());
    const env: NodeJS.ProcessEnv = { ...process.env, PM_AGENT_CONNECTION_FILE: file, PM_AGENT_BASE_URL: 'https://wrong.example' };
    delete env.PM_AGENT_ACCESS_TOKEN; delete env.PM_AGENT_TOKEN_FILE;
    const result = spawnSync(process.execPath, ['scripts/agent.mjs'], { env, input: '{"operation":"snapshot"}', encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('INVALID_CONFIGURATION');
    expect(result.stdout + result.stderr).not.toContain('private-old-access');
  });
  it('installs into only the chosen workspace and preserves a differing existing skill', async () => {
    const file = await location(); const workspace = join(file, '..');
    const run = () => spawnSync(process.execPath, ['scripts/install-openclaw.mjs', '--workspace', workspace], { encoding: 'utf8' });
    expect(run().status).toBe(0); expect(run().status).toBe(0);
    const skill = join(workspace, 'skills/rockwood-projects/SKILL.md');
    const content = await readFile(skill, 'utf8'); expect(content).not.toContain('{{REPO}}'); expect(content).toContain('scripts/agent.mjs');
    const { writeFile } = await import('node:fs/promises'); await writeFile(skill, 'Existing custom skill');
    expect(run().status).toBe(1); expect(await readFile(skill, 'utf8')).toBe('Existing custom skill');
  });
});
