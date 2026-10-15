'use client';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, ExternalLink, ShieldCheck, Clock3, CircleAlert, CircleCheck, CircleHelp, Ban, Building2, CornerDownRight, FileText } from 'lucide-react';
import type { Bootstrap, Project, RecordRow } from '@/lib/domain';
import { eligibleProject, monitorState, safePermitUrl, TERMINAL_PERMITS, type PermitMonitor, type PermitRun } from '@/lib/permits';
import { checkTone, permitActions, permitGroups, permitTone, type PermitAction, type PermitFilter, type PermitTone } from '@/lib/permit-presentation';
import { useWorkspaceRuntime } from './WorkspaceRuntime';

const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? `${new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` : 'Not recorded';
const attention = (state: string) => ['Needs attention', 'Needs source', 'Interrupted', 'Stale'].includes(state);
const toneIcons = { pending: Clock3, blocked: CircleAlert, complete: CircleCheck, unknown: CircleHelp, neutral: Ban };
type Monitoring = { monitors: PermitMonitor[]; runs: PermitRun[] };
type Edit = (record: RecordRow) => void;

function Badge({ tone, children }: { tone: PermitTone; children: ReactNode }) {
  const Icon = toneIcons[tone];
  return <span className={`permit-badge ${tone}`}><Icon size={16} aria-hidden="true"/>{children}</span>;
}
export function PermitMilestones({ records, onEdit }: { records: RecordRow[]; onEdit: Edit }) {
  const permits = records.filter(r => r.kind === 'permit' && !TERMINAL_PERMITS.has(r.status));
  const events = permits.flatMap(r => [['next_action_date', r.data.next_action || 'Next action'], ['expiry_date', 'Permit expires']].filter(([key]) => r.data[key]).map(([key, label]) => ({ record: r, key, date: String(r.data[key]), label }))).sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return null;
  return <section className="permit-milestones" aria-label="Permit dates"><strong>Permit dates</strong>{events.map(e => <button className="button" key={e.record.id + e.key} onClick={() => onEdit(e.record)}><Clock3 size={17}/><span>{e.date} · {e.record.data.permit_number} · {e.label}</span></button>)}</section>;
}

export default function PermitsView({ data, projectId, onEdit, onAdd, canWrite }: { data: Bootstrap; projectId: string; onEdit: Edit; onAdd: () => void; canWrite: boolean }) {
  const { request, isShowcase } = useWorkspaceRuntime();
  const [monitoring, setMonitoring] = useState<Monitoring>({ monitors: [], runs: [] });
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('active'), [permitFilter, setPermitFilter] = useState<PermitFilter>('all'), [search, setSearch] = useState('');
  const refresh = useCallback(async () => {
    if (isShowcase) return;
    try { setMonitoring(await request<Monitoring>('/api/permits')); setError(''); } catch (e) { setError((e as Error).message); }
  }, [request, isShowcase]);
  useEffect(() => {
    let active = true, busy = false;
    const load = async () => {
      if (!active || busy || document.visibilityState === 'hidden' || isShowcase) return;
      busy = true;
      try { const result = await request<Monitoring>('/api/permits'); if (active) { setMonitoring(result); setError(''); } }
      catch (e) { if (active) setError((e as Error).message); }
      finally { busy = false; }
    };
    void load(); const interval = setInterval(load, 30000); document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(interval); document.removeEventListener('visibilitychange', load); };
  }, [request, isShowcase]);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const projects = data.projects.filter(p => (isShowcase || !p.is_demo) && p.status !== 'Archived' && (projectId === 'all' || p.id === projectId));
  const rows = projects.map(project => {
    const monitor = monitoring.monitors.find(m => m.project_id === project.id);
    const runs = monitoring.runs.filter(r => r.project_id === project.id);
    const records = data.records.filter(r => r.project_id === project.id);
    const permits = records.filter(r => r.kind === 'permit');
    const actions = permitActions(records, today);
    const state = monitorState(project, monitor, runs.find(r => r.status === 'running'));
    const needsAttention = !permits.length || actions.some(a => a.priority <= 2) || attention(state) || permitGroups(permits).some(g => g.unlinked);
    const propertyMatches = `${project.name} ${project.address}`.toLowerCase().includes(search.trim().toLowerCase());
    const groups = permitGroups(permits, propertyMatches ? '' : search, permitFilter);
    return { project, monitor, runs, records, permits, actions, state, needsAttention, groups, propertyMatches };
  });
  const visible = rows.filter(row => (filter !== 'active' || isShowcase || eligibleProject(row.project)) && (filter !== 'past' || !eligibleProject(row.project)) && (filter !== 'attention' || row.needsAttention) && (row.groups.length > 0 || (permitFilter === 'all' && row.propertyMatches)));
  const permits = rows.flatMap(row => row.permits);
  const checks = rows.flatMap(row => row.records.filter(r => r.kind === 'check'));
  return <div className="permits-view">
    <div className="permit-intro"><div><h2>See what is open. Know what comes next.</h2><p>Each master contains its subpermits. Follow the next actions, then open a permit to review its checks and evidence.</p></div>{canWrite && <button className="button primary" onClick={onAdd}><Plus size={18}/>Add permit</button>}</div>
    {error && <div className="alert error" role="alert">Monitoring could not refresh: {error}<button className="button" onClick={refresh}>Retry</button></div>}
    {notice && <p role="status">{notice}</p>}
    <div className="permit-legend" aria-label="Permit color guide"><Badge tone="pending">Yellow · unfinished</Badge><Badge tone="blocked">Red · blocker</Badge><Badge tone="complete">Green · closed / passed</Badge><Badge tone="unknown">Gray · unverified</Badge><Badge tone="neutral">Gray · cancelled / not required</Badge></div>
    <details className="permit-guide"><summary>What is a master, subpermit or standalone permit?</summary><div><p><strong>Master:</strong> the main permit for a scope of work. A property can have more than one.</p><p><strong>Subpermit:</strong> a related permit under a master, often for a trade such as electrical or plumbing.</p><p><strong>Standalone:</strong> an independent permit with no master relationship recorded.</p><p><strong>Checks:</strong> inspections, document reviews and certificates. Passing one check does not close the permit. Required permits depend on the actual project and issuing authority.</p></div></details>
    <div className="permit-stats"><div><strong>{projects.filter(eligibleProject).length}</strong><span>Active properties</span></div><div><strong>{permits.filter(p => !TERMINAL_PERMITS.has(p.status)).length}</strong><span>Unfinished permits</span></div><div><strong>{permits.filter(p => permitTone(p) === 'blocked').length + checks.filter(c => c.status === 'Failed').length}</strong><span>Permit / check blockers</span></div><div><strong>{rows.filter(r => r.needsAttention).length}</strong><span>Properties to review</span></div></div>
    <div className="permit-filters"><label><span>Find a property or permit</span><input aria-label="Search properties or permits" placeholder="Address, permit number, trade or status…" value={search} onChange={e => setSearch(e.target.value)}/></label><label><span>Properties</span><select aria-label="Property scope" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Active properties</option><option value="attention">Needs attention</option><option value="past">Past / completed properties</option><option value="all">All properties</option></select></label><label><span>Permits</span><select aria-label="Permit status" value={permitFilter} onChange={e => setPermitFilter(e.target.value as PermitFilter)}><option value="all">All statuses</option><option value="unfinished">Unfinished</option><option value="blocked">Blocked / corrections</option><option value="unverified">Needs verification</option><option value="closed">Closed</option></select></label></div>
    <p className="permit-results" role="status">Showing {visible.length} of {projects.length} properties. Counts above cover the selected property scope.</p>
    {!visible.length && <div className="panel permit-empty"><ShieldCheck size={30}/><h3>{projects.length ? 'No matching properties' : 'Add your first property'}</h3><p>{projects.length ? 'Change the filters or search to see more properties.' : 'Add a real property in Projects or send its address to Rocky. Permit requirements stay unconfirmed until researched.'}</p></div>}
    {visible.map(({ project, monitor, runs, records, permits: items, actions, state, groups }) => {
      const unlinkedChecks = records.filter(r => r.kind === 'check' && !items.some(p => p.id === r.data.permit_id));
      return <section key={project.id} className="panel permit-property" aria-label={project.name}>
        <header><div><h2>{project.name}</h2><p>{project.address || 'Address needed for permit lookup'}</p></div><span className="permit-property-stage">{project.status}</span></header>
        <div className="permit-property-counts"><span>{items.filter(r => r.data.permit_type === 'Master').length} master permits</span><span>{items.filter(r => r.data.permit_type === 'Subpermit').length} subpermits</span><span>{items.filter(r => r.data.permit_type === 'Standalone').length} standalone</span><span>{items.filter(r => r.status === 'Closed').length} recorded closed</span></div>
        <ActionList actions={actions} hasPermits={items.length > 0} contacts={data.records} onEdit={onEdit}/>
        <div className="permit-monitor-line"><strong>Rocky’s checks:</strong><span className={`permit-monitor-status ${attention(state) ? 'attention' : ''}`}>{eligibleProject(project) ? state : 'Not monitored · past / completed'}</span><span>Last successful check: {timestamp(monitor?.last_success_at)}</span></div>
        {monitor?.last_summary && <p className="permit-summary">{monitor.last_summary}</p>}
        {!items.length && <p className="permit-empty-note"><strong>Permit inventory not established.</strong> Rocky needs to confirm the issuing authority, search all related records and identify missing requirements. No records does not mean no permits are required.</p>}
        {items.length > 0 && groups.length === 0 && <p className="permit-empty-note">No permits match this filter for this property.</p>}
        <div className="permit-tree">{groups.map(group => <PermitCard key={group.record.id} record={group.record} childrenRecords={group.children} allRecords={data.records} onEdit={onEdit} contextOnly={group.contextOnly} unlinked={group.unlinked}/>)}</div>
        {unlinkedChecks.length > 0 && <details className="permit-unlinked-checks"><summary>Property checks without a verified permit link ({unlinkedChecks.length})</summary><p>These checks still need a permit link or confirmation that they apply independently.</p><CheckList records={unlinkedChecks} onEdit={onEdit}/></details>}
        <details className="permit-settings"><summary>Monitoring source and settings</summary><p className="permit-small">Last attempt: {timestamp(monitor?.last_attempt_at)} · Next due: {!eligibleProject(project) ? 'Not monitored' : monitor?.enabled === false ? 'Paused' : monitor?.next_check_at ? timestamp(monitor.next_check_at) : 'Next worker run'}</p><MonitorForm key={`${project.id}-${monitor?.version || 0}`} project={project} monitor={monitor} canWrite={canWrite && !isShowcase} onSaved={async () => { await refresh(); setNotice('Monitoring settings saved. Queued checks run when Rocky next polls.'); }}/></details>
        <details className="permit-history"><summary>Rocky’s check history ({runs.length})</summary>{!runs.length ? <p>No automated checks have run yet.</p> : runs.map(run => <article key={run.id}><strong>{run.status === 'running' && Date.parse(run.lease_expires_at) < Date.now() ? 'interrupted' : run.status.replaceAll('_', ' ')}</strong><time>{timestamp(run.started_at)}</time><p>{run.summary || 'Check started; awaiting results.'}</p><SourceLink url={run.source_url}/></article>)}</details>
      </section>;
    })}
  </div>;
}

function ActionList({ actions, hasPermits, contacts, onEdit }: { actions: PermitAction[]; hasPermits: boolean; contacts: RecordRow[]; onEdit: Edit }) {
  const render = (action: PermitAction) => {
    const owner = contacts.find(r => r.kind === 'contact' && r.id === action.record.owner_id)?.title;
    const Icon = toneIcons[action.tone];
    return <button key={action.record.id} className={`permit-action ${action.tone}`} onClick={() => onEdit(action.record)}><Icon size={19} aria-hidden="true"/><span><strong>{action.message}</strong><span>{action.record.title}{action.record.data.permit_number ? ` · ${action.record.data.permit_number}` : ''} · {owner || 'Owner not assigned'}{action.date ? ` · ${action.date}` : ' · Date not set'}</span></span></button>;
  };
  return <section className="permit-actions" aria-label="What needs to happen next"><h3>What needs to happen next</h3>{!actions.length ? <p>{hasPermits ? 'No next actions are recorded for these permits and checks. Confirm that the permit inventory and closeout evidence are complete.' : 'Identify the required permits and record the next step. Add the team’s site progress and missing context as it becomes available.'}</p> : <>{actions.slice(0, 3).map(render)}{actions.length > 3 && <details><summary>Show {actions.length - 3} more actions / checks</summary>{actions.slice(3).map(render)}</details>}</>}</section>;
}
function SourceLink({ url }: { url?: string }) { return safePermitUrl(url) ? <a className="permit-source" href={url} target="_blank" rel="noopener noreferrer">Official source <ExternalLink size={15}/></a> : null; }

function CheckList({ records, onEdit }: { records: RecordRow[]; onEdit: Edit }) {
  return <div className="permit-inspections">{records.map(record => <button key={record.id} onClick={() => onEdit(record)}><span><strong>{record.title}</strong><small>{record.data.check_type || 'Check type unconfirmed'} · {record.data.inspection_type || 'Discipline unconfirmed'}</small><small>{record.data.result_date ? `Result: ${record.data.result_date}` : record.data.scheduled_date ? `Scheduled: ${record.data.scheduled_date}` : 'Date unconfirmed'}</small>{record.data.findings && <small>{record.data.findings}</small>}</span><Badge tone={checkTone(record)}>{record.status}{record.status === 'Passed' && checkTone(record) === 'unknown' ? ' · evidence incomplete' : ''}</Badge></button>)}</div>;
}
function PermitCard({ record, childrenRecords = [], allRecords, onEdit, contextOnly = false, unlinked = false }: { record: RecordRow; childrenRecords?: RecordRow[]; allRecords: RecordRow[]; onEdit: Edit; contextOnly?: boolean; unlinked?: boolean }) {
  const checks = allRecords.filter(r => r.kind === 'check' && r.project_id === record.project_id && r.data.permit_id === record.id);
  const linked = allRecords.filter(r => r.kind === 'task' && r.project_id === record.project_id && (r.data.prerequisite_ids || []).includes(record.id));
  const owner = allRecords.find(r => r.kind === 'contact' && r.id === record.owner_id)?.title;
  const d = record.data, type = d.permit_type, tone = permitTone(record);
  const Icon = type === 'Master' ? Building2 : type === 'Subpermit' ? CornerDownRight : FileText;
  return <article className={`permit-card ${type === 'Subpermit' ? 'subpermit' : ''} ${type === 'Master' ? 'master-permit' : ''}`} aria-label={`${type || 'Permit'} ${d.permit_number || record.title}`}>
    <div className="permit-card-heading"><div className="permit-identity"><span className={`permit-type ${type === 'Master' ? 'master' : type === 'Subpermit' ? 'sub' : 'standalone'}`}><Icon size={18} aria-hidden="true"/>{type || 'Type unconfirmed'}</span><button onClick={() => onEdit(record)} className="permit-title"><strong>{record.title}</strong><span>{d.permit_number || 'Number unconfirmed'} · {d.trade || 'Discipline unconfirmed'}</span></button></div><Badge tone={tone}>{record.status}{tone === 'unknown' && record.status !== 'Unknown' ? ' · needs evidence' : ''}</Badge></div>
    {contextOnly && <p className="permit-context">Master shown for context; a subpermit matches your filter.</p>}
    {unlinked && <p className="permit-link-warning"><CircleAlert size={18}/>Permit relationship needs review. Its master link is missing or inconsistent.</p>}
    <p className="permit-small">{d.jurisdiction || 'Jurisdiction unconfirmed'}{d.raw_status ? ` · Official label: ${d.raw_status}` : ''}</p>
    {d.automation_paused && <p className="permit-protected">Manual correction protected · Rocky must request review.</p>}
    {!TERMINAL_PERMITS.has(record.status) && <div className="permit-next"><strong>Next step</strong><p>{d.next_action || 'Not recorded — confirm what is needed to move this permit forward.'}</p><span>{owner || 'Owner not assigned'} · {d.next_action_date || 'Date not set'}</span></div>}
    {d.corrections && <p className="permit-link-warning">{d.corrections}</p>}
    <div className="permit-facts"><span>Issued: <strong>{d.issued_date || 'Unconfirmed'}</strong></span>{record.status === 'Closed' ? <span>Closed: <strong>{d.closed_date || 'Date unconfirmed'}</strong></span> : <span>Expires: <strong>{d.expiry_date || 'Unconfirmed'}</strong></span>}<span>Last observed: {timestamp(d.source_observed_at)}</span></div>
    <details className="permit-details"><summary>Checks & verification · {checks.filter(c => c.status === 'Passed' && checkTone(c) === 'complete').length} passed / {checks.length} recorded</summary>{checks.length ? <CheckList records={checks} onEdit={onEdit}/> : <p>No checks recorded. Required inspections and certificate requirements still need to be confirmed.</p>}<p className="permit-small">Counts describe recorded checks, not a complete list of required inspections.</p></details>
    <details className="permit-details"><summary>Source evidence & details</summary><SourceLink url={d.source_url}/><p className="permit-evidence">{d.evidence || 'Source evidence not recorded.'}</p><div className="permit-facts"><span>Last worker verification: {timestamp(d.last_verified_at)}</span>{d.application_date && <span>Applied: {d.application_date}</span>}{d.fees_due !== undefined && d.fees_due !== null && d.fees_due !== '' && <span>Recorded fees due: {Number(d.fees_due).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>}</div>{d.applicability_reason && <p>{d.applicability_reason}</p>}{d.notes && <p className="permit-evidence">{d.notes}</p>}{linked.length > 0 && <div className="permit-inspections"><strong>Work depending on this permit</strong>{linked.map(r => <button key={r.id} onClick={() => onEdit(r)}>{r.title} · {r.status}</button>)}</div>}</details>
    {type === 'Master' && <section className="permit-children" aria-label={`Subpermits under ${d.permit_number}`}><h3><CornerDownRight size={18}/>Subpermits under this master ({childrenRecords.length} shown)</h3>{childrenRecords.length ? childrenRecords.map(child => <PermitCard key={child.id} record={child} allRecords={allRecords} onEdit={onEdit}/>) : <p className="permit-small">No subpermits shown. Confirm required trades and related records with the issuing authority.</p>}</section>}
  </article>;
}
function MonitorForm({project,monitor,canWrite,onSaved}:{project:Project;monitor?:PermitMonitor;canWrite:boolean;onSaved:()=>Promise<void>}) {
  const {request}=useWorkspaceRuntime();const [jurisdiction,setJurisdiction]=useState(monitor?.jurisdiction||''),[url,setUrl]=useState(monitor?.source_url||''),[enabled,setEnabled]=useState(monitor?.enabled!==false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setNotice('');try{const checkNow=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='check';await request('/api/permits/monitor',{method:'PATCH',body:JSON.stringify({project_id:project.id,version:monitor?.version||0,settings:{enabled,jurisdiction,source_url:url,check_now:checkNow}})});setNotice(checkNow?'Queued for the next worker run.':'Monitoring settings saved.');await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form onSubmit={save}><div className="form-grid"><label className="field"><span>Jurisdiction</span><input disabled={!canWrite} value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)} maxLength={200}/></label><label className="field"><span>Official permit portal</span><input type="url" placeholder="https://…" disabled={!canWrite} value={url} onChange={e=>setUrl(e.target.value)}/></label></div><label className="checkbox-field"><input type="checkbox" disabled={!canWrite} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>Include this property in hourly checks</span></label><p className="muted">Completed, archived and demo properties are excluded automatically. Leave the source blank for Rocky to discover it. Scheduling is managed on Rocky’s Mac.</p>{error&&<p role="alert" className="alert error">{error}</p>}{notice&&<p role="status">{notice}</p>}{canWrite&&<div className="button-row"><button className="button" disabled={busy}>Save settings</button><button className="button" value="check" disabled={busy||!enabled||!eligibleProject(project)}>Queue next check</button></div>}</form>;
}
