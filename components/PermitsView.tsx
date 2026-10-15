'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, ExternalLink, ShieldCheck, Clock3 } from 'lucide-react';
import type { Bootstrap, Project, RecordRow } from '@/lib/domain';
import { eligibleProject, monitorState, safePermitUrl, TERMINAL_PERMITS, type PermitMonitor, type PermitRun } from '@/lib/permits';
import { useWorkspaceRuntime } from './WorkspaceRuntime';
const timestamp = (v?: string | null) => v ? new Date(v).toLocaleString() : 'Never';
const attention = (s: string) => ['Needs attention','Needs source','Interrupted','Stale'].includes(s);
type Monitoring = {monitors:PermitMonitor[];runs:PermitRun[]};
export function PermitMilestones({records,onEdit}:{records:RecordRow[];onEdit:(r:RecordRow)=>void}) {
  const permits=records.filter(r=>r.kind==='permit' && !TERMINAL_PERMITS.has(r.status));
  const events=permits.flatMap(r=>[['next_action_date',r.data.next_action||'Next action'],['expiry_date','Permit expires']].filter(([key])=>r.data[key]).map(([key,label])=>({record:r,date:String(r.data[key]),label}))).sort((a,b)=>a.date.localeCompare(b.date));
  if(!events.length) return null;
  return <section className="permit-milestones" aria-label="Permit dates"><strong>Permit dates</strong>{events.map(e=><button className="button" key={e.record.id+e.label} onClick={()=>onEdit(e.record)}><Clock3 size={17}/><span>{e.date} · {e.record.data.permit_number} · {e.label}</span></button>)}</section>;
}
export default function PermitsView({data,projectId,onEdit,onAdd,canWrite}:{data:Bootstrap;projectId:string;onEdit:(r:RecordRow)=>void;onAdd:()=>void;canWrite:boolean}) {
  const {request,isShowcase}=useWorkspaceRuntime();
  const [monitoring,setMonitoring]=useState<Monitoring>({monitors:[],runs:[]}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('active'),[search,setSearch]=useState('');
  const refresh=useCallback(async()=>{if(isShowcase)return;try{setMonitoring(await request<Monitoring>('/api/permits'));setError('');}catch(e){setError((e as Error).message);}},[request,isShowcase]);
  useEffect(()=>{let active=true;const load=async()=>{if(!active||document.visibilityState==='hidden'||isShowcase)return;try{const result=await request<Monitoring>('/api/permits');if(active){setMonitoring(result);setError('');}}catch(e){if(active)setError((e as Error).message);}};void load();const interval=setInterval(load,30000);document.addEventListener('visibilitychange',load);return()=>{active=false;clearInterval(interval);document.removeEventListener('visibilitychange',load);};},[request,isShowcase]);
  const projects=data.projects.filter(p=>(isShowcase||!p.is_demo)&&p.status!=='Archived'&&(projectId==='all'||p.id===projectId));
  const stateFor=(p:Project)=>monitorState(p,monitoring.monitors.find(m=>m.project_id===p.id),monitoring.runs.find(r=>r.project_id===p.id&&r.status==='running'));
  const permits=data.records.filter(r=>r.kind==='permit'&&projects.some(p=>p.id===r.project_id));
  const visible=projects.filter(p=>(filter!=='active'||isShowcase||eligibleProject(p))&&(filter!=='attention'||attention(stateFor(p)))&&(!search||`${p.name} ${p.address} ${permits.filter(r=>r.project_id===p.id).map(r=>`${r.title} ${r.status} ${r.data.permit_number}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  return <div className="permits-view">
    <div className="permit-intro"><div><h2>Permits across your properties</h2><p>Master permits, subpermits and inspections, with the source and last verified update. Rocky’s hourly checks appear here once its runner is enabled.</p></div>{canWrite&&<button className="button primary" onClick={onAdd}><Plus size={18}/>Add permit</button>}</div>
    {error&&<div className="alert error" role="alert">{error}<button onClick={refresh}>Retry</button></div>}
    {notice&&<p role="status">{notice}</p>}
    <div className="permit-stats"><div><strong>{projects.filter(eligibleProject).length}</strong><span>Active properties</span></div><div><strong>{permits.filter(p=>!TERMINAL_PERMITS.has(p.status)).length}</strong><span>Open permits</span></div><div><strong>{projects.filter(p=>attention(stateFor(p))).length}</strong><span>Need attention</span></div></div>
    <div className="permit-filters"><input aria-label="Search properties or permits" placeholder="Search property, permit or status…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Monitoring filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active properties</option><option value="attention">Needs attention</option><option value="all">All properties</option></select></div>
    {!visible.length&&<div className="panel permit-empty"><ShieldCheck size={30}/><h3>{projects.length?'No matching properties':'Add your first property'}</h3><p>{projects.length?'Change the filter or search to see more properties.':'New real properties automatically join Rocky’s permit queue. Add them in Projects or send them to Rocky.'}</p></div>}
    {visible.map(project=>{const monitor=monitoring.monitors.find(m=>m.project_id===project.id),runs=monitoring.runs.filter(r=>r.project_id===project.id),items=permits.filter(r=>r.project_id===project.id),state=stateFor(project);return <section key={project.id} className="panel permit-property">
      <header><div><h2>{project.name}</h2><p>{project.address||'Address needed for permit lookup'}</p></div><span className={`permit-state ${attention(state)?'attention':''}`}>{state}</span></header>
      <div className="permit-check-summary"><span>Last attempt: {timestamp(monitor?.last_attempt_at)}</span><span>Last successful check: {timestamp(monitor?.last_success_at)}</span><span>Next due: {monitor?.enabled===false?'Paused':monitor?.next_check_at?timestamp(monitor.next_check_at):'Next worker run'}</span></div>
      {monitor?.last_summary&&<p className="permit-summary">{monitor.last_summary}</p>}
      {!items.length&&<p className="permit-empty-note">No permit records yet. Rocky can discover permits using this property’s address and official jurisdiction portal. A failed search will never be treated as an approval.</p>}
      <div className="permit-tree">{items.filter(r=>!r.data.parent_permit_id).map(record=><PermitCard key={record.id} record={record} childrenRecords={items.filter(c=>c.data.parent_permit_id===record.id)} allRecords={data.records} onEdit={onEdit}/>)}</div>
      <details className="permit-settings"><summary>Monitoring source and settings</summary><MonitorForm key={`${project.id}-${monitor?.version||0}`} project={project} monitor={monitor} canWrite={canWrite&&!isShowcase} onSaved={async()=>{await refresh();setNotice('Monitoring settings saved. Queued checks run when Rocky next polls.');}}/></details>
      <details className="permit-history"><summary>Check history ({runs.length})</summary>{!runs.length?<p>No checks have run yet.</p>:runs.map(run=><article key={run.id}><strong>{run.status==='running'&&Date.parse(run.lease_expires_at)<Date.now()?'interrupted':run.status.replaceAll('_',' ')}</strong><time>{timestamp(run.started_at)}</time><p>{run.summary||'Check started; awaiting results.'}</p><SourceLink url={run.source_url}/></article>)}</details>
    </section>;})}
  </div>;
}
function SourceLink({url}:{url?:string}) {return safePermitUrl(url)?<a className="permit-source" href={url} target="_blank" rel="noopener noreferrer">Official source <ExternalLink size={15}/></a>:null;}
function PermitCard({record,childrenRecords=[],allRecords,onEdit}:{record:RecordRow;childrenRecords?:RecordRow[];allRecords:RecordRow[];onEdit:(r:RecordRow)=>void}) {
  const inspections=allRecords.filter(r=>r.kind==='check'&&r.data.permit_id===record.id),linked=allRecords.filter(r=>r.kind==='task'&&(r.data.prerequisite_ids||[]).includes(record.id));
  return <article className={`permit-card ${record.data.parent_permit_id?'subpermit':''}`}><div className="permit-card-heading"><button onClick={()=>onEdit(record)} className="permit-title"><span>{record.data.permit_type} · {record.data.permit_number}</span><strong>{record.title}</strong></button><span className={`permit-status ${/hold|expired|corrections/i.test(record.status)?'attention':''}`}>{record.status}</span></div>
    <p>{record.data.jurisdiction}{record.data.trade?` · ${record.data.trade}`:''}{record.data.raw_status?` · Source status: ${record.data.raw_status}`:''}</p>
    {record.data.automation_paused&&<p className="permit-protected">Manual correction protected · Rocky must request review.</p>}
    <div className="permit-facts"><span>Issued: {record.data.issued_date||'Unconfirmed'}</span><span>Expires: {record.data.expiry_date||'Unconfirmed'}</span><span>Verified: {timestamp(record.data.last_verified_at)}</span></div>
    {record.data.next_action&&<p><strong>Next:</strong> {record.data.next_action}{record.data.next_action_date?` · ${record.data.next_action_date}`:''}</p>}
    {record.data.corrections&&<p className="permit-protected">{record.data.corrections}</p>}
    <SourceLink url={record.data.source_url}/>
    {record.data.evidence&&<details><summary>Source evidence</summary><p className="permit-evidence">{record.data.evidence}</p></details>}
    {inspections.length>0&&<div className="permit-inspections"><strong>Inspections</strong>{inspections.map(r=><button key={r.id} onClick={()=>onEdit(r)}><span>{r.title}</span><span>{r.status} · {r.data.scheduled_date||r.data.result_date||'Date unconfirmed'}</span></button>)}</div>}
    {linked.length>0&&<div className="permit-inspections"><strong>Work depending on this permit</strong>{linked.map(r=><button key={r.id} onClick={()=>onEdit(r)}>{r.title} · {r.status}</button>)}</div>}
    {childrenRecords.map(child=><PermitCard key={child.id} record={child} allRecords={allRecords} onEdit={onEdit}/>)}</article>;
}
function MonitorForm({project,monitor,canWrite,onSaved}:{project:Project;monitor?:PermitMonitor;canWrite:boolean;onSaved:()=>Promise<void>}) {
  const {request}=useWorkspaceRuntime();const [jurisdiction,setJurisdiction]=useState(monitor?.jurisdiction||''),[url,setUrl]=useState(monitor?.source_url||''),[enabled,setEnabled]=useState(monitor?.enabled!==false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setNotice('');try{const checkNow=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='check';await request('/api/permits/monitor',{method:'PATCH',body:JSON.stringify({project_id:project.id,version:monitor?.version||0,settings:{enabled,jurisdiction,source_url:url,check_now:checkNow}})});setNotice(checkNow?'Queued for the next worker run.':'Monitoring settings saved.');await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form onSubmit={save}><div className="form-grid"><label className="field"><span>Jurisdiction</span><input disabled={!canWrite} value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)} maxLength={200}/></label><label className="field"><span>Official permit portal</span><input type="url" placeholder="https://…" disabled={!canWrite} value={url} onChange={e=>setUrl(e.target.value)}/></label></div><label className="checkbox-field"><input type="checkbox" disabled={!canWrite} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>Include this property in hourly checks</span></label><p className="muted">Completed, archived and demo properties are excluded automatically. Leave the source blank for Rocky to discover it. Scheduling is managed on Rocky’s Mac.</p>{error&&<p role="alert" className="alert error">{error}</p>}{notice&&<p role="status">{notice}</p>}{canWrite&&<div className="button-row"><button className="button" disabled={busy}>Save settings</button><button className="button" value="check" disabled={busy||!enabled||!eligibleProject(project)}>Queue next check</button></div>}</form>;
}
