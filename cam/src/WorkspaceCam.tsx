'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase as getWorkspaceSupabase } from '@/lib/client';
import { getFieldSupabase, useCamClient } from './supabase';
import type { WorkspaceAccess } from './cloud';
import { configureStorage } from './storage';
import { LanguageProvider } from './i18n';
import { participantSchema, type Participant } from '../shared/participant';
import App from './App';
import { CamBrand } from './ui';
import type { Project } from '../shared/model';

type Connection = { workspace: { id: string; name: string; role: WorkspaceAccess['role'] }; projects: Project[]; live: boolean; participant: Participant | null };

export default function WorkspaceCam() {
  const [access, setAccess] = useState<WorkspaceAccess>();
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const clientRef = useRef<SupabaseClient | null>(null);
  const generation = useRef(0);

  async function connect(client: SupabaseClient, id: number, openingReport = false) {
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session) return;
    const workspace = new URLSearchParams(location.search).get('workspace');
    const result = await fetch('/api/cam/workspace', { cache: 'no-store', headers: {
      Authorization: `Bearer ${data.session.access_token}`, ...(workspace ? { 'x-workspace-id': workspace } : {}),
    } });
    const connection = await result.json();
    if (!result.ok) {
      if (connection.code === 'cam_contact_required') return;
      throw new Error(connection.error || 'Could not load properties. Please try again.');
    }
    if (id !== generation.current) return;
    const value = connection as Connection;
    if (!value.participant && !openingReport) return;
    useCamClient(client);
    configureStorage(`pm-${value.workspace.id}-${data.session.user.id}`);
    setLive(value.live);
    setAccess({ client, workspaceId: value.workspace.id, workspaceName: value.workspace.name,
      userId: data.session.user.id, email: data.session.user.email || '', role: value.workspace.role,
      participant: value.participant ?? undefined, projects: value.projects,
      signOut: async () => {
        generation.current += 1;
        // Keep existing workspace login and any pending device recovery copies.
        if (client === getFieldSupabase()) await client.auth.signOut({ scope: 'local' });
        clientRef.current = getFieldSupabase();
        setAccess(undefined); setName(''); setPhone(''); setError('');
      },
    });
  }

  useEffect(() => {
    const id = ++generation.current;
    async function restore() {
      try {
        let client = getFieldSupabase();
        const query = new URLSearchParams(location.search);
        const reportLink = !!query.get('report') || /^#(?:report|source)\//.test(location.hash);
        // Review links from the workspace use its existing account if available;
        // opening Cam for capture never asks for, creates, or reuses that login.
        if (reportLink) {
          const workspaceClient = getWorkspaceSupabase();
          const session = workspaceClient ? (await workspaceClient.auth.getSession()).data.session : null;
          if (session && !session.user.is_anonymous) client = workspaceClient;
        }
        if (!client) throw new Error('Cam storage is not configured.');
        clientRef.current = client;
        await connect(client, id, reportLink && client !== getFieldSupabase());
      } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : 'Could not reconnect. Please try again.'); }
      finally { if (id === generation.current) setLoading(false); }
    }
    void restore();
    return () => { generation.current += 1; };
  }, []);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    const participant = participantSchema.safeParse({ name, phone });
    if (!participant.success) { setError('Enter your name and a valid phone number.'); return; }
    const id = ++generation.current;
    setLoading(true); setError('');
    try {
      const client = clientRef.current ?? getFieldSupabase();
      if (!client) throw new Error('Cam storage is not configured.');
      clientRef.current = client;
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        const entry = await client.auth.signInAnonymously();
        if (entry.error) throw new Error('Could not start your walkthrough session. Please try again shortly.');
      }
      const saved = await client.rpc('register_field_contact', { contact_name: participant.data.name, contact_phone: participant.data.phone });
      if (saved.error) throw new Error('Could not save your name and phone number. Please try again.');
      await connect(client, id);
    } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : 'Could not start. Please try again.'); }
    finally { if (id === generation.current) setLoading(false); }
  }

  if (access && access.projects.length) return <LanguageProvider><App logoAvailable initialLiveAiEnabled={live} cloud={access}
    requestParticipant={() => { setAccess(undefined); setName(''); setPhone(''); }} /></LanguageProvider>;
  return <div className="cam-entry"><header className="cam-entry-header"><CamBrand /><a href="/workspace">Office workspace</a></header><main className="cam-connection">
    <span className="eyebrow">PROPERTY WALKTHROUGHS</span>
    <h1>Start your walkthrough.</h1>
    {access ? <><p>No properties are available for walkthroughs yet. Ask the office to add the property, then refresh.</p><button className="button primary" onClick={() => location.reload()}>Refresh properties</button></> : <>
      <p>Enter your name and phone number, then choose the property you’re walking through.</p>
      <form onSubmit={enter}>
        <label>Your name<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Phone number<input type="tel" autoComplete="tel" required maxLength={32} value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <button className="button primary" type="submit" disabled={loading}>{loading ? 'Connecting…' : 'Choose property'}</button>
      </form>
      <p>No account or password needed.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </main><footer className="cam-entry-footer">Rockwood Development</footer></div>;
}
