import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let fieldClient: SupabaseClient | undefined;
let activeClient: SupabaseClient | undefined;
export function getFieldSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  fieldClient ??= createClient(url, key, { auth: {
    storageKey: 'rockwood-cam-field-session-v1', detectSessionInUrl: false,
  } });
  return fieldClient;
}
// A report opened from a signed-in workspace may use that existing membership.
// Field capture always has separate storage and never signs out the workspace.
export function useCamClient(client: SupabaseClient) { activeClient = client; }
export function getSupabase() { return activeClient ?? getFieldSupabase(); }
