// Run manually after applying the migration. Never put these values in source control.
// Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PM_ADMIN_EMAIL, PM_ADMIN_PASSWORD.
// Optional: PM_WORKSPACE_NAME, PM_RESET_PASSWORD=true (explicitly resets an existing user).
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.PM_ADMIN_EMAIL;
const password = process.env.PM_ADMIN_PASSWORD;
if (!url || !key || !email || !password) throw new Error('Set the four required provisioning environment variables.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const name = process.env.PM_WORKSPACE_NAME || 'Rockwood Development';
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
let user;
for (let page = 1; ; page++) {
  const users = must(await db.auth.admin.listUsers({ page, perPage: 200 })).users;
  user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (user || users.length < 200) break;
}
if (!user) user = must(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
else if (process.env.PM_RESET_PASSWORD === 'true') user = must(await db.auth.admin.updateUserById(user.id, { password, email_confirm: true })).user;
if (!user) throw new Error('Could not resolve the administrator account.');
let workspace = must(await db.from('pm_workspaces').select('id,name').eq('name', name).order('created_at').limit(1).maybeSingle());
if (!workspace) workspace = must(await db.from('pm_workspaces').insert({ name }).select('id,name').single());
must(await db.from('pm_members').upsert({ workspace_id: workspace.id, user_id: user.id, role: 'admin' }, { onConflict: 'workspace_id,user_id' }));
console.log(`Provisioned administrator membership for workspace ${workspace.id}. No credentials were printed.`);
