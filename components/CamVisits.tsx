'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, ArrowUpRight } from 'lucide-react';
import { useWorkspaceRuntime } from './WorkspaceRuntime';
import type { Project } from '@/lib/domain';

type Visit = { visit_id: string; project_id: string; captured_at: string; status: string; summary: string; photo_count: number; has_audio: boolean };
const labels: Record<string, string> = { received: 'Visit saved', ready_for_review: 'Ready for review', reviewed: 'Reviewed' };

export default function CamVisits({ workspaceId, projectId, projects, canWrite }: { workspaceId: string; projectId: string; projects: Project[]; canWrite: boolean }) {
  const { request, isShowcase } = useWorkspaceRuntime();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(50);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (isShowcase) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const rows: Visit[] = []; let more = false;
      for (let offset = 0; offset < limit; offset += 50) {
        const query = new URLSearchParams({ offset: String(offset) });
        if (projectId !== 'all') query.set('project', projectId);
        const result = await request<{ visits: Visit[]; hasMore: boolean }>(`/api/cam/visits?${query}`, { headers: { 'x-workspace-id': workspaceId } });
        rows.push(...result.visits); more = result.hasMore;
        if (!more) break;
      }
      if (id !== requestId.current) return;
      setVisits(rows); setHasMore(more); setError('');
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Could not load walkthroughs.'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [request, isShowcase, workspaceId, projectId, limit]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000); return () => { clearInterval(timer); requestId.current += 1; }; }, [load]);
  const selected = projects.find(p => p.id === projectId);
  const canCapture = canWrite && (!selected || (!selected.is_demo && selected.status !== 'Archived'));
  const target = new URLSearchParams({ workspace: workspaceId });
  if (selected) target.set('project', selected.id);
  return <section className="cam-visits">
    <div className="module-toolbar"><div><h2>Property walkthroughs</h2><p>Photos, recordings, notes and reports saved through Rockwood Cam.</p></div><div className="button-row">
      <button className="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} />Refresh</button>
      {!isShowcase && canCapture && <a className="button dark" href={`/cam?${target}`}><Camera size={18} />Open Cam</a>}
    </div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!loading && !visits.length && !error && <div className="panel empty-state"><Camera size={30} /><h3>No walkthroughs yet</h3><p>Choose a property in Cam and submit a visit. Its photos, audio and report will appear here.</p></div>}
    <div className="cam-visit-grid">{visits.map(visit => {
      const property = projects.find(p => p.id === visit.project_id);
      const link = new URLSearchParams({ workspace: workspaceId, project: visit.project_id, report: visit.visit_id });
      return <article className="panel cam-visit-card" key={visit.visit_id}>
        <span className={`status ${visit.status === 'reviewed' ? 'green' : 'blue'}`}>{labels[visit.status] || visit.status}</span>
        <h3>{property?.name || 'Property visit'}</h3>
        <time dateTime={visit.captured_at}>{new Date(visit.captured_at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} Eastern</time>
        <p>{visit.summary || 'Source evidence is saved. Open the visit to review notes, processing status and available media.'}</p>
        <p>{visit.photo_count} {visit.photo_count === 1 ? 'photo' : 'photos'}{visit.has_audio ? ' · Audio recording' : ''}</p>
        <a className="button" href={`/cam?${link}`}>Open visit and report<ArrowUpRight size={18} /></a>
      </article>;
    })}</div>
    {hasMore && <button className="button" disabled={loading} onClick={() => setLimit(v => v + 50)}>Load more visits</button>}
  </section>;
}
