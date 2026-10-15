import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
export class ApiRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('The workspace connection is not configured. Please contact your administrator.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Your session has ended. Please sign in again.');
  const headers = new Headers(options.headers);
  const workspace = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('workspace');
  if (workspace && !headers.has('x-workspace-id')) headers.set('x-workspace-id', workspace);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(response.status === 409
      ? 'This item changed while you were editing. Close this panel, refresh the workspace, and review the latest version before saving.'
      : result.error || 'Something went wrong. Your changes were not saved. Please try again.', response.status, result.code);
  }
  return result as T;
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: unknown) => {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (/^[=+@\-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [fields.map(escape).join(','), ...rows.map(row => fields.map(key => escape(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
