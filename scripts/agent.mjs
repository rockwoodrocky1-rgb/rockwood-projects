#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { RockwoodClient, AgentApiError } from '../agents/client.mjs';
import { savedClientOptions } from '../agents/session.mjs';

const HELP = `Rockwood agent interface — JSON in, JSON out.
Usage: npm run agent -- [--write] [request.json|-]
Omit the file (or use -) to read one JSON command from standard input.
Envelope: {"operation":"get_record","args":{"id":"UUID"}}
Reads: capabilities, snapshot, get_record, get_project, get_file_url.
Writes: create_record, update_record, create_project, update_project,
        import_records, upload_file. --write requires an authorized task.
Updates require id, version and changes. data changes are merged into that version.
Default: saved renewable connection from npm run agent:login.
Alternative environment: PM_AGENT_BASE_URL, PM_AGENT_WORKSPACE_ID, and exactly one of
PM_AGENT_ACCESS_TOKEN or PM_AGENT_TOKEN_FILE (private JSON with access_token).
Uploads also use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
No passwords, service-role keys, message sending or automatic mutation retries.
Full schemas: agents/tools.json. Unknown write outcomes need reconciliation.
`;

async function readLimited(file, limit) {
  const info = await stat(file);
  if (!info.isFile() || info.size > limit) throw new AgentApiError('The input file is not a regular file or is too large.', { code: 'INVALID_INPUT', status: 400 });
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > limit) throw new AgentApiError('The input file is too large.', { code: 'INVALID_INPUT', status: 400 });
  return text;
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return; }
  const allowWrites = argv.includes('--write'), positional = argv.filter(value => value !== '--write');
  if (positional.length > 1 || positional.some(value => value.startsWith('-') && value !== '-')) throw new AgentApiError('Use [--write] [request.json|-]. See --help.', { code: 'INVALID_INPUT', status: 400 });
  const tokenPath = process.env.PM_AGENT_TOKEN_FILE, tokenValue = process.env.PM_AGENT_ACCESS_TOKEN;
  if (tokenPath && tokenValue) throw new AgentApiError('Set only one of PM_AGENT_ACCESS_TOKEN or PM_AGENT_TOKEN_FILE.', { code: 'INVALID_CONFIGURATION' });
  let accessToken = tokenValue;
  if (tokenPath) {
    try {
      const info = await stat(tokenPath);
      if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new AgentApiError('The session file must be private (chmod 600).', { code: 'INVALID_CONFIGURATION' });
      accessToken = JSON.parse(await readLimited(tokenPath, 128000)).access_token;
    } catch (error) { if (error instanceof AgentApiError) throw error; throw new AgentApiError('The session file could not be read as JSON containing access_token.', { code: 'INVALID_CONFIGURATION' }); }
  }
  const explicitToken = Boolean(tokenPath || tokenValue);
  const options = explicitToken ? { baseUrl: process.env.PM_AGENT_BASE_URL, workspaceId: process.env.PM_AGENT_WORKSPACE_ID, accessToken } : await savedClientOptions();
  if (!explicitToken && ((process.env.PM_AGENT_BASE_URL && process.env.PM_AGENT_BASE_URL !== options.baseUrl) || (process.env.PM_AGENT_WORKSPACE_ID && process.env.PM_AGENT_WORKSPACE_ID !== options.workspaceId))) throw new AgentApiError('Environment target differs from the saved connection. Reconnect explicitly; saved credentials cannot be redirected.', { code: 'INVALID_CONFIGURATION' });
  const client = new RockwoodClient({ ...options, allowWrites });
  let input;
  if (positional.length && positional[0] !== '-') input = await readLimited(positional[0], 4_000_000);
  else {
    let size = 0; const chunks = [];
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 4_000_000) throw new AgentApiError('The JSON input is too large.', { code: 'INVALID_INPUT', status: 413 });
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf8');
  }
  let command; try { command = JSON.parse(input); } catch { throw new AgentApiError('Supply one valid JSON command. See --help.', { code: 'INVALID_INPUT', status: 400 }); }
  const result = await client.execute(command);
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
}
try { await main(); }
catch (error) {
  const failure = error instanceof AgentApiError ? error : new AgentApiError('The command could not be read or executed.', { code: 'COMMAND_FAILED' });
  process.stdout.write(JSON.stringify({ ok: false, error: failure.toJSON() }) + '\n');
  process.exitCode = 1;
}
