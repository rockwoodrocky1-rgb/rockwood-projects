import { checkSatisfied, type RecordRow } from './domain';
import { safePermitUrl, TERMINAL_PERMITS } from './permits';

export type PermitTone = 'pending' | 'blocked' | 'complete' | 'unknown' | 'neutral';
export type PermitFilter = 'all' | 'unfinished' | 'blocked' | 'unverified' | 'closed';
const BLOCKED = new Set(['Corrections required', 'On hold', 'Expired']);
export function needsPermitVerification(record: RecordRow) {
  return record.status === 'Unknown' || !safePermitUrl(record.data.source_url) || !String(record.data.evidence || '').trim();
}
export function permitTone(record: RecordRow): PermitTone {
  if (BLOCKED.has(record.status)) return 'blocked';
  if (needsPermitVerification(record)) return 'unknown';
  if (record.status === 'Closed') return 'complete';
  if (TERMINAL_PERMITS.has(record.status)) return 'neutral';
  return 'pending';
}
export function checkTone(record: RecordRow): PermitTone {
  if (record.status === 'Failed') return 'blocked';
  if (record.status === 'Not applicable') return 'neutral';
  if (record.status === 'Passed') return record.data.applicability === 'Required' && checkSatisfied(record) ? 'complete' : 'unknown';
  return record.status === 'Needs confirming' ? 'unknown' : 'pending';
}
export function permitMatches(record: RecordRow, query: string, filter: PermitFilter) {
  if (filter === 'unfinished' && TERMINAL_PERMITS.has(record.status)) return false;
  if (filter === 'blocked' && !BLOCKED.has(record.status)) return false;
  if (filter === 'unverified' && !needsPermitVerification(record)) return false;
  if (filter === 'closed' && record.status !== 'Closed') return false;
  return `${record.title} ${record.status} ${record.data.permit_number || ''} ${record.data.trade || ''} ${record.data.jurisdiction || ''} ${record.data.raw_status || ''} ${record.data.permit_type || ''}`.toLowerCase().includes(query.trim().toLowerCase());
}
export type PermitGroup = { record: RecordRow; children: RecordRow[]; contextOnly: boolean; unlinked: boolean };
export function permitGroups(records: RecordRow[], query = '', filter: PermitFilter = 'all'): PermitGroup[] {
  const permits = records.filter(r => r.kind === 'permit');
  const roots = permits.filter(r => !r.data.parent_permit_id && ['Master', 'Standalone'].includes(r.data.permit_type));
  const included = new Set(roots.map(r => r.id));
  const groups = roots.map(record => {
    const children = permits.filter(r => r.data.permit_type === 'Subpermit' && r.data.parent_permit_id === record.id && r.project_id === record.project_id && record.data.permit_type === 'Master');
    children.forEach(r => included.add(r.id));
    return { record, children, contextOnly: false, unlinked: false };
  });
  // A missing or malformed parent must never make a permit disappear from the view.
  for (const record of permits.filter(r => !included.has(r.id))) groups.push({ record, children: [], contextOnly: false, unlinked: true });
  return groups.flatMap(group => {
    const matches = permitMatches(group.record, query, filter);
    const children = group.children.filter(r => permitMatches(r, query, filter) || (matches && filter === 'all'));
    return matches || children.length ? [{ ...group, children, contextOnly: !matches }] : [];
  });
}
export type PermitAction = { record: RecordRow; message: string; tone: PermitTone; priority: number; date?: string };
export function permitActions(records: RecordRow[], today: string): PermitAction[] {
  return records.flatMap((record): PermitAction[] => {
    const d = record.data;
    if (record.kind === 'check') {
      if (record.status === 'Failed') return [{ record, message: d.findings || 'Review the failed check and confirm corrections or reinspection.', tone: 'blocked', priority: 0, date: d.reinspection_date }];
      if (record.status === 'Passed' && checkTone(record) === 'unknown') return [{ record, message: 'Confirm applicability, result date, reviewer and evidence for this recorded pass.', tone: 'unknown', priority: 1 }];
      if (record.status === 'Needs confirming') return [{ record, message: 'Confirm whether this check is required and what evidence is missing.', tone: 'unknown', priority: 2 }];
      if (['Waiting', 'Scheduled'].includes(record.status)) return [{ record, message: record.status === 'Scheduled' ? 'Verify the scheduled check and record its actual result.' : 'Confirm the next step for this pending check.', tone: 'pending', priority: 3, date: d.scheduled_date }];
      return [];
    }
    if (record.kind !== 'permit') return [];
    if (needsPermitVerification(record)) return [{ record, message: 'Verify the official status and add its source evidence.', tone: 'unknown', priority: 1 }];
    if (TERMINAL_PERMITS.has(record.status)) return [];
    if (BLOCKED.has(record.status)) return [{ record, message: d.next_action || d.corrections || (record.status === 'Expired' ? 'Confirm the authority’s requirements to resolve the expired permit.' : 'Review the restriction and record the next action.'), tone: 'blocked', priority: 0, date: d.next_action_date }];
    if (d.automation_paused) return [{ record, message: 'Review the protected manual correction before Rocky updates this permit.', tone: 'pending', priority: 1 }];
    if (d.expiry_date && d.expiry_date <= today) return [{ record, message: 'Recorded expiration date reached. Verify current validity or an extension.', tone: 'pending', priority: 1, date: d.expiry_date }];
    return [{ record, message: d.next_action || 'Next action not recorded. Confirm the remaining requirements.', tone: 'pending', priority: d.next_action_date && d.next_action_date < today ? 1 : d.next_action ? 3 : 2, date: d.next_action_date }];
  }).sort((a, b) => a.priority - b.priority || (a.date || '9999').localeCompare(b.date || '9999') || a.record.title.localeCompare(b.record.title));
}
