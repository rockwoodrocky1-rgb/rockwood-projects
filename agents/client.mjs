const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_OPERATIONS = new Set(['create_record', 'update_record', 'create_project', 'update_project', 'import_records', 'upload_file']);
const RECORD_FIELDS = ['kind', 'project_id', 'title', 'status', 'owner_id', 'due_date', 'data'];
const PROJECT_FIELDS = ['name', 'address', 'project_type', 'status', 'start_date', 'target_date', 'lead', 'description', 'locations', 'is_demo'];

/** An error that is safe to serialize. Unknown write outcomes must be reconciled before another attempt. */
export class AgentApiError extends Error {
  constructor(message, { status = 0, code = 'AGENT_ERROR', outcome = 'not_sent', recovery } = {}) {
    super(message);
    this.name = 'AgentApiError'; this.status = status; this.code = code; this.outcome = outcome;
    if (recovery) this.recovery = recovery;
  }
  toJSON() {
    return { message: this.message, status: this.status, code: this.code, outcome: this.outcome, ...(this.recovery ? { recovery: this.recovery } : {}) };
  }
}
function invalid(message) { throw new AgentApiError(message, { status: 400, code: 'INVALID_INPUT' }); }
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be a JSON object.`);
  return value;
}
function id(value, name = 'id') { if (typeof value !== 'string' || !UUID.test(value)) invalid(`${name} must be a UUID.`); return value; }
function version(value) { if (!Number.isInteger(value) || value < 1) invalid('version must be the positive integer read from the current item.'); return value; }
function fields(value, allowed, name) {
  object(value, name);
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) invalid(`${name} contains unsupported fields: ${unknown.join(', ')}.`);
  return value;
}
function origin(value, label) {
  let url; try { url = new URL(value); } catch { invalid(`${label} must be an absolute HTTPS origin.`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') invalid(`${label} must be an HTTPS origin without credentials, paths or query strings. HTTP is allowed only on localhost.`);
  return url.origin;
}
function failureCode(status) {
  return ({ 400: 'VALIDATION_FAILED', 401: 'AUTHENTICATION_REQUIRED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'TOO_LARGE', 429: 'RATE_LIMITED' })[status] || 'API_ERROR';
}

/**
 * Model-agnostic client for the same authenticated API used by the workspace UI.
 * No login, token refresh, automatic retries, scheduler or outbound messaging.
 */
export class RockwoodClient {
  #base; #token; #workspace; #writes; #fetch; #timeout; #storageUrl; #storageKey;
  /** @param {{baseUrl:string, accessToken:string, workspaceId:string, allowWrites?:boolean, fetch?:typeof globalThis.fetch, timeoutMs?:number, supabaseUrl?:string, supabaseAnonKey?:string}} options */
  constructor({ baseUrl, accessToken, workspaceId, allowWrites = false, fetch: fetchImpl = globalThis.fetch, timeoutMs = 30000, supabaseUrl, supabaseAnonKey } = {}) {
    this.#base = origin(baseUrl, 'baseUrl');
    if (typeof accessToken !== 'string' || !accessToken || /\s/.test(accessToken)) invalid('Supply an accessToken privately.');
    this.#token = accessToken; this.#workspace = id(workspaceId, 'workspaceId');
    if (typeof allowWrites !== 'boolean') invalid('allowWrites must be a boolean.');
    if (typeof fetchImpl !== 'function') invalid('A fetch implementation is required.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) invalid('timeoutMs must be between 1 and 120000.');
    this.#writes = allowWrites; this.#fetch = fetchImpl; this.#timeout = timeoutMs;
    this.#storageUrl = supabaseUrl; this.#storageKey = supabaseAnonKey;
  }
  #message(value, fallback) {
    return typeof value === 'string' ? value.replaceAll(this.#token, '[redacted]').slice(0, 1000) : fallback;
  }
  async #request(path, method = 'GET', body) {
    const write = method !== 'GET';
    let result;
    try {
      result = await this.#fetch(this.#base + path, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(this.#timeout),
        headers: { Authorization: `Bearer ${this.#token}`, 'x-workspace-id': this.#workspace, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new AgentApiError(write ? 'The write did not return a response. It may have completed. Read the latest state before attempting another write.' : 'The API could not be reached. Check the connection and session.', { code: 'NETWORK_ERROR', outcome: write ? 'unknown' : 'not_sent' });
    }
    if (result.redirected || (result.status >= 300 && result.status < 400)) throw new AgentApiError('API redirects are refused. Use the final application origin.', { status: result.status, code: 'REDIRECT_BLOCKED', outcome: write ? 'unknown' : 'rejected' });
    let data;
    try { data = await result.json(); } catch {
      throw new AgentApiError('The API returned an unreadable response.', { status: result.status, code: 'INVALID_RESPONSE', outcome: write && (result.ok || result.status >= 500) ? 'unknown' : 'rejected' });
    }
    if (!result.ok) throw new AgentApiError(this.#message(data?.error, 'The API rejected the request.'), { status: result.status, code: failureCode(result.status), outcome: write && (result.status >= 500 || result.status === 408) ? 'unknown' : 'rejected' });
    return data;
  }
  /** Execute one operation. Returned objects retain the HTTP API's {record}, {project}, etc. envelopes. */
  async execute(command) {
    fields(command, ['operation', 'args'], 'Command');
    const { operation } = command, args = command.args === undefined ? {} : object(command.args, 'args');
    if (WRITE_OPERATIONS.has(operation) && !this.#writes) throw new AgentApiError('This client is read-only. Enable writes only for an authorized task.', { status: 403, code: 'WRITE_DISABLED' });
    switch (operation) {
      case 'capabilities': fields(args, [], 'args'); return this.#request('/api/capabilities');
      case 'snapshot': fields(args, [], 'args'); return this.#request('/api/bootstrap');
      case 'get_record': fields(args, ['id'], 'args'); return this.#request(`/api/records/${id(args.id)}`);
      case 'get_project': fields(args, ['id'], 'args'); return this.#request(`/api/projects/${id(args.id)}`);
      case 'get_file_url': fields(args, ['id'], 'args'); return this.#request(`/api/files/${id(args.id)}`);
      case 'create_record':
        fields(args, ['record'], 'args'); fields(args.record, RECORD_FIELDS, 'record');
        return this.#request('/api/records', 'POST', args.record);
      case 'create_project':
        fields(args, ['project'], 'args'); fields(args.project, [...PROJECT_FIELDS, 'template', 'selected_phases'], 'project');
        return this.#request('/api/projects', 'POST', args.project);
      case 'update_record': {
        fields(args, ['id', 'version', 'changes'], 'args'); id(args.id); version(args.version);
        fields(args.changes, ['title', 'status', 'owner_id', 'due_date', 'data'], 'changes');
        if (args.changes.data !== undefined) object(args.changes.data, 'changes.data');
        const { record } = await this.#request(`/api/records/${args.id}`);
        this.#matchVersion(record, args.id, args.version);
        const changes = { ...args.changes, ...(args.changes.data === undefined ? {} : { data: { ...record.data, ...args.changes.data } }) };
        return this.#request(`/api/records/${args.id}`, 'PATCH', { ...changes, version: args.version });
      }
      case 'update_project': {
        fields(args, ['id', 'version', 'changes'], 'args'); id(args.id); version(args.version); fields(args.changes, PROJECT_FIELDS, 'changes');
        const { project } = await this.#request(`/api/projects/${args.id}`);
        this.#matchVersion(project, args.id, args.version);
        return this.#request(`/api/projects/${args.id}`, 'PATCH', { ...args.changes, version: args.version });
      }
      case 'import_records':
        fields(args, ['kind', 'project_id', 'rows'], 'args');
        if (!Array.isArray(args.rows) || args.rows.length < 1 || args.rows.length > 500) invalid('Import 1 to 500 rows.');
        return this.#request('/api/import', 'POST', args);
      case 'upload_file':
        fields(args, ['filePath', 'project_id', 'title', 'category', 'record_id'], 'args');
        return this.#upload(args);
      default: invalid('Unsupported operation. Run capabilities or consult agents/tools.json.');
    }
  }
  #matchVersion(item, expectedId, expectedVersion) {
    if (!item || item.id !== expectedId || !Number.isInteger(item.version)) throw new AgentApiError('The API returned an unexpected item.', { code: 'INVALID_RESPONSE' });
    if (item.version !== expectedVersion) throw new AgentApiError('This item changed. Review its latest version and re-plan the change; no update was sent.', { status: 409, code: 'CONFLICT' });
  }
  async #upload(args) {
    if (typeof args.filePath !== 'string' || !args.filePath.trim()) invalid('filePath must identify a local file.');
    if (args.project_id != null) id(args.project_id, 'project_id');
    if (args.record_id != null) id(args.record_id, 'record_id');
    const storageUrl = origin(this.#storageUrl || process.env.NEXT_PUBLIC_SUPABASE_URL, 'Supabase URL');
    const storageKey = this.#storageKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (typeof storageKey !== 'string' || !storageKey) invalid('Configure the public Supabase URL and anon key for file uploads.');
    const { readFile, stat } = await import('node:fs/promises'), { basename } = await import('node:path');
    let bytes;
    try {
      const info = await stat(args.filePath);
      if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) invalid('Upload a regular file between 1 byte and 20 MB.');
      bytes = await readFile(args.filePath);
    } catch (error) { if (error instanceof AgentApiError) throw error; throw new AgentApiError('The local file could not be read.', { code: 'FILE_READ_FAILED' }); }
    if (bytes.length < 1 || bytes.length > 20 * 1024 * 1024) invalid('Upload a file between 1 byte and 20 MB.');
    const metadata = { name: basename(args.filePath), size: bytes.length, project_id: args.project_id ?? null, title: args.title, category: args.category, ...(args.record_id ? { record_id: args.record_id } : {}) };
    const prepared = await this.#request('/api/files/prepare', 'POST', metadata);
    const prefix = `${this.#workspace}/${metadata.project_id || 'shared'}/`;
    if (prepared.bucket !== 'pm-documents' || typeof prepared.path !== 'string' || !prepared.path.startsWith(prefix) || !/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(prepared.path.slice(prefix.length)) || typeof prepared.token !== 'string' || typeof prepared.contentType !== 'string') throw new AgentApiError('The API returned invalid upload instructions.', { code: 'INVALID_RESPONSE' });
    const recovery = { operation: 'upload_file', phase: 'storage_upload', path: prepared.path, metadata };
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const storage = createClient(storageUrl, storageKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${this.#token}` }, fetch: (url, options) => {
          const destination = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
          if (destination.origin !== storageUrl || !destination.pathname.startsWith('/storage/v1/')) throw new AgentApiError('Storage requests must stay on the configured Storage origin.', { code: 'STORAGE_ORIGIN_BLOCKED' });
          return this.#fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(this.#timeout) });
        } },
      });
      const { error } = await storage.storage.from('pm-documents').uploadToSignedUrl(prepared.path, prepared.token, bytes, { contentType: prepared.contentType, upsert: false });
      if (error) throw new AgentApiError('The private upload did not confirm success. Reconcile the private path before starting another upload.', { status: Number(error.statusCode) || 0, code: 'UPLOAD_FAILED', outcome: 'unknown', recovery });
      recovery.phase = 'finalize';
      return await this.#request('/api/files/complete', 'POST', { ...metadata, path: prepared.path });
    } catch (error) {
      if (error instanceof AgentApiError) { error.recovery = recovery; throw error; }
      throw new AgentApiError('The upload outcome is unknown. Reconcile the private path before starting another upload.', { code: 'UPLOAD_FAILED', outcome: 'unknown', recovery });
    }
  }
}
