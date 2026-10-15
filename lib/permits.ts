import type { Project, RecordInput, RecordRow } from './domain';

export const PERMIT_STATUSES = ['Unknown', 'Applied', 'In review', 'Corrections required', 'Approved', 'Issued', 'Active', 'Final inspections', 'On hold', 'Expired', 'Closed', 'Cancelled', 'Not required'] as const;
export const TERMINAL_PERMITS = new Set(['Closed', 'Cancelled', 'Not required']);
export const CHECK_OUTCOMES = ['success', 'no_permits', 'partial', 'blocked', 'error'] as const;
export type PermitMonitor = {
  project_id: string; workspace_id: string; enabled: boolean; jurisdiction: string; source_url: string;
  version: number; last_attempt_at: string | null; last_success_at: string | null; next_check_at: string | null;
  last_outcome: string | null; last_summary: string; failure_count: number;
};
export type PermitRun = {
  id: string; project_id: string; workspace_id: string; actor_id: string; request_key: string;
  status: string; started_at: string; lease_expires_at: string; finished_at: string | null;
  summary: string; source_url: string; result?: { records: RecordRow[] }; payload_hash?: string;
};
export function eligibleProject(project: Pick<Project, 'status' | 'is_demo'>) {
  return !project.is_demo && !['complete', 'completed', 'past job', 'archived', 'cancelled', 'canceled'].includes(project.status.trim().toLowerCase());
}
export function safePermitUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function permitSatisfied(record: Pick<RecordRow, 'status' | 'data'>) {
  if (record.status === 'Not required') return Boolean(record.data.applicability_reason?.trim());
  return ['Issued', 'Active', 'Final inspections', 'Closed'].includes(record.status) && Boolean(record.data.evidence?.trim()) && safePermitUrl(record.data.source_url);
}
export function validatePermit(raw: Record<string, unknown>) {
  const d = (raw.data || {}) as Record<string, any>;
  if (!raw.project_id) throw Error('A permit must belong to a property.');
  for (const key of ['permit_number', 'jurisdiction']) if (typeof d[key] !== 'string' || !d[key].trim() || d[key].length > 200) throw Error('A permit needs its number and jurisdiction. Unknown permits belong in the property monitoring queue until identified.');
  if (!['Master', 'Subpermit', 'Standalone'].includes(d.permit_type)) throw Error('Choose Master, Subpermit or Standalone.');
  if ((d.permit_type === 'Subpermit') !== Boolean(d.parent_permit_id)) throw Error('Only a subpermit must link to its master permit.');
  if (d.source_url && !safePermitUrl(d.source_url)) throw Error('Use an HTTPS source URL without embedded credentials.');
  if (raw.status && raw.status !== 'Unknown' && (!safePermitUrl(d.source_url) || typeof d.evidence !== 'string' || !d.evidence.trim())) throw Error('A known permit status needs its official source URL and evidence.');
  if (raw.status === 'Not required' && !d.applicability_reason?.trim()) throw Error('Explain why the permit is not required.');
  if (d.issued_date && d.expiry_date && d.expiry_date < d.issued_date) throw Error('Expiration cannot precede issuance.');
}
export function validatePermitLinks(previous: RecordRow, next: RecordInput, records: RecordRow[]) {
  const d = next.data || {}, project = next.project_id ?? previous.project_id;
  for (const key of ['parent_permit_id', 'permit_id']) if (d[key]) {
    const parent = records.find(r => r.id === d[key]);
    if (!parent || parent.kind !== 'permit' || parent.project_id !== project || parent.id === previous.id) throw Error('Choose a permit in the same property.');
    if (key === 'parent_permit_id' && parent.data.permit_type !== 'Master') throw Error('Subpermits must link to a master permit.');
    if (key === 'parent_permit_id' && parent.status === 'Closed' && !TERMINAL_PERMITS.has(next.status || 'Unknown')) throw Error('Reopen the master permit before adding or reopening a subpermit.');
  }
  if (next.kind === 'permit') {
    const children = records.filter(r => r.kind === 'permit' && r.data.parent_permit_id === previous.id);
    if (children.length && d.permit_type !== 'Master') throw Error('A permit with subpermits must remain a master permit.');
    if (next.status === 'Closed' && children.some(r => !TERMINAL_PERMITS.has(r.status))) throw Error('Resolve open subpermits before closing the master permit.');
  }
}
export function monitorState(project: Project, monitor: PermitMonitor | undefined, run: PermitRun | undefined, now = Date.now()) {
  if (!eligibleProject(project)) return 'Finished';
  if (monitor?.enabled === false) return 'Paused';
  if (run?.status === 'running') return Date.parse(run.lease_expires_at) > now ? 'Checking' : 'Interrupted';
  if (monitor?.last_outcome && !['success', 'no_permits'].includes(monitor.last_outcome)) return 'Needs attention';
  if (!monitor?.last_success_at) return monitor?.source_url ? 'Awaiting first check' : 'Needs source';
  if (now - Date.parse(monitor.last_success_at) > 2 * 60 * 60 * 1000) return 'Stale';
  return monitor.last_outcome === 'no_permits' ? 'No permits found' : 'Up to date';
}
export function permitQueue(projects: Project[], monitors: PermitMonitor[], runs: PermitRun[], records: RecordRow[], now = Date.now()) {
  return projects.filter(eligibleProject).map(project => {
    const monitor = monitors.find(m => m.project_id === project.id);
    const run = runs.find(r => r.project_id === project.id && r.status === 'running' && Date.parse(r.lease_expires_at) > now);
    const due = monitor?.enabled !== false && !run && (!monitor?.next_check_at || Date.parse(monitor.next_check_at) <= now);
    return { project, monitor: monitor || null, due, needs_source: !monitor?.source_url, state: monitorState(project, monitor, run, now), records: records.filter(r => r.project_id === project.id && ['permit', 'check'].includes(r.kind)) };
  }).filter(item => item.due);
}
