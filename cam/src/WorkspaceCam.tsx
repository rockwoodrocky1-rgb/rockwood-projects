'use client';

import { useEffect, useState } from 'react';
import { getSupabase, request } from '@/lib/client';
import type { WorkspaceAccess } from './cloud';
import { configureStorage } from './storage';
import { LanguageProvider } from './i18n';
import App from './App';
import type { Project } from '../shared/model';

type Connection = { workspace: { id: string; name: string; role: string }; projects: Project[]; live: boolean };

export default function WorkspaceCam() {
  const [access, setAccess] = useState<WorkspaceAccess>();
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function connect() {
      setLoading(true); setError('');
      try {
        const client = getSupabase();
        if (!client) throw new Error('Workspace storage is not configured.');
        const { data, error: authError } = await client.auth.getSession();
        if (authError) throw authError;
        if (!data.session) { if (active) setSignedIn(false); return; }
        if (active) setSignedIn(true);
        const workspace = new URLSearchParams(location.search).get('workspace');
        const result = await request<Connection>('/api/cam/workspace', { headers: workspace ? { 'x-workspace-id': workspace } : {} });
        if (!active) return;
        setEmpty(!result.projects.length);
        configureStorage(`pm-${result.workspace.id}-${data.session.user.id}`);
        setLive(result.live);
        setAccess({ client, workspaceId: result.workspace.id, workspaceName: result.workspace.name,
          userId: data.session.user.id, email: data.session.user.email || '',
          role: result.workspace.role === 'reader' ? 'viewer' : 'owner', projects: result.projects,
          signOut: async () => { await client.auth.signOut(); setAccess(undefined); setSignedIn(false); },
        });
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not connect to the workspace.'); }
      finally { if (active) setLoading(false); }
    }
    void connect();
    return () => { active = false; };
  }, [attempt]);

  if (access && !empty) return <LanguageProvider><App logoAvailable initialLiveAiEnabled={live} cloud={access} /></LanguageProvider>;
  return <main className="cam-connection"><img src="/brand/rockwood-logo.png" alt="Rockwood Development" />
    <h1>Rockwood Cam</h1>
    {loading ? <p>Opening your workspace properties…</p> : !signedIn ? <>
      <p>Sign in with your Rockwood workspace account to record a property visit.</p>
      <form onSubmit={async e => {
        e.preventDefault(); setError(''); setLoading(true);
        try {
        const client = getSupabase();
        const result = client ? await client.auth.signInWithPassword({ email: email.trim(), password }) : null;
        setPassword('');
        if (!result || result.error) { setError(result?.error?.message || 'Workspace storage is not configured.'); setLoading(false); }
        else setAttempt(v => v + 1);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again."); setLoading(false); }
      }}>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary" type="submit">Sign in</button>
      </form>
    </> : empty ? <p>Add a real property in the workspace before recording a visit.</p> : <button className="primary" onClick={() => setAttempt(v => v + 1)}>Retry connection</button>}
    {error && <p role="alert">{error}</p>}
    <a href="/workspace">Open workspace</a>
  </main>;
}
