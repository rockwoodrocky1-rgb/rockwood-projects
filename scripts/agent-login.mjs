#!/usr/bin/env node
import { RockwoodClient } from '../agents/client.mjs';
import { authRequest, saveConnection, sessionPath } from '../agents/session.mjs';

if (process.argv.includes('--help')) {
  console.log('Connect an existing authorized user. Supply PM_AGENT_BASE_URL, PM_AGENT_WORKSPACE_ID, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PM_AGENT_EMAIL and PM_AGENT_PASSWORD through a private host environment. Never put the password in chat or command arguments. Saves a renewable session outside Git; does not provision accounts. Optional PM_AGENT_CONNECTION_FILE selects a per-agent private file.');
} else {
  try {
    const { PM_AGENT_BASE_URL: baseUrl, PM_AGENT_WORKSPACE_ID: workspaceId, NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey, PM_AGENT_EMAIL: email, PM_AGENT_PASSWORD: password } = process.env;
    if (!email || !password || !supabaseUrl || !supabaseAnonKey) throw Error('Supply the required connection settings and user credentials privately. See --help.');
    // Validate destination and explicit workspace before sending any credentials.
    new RockwoodClient({ baseUrl, workspaceId, accessToken: 'configuration-check' });
    const session = await authRequest(supabaseUrl, supabaseAnonKey, 'password', { email, password });
    delete process.env.PM_AGENT_PASSWORD;
    const client = new RockwoodClient({ baseUrl, workspaceId, accessToken: session.access_token });
    const result = await client.execute({ operation: 'capabilities' });
    if (result.workspace?.id !== workspaceId || !['manager', 'admin'].includes(result.workspace?.role)) throw Error('The selected account must have manager or admin membership in this exact workspace. No connection was saved.');
    await saveConnection(sessionPath(), { baseUrl, workspaceId, supabaseUrl, supabaseAnonKey, session });
    console.log(JSON.stringify({ ok: true, workspace: result.workspace, connectionFile: sessionPath(), message: 'Connected. Password was not saved. Use npm run agent for reads and --write for authorized updates.' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
