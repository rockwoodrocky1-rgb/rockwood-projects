// Host-side session storage. Tokens never become model arguments or CLI output.
import { constants } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AgentApiError, RockwoodClient } from './client.mjs';

export const sessionPath = () => process.env.PM_AGENT_CONNECTION_FILE || join(homedir(), '.config', 'rockwood-projects', 'connection.json');
const fail = message => { throw new AgentApiError(message, { code: 'AUTHENTICATION_REQUIRED', status: 401 }); };

function rejectElevated(token) {
  if (typeof token !== 'string' || !token || token.startsWith('sb_secret_')) fail('Use the public Supabase key and an ordinary user session, never elevated credentials.');
  if (token.split('.').length === 3) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).role === 'service_role') fail('Service-role credentials are not allowed in the agent.'); }
    catch (error) { if (error instanceof AgentApiError) throw error; }
  }
}

function validate(connection) {
  const { baseUrl, workspaceId, supabaseUrl, supabaseAnonKey, session } = connection;
  new RockwoodClient({ baseUrl, workspaceId, accessToken: session?.access_token });
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || url.origin !== supabaseUrl || url.username || url.password || !supabaseAnonKey) fail('Configure the matching HTTPS Supabase origin and public client key.');
  rejectElevated(supabaseAnonKey); rejectElevated(session.access_token);
  if (!session.refresh_token || !Number.isFinite(session.expires_at)) fail('Sign in again to save a renewable user session.');
}

export async function saveConnection(file, connection) {
  validate(connection);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(connection)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

export async function readConnection(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 128000 || (process.platform !== 'win32' && ((info.mode & 0o077) || info.uid !== process.getuid()))) fail('The connection file must be owned by this user with permissions 600.');
    const connection = JSON.parse(await handle.readFile('utf8'));
    validate(connection);
    return connection;
  } catch (error) {
    if (error instanceof AgentApiError) throw error;
    fail('No valid saved connection. Run npm run agent:login on the agent host.');
  } finally { await handle?.close(); }
}

export async function authRequest(supabaseUrl, publicKey, grant, body, fetchImpl = fetch) {
  rejectElevated(publicKey);
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || url.origin !== supabaseUrl || url.username || url.password) fail('Use an HTTPS Supabase origin.');
  let response, result;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    result = await response.json();
  } catch { fail('Supabase sign-in did not confirm success. No project operation was sent.'); }
  if (!response.ok || !result.access_token || !result.refresh_token) fail('Sign-in or session renewal failed. Reconnect with npm run agent:login; no project operation was sent.');
  rejectElevated(result.access_token);
  return { access_token: result.access_token, refresh_token: result.refresh_token, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in };
}

export async function savedClientOptions(file = sessionPath(), fetchImpl = fetch) {
  // Serialize token rotation across CLI processes. A crashed process leaves a
  // visible lock, requiring host reconciliation instead of overlapping refreshes.
  const lock = `${file}.lock`;
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') fail('Another session operation holds the connection lock. If its process stopped, remove the stale connection.json.lock directory before reconnecting.');
    fail('No saved connection. Run npm run agent:login.');
  }
  try {
    let connection = await readConnection(file);
    if (connection.session.expires_at <= Date.now() / 1000 + 120) {
      const session = await authRequest(connection.supabaseUrl, connection.supabaseAnonKey, 'refresh_token', { refresh_token: connection.session.refresh_token }, fetchImpl);
      connection = { ...connection, session };
      await saveConnection(file, connection);
    }
    return { baseUrl: connection.baseUrl, workspaceId: connection.workspaceId, accessToken: connection.session.access_token, supabaseUrl: connection.supabaseUrl, supabaseAnonKey: connection.supabaseAnonKey };
  } finally { await rm(lock, { recursive: true, force: true }); }
}
