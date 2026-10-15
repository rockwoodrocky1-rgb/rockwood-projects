import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../lib/domain';
import { checkTone, needsPermitVerification, permitActions, permitGroups, permitTone } from '../lib/permit-presentation';
const permit = (id: string, status = 'Active', data: Record<string, unknown> = {}, project = 'house'): RecordRow => ({
  id, project_id: project, workspace_id: 'workspace', kind: 'permit', title: id, status, owner_id: null, due_date: null, version: 1, created_at: '', updated_at: '',
  data: { permit_type: 'Master', permit_number: id, source_url: 'https://example.gov/permits', evidence: 'Official result', ...data },
});
describe('permit view decisions', () => {
  it('keeps issued/approved/final permits unfinished and cancellation separate from closure', () => {
    for (const status of ['Applied', 'In review', 'Approved', 'Issued', 'Active', 'Final inspections']) expect(permitTone(permit('main', status))).toBe('pending');
    expect(permitTone(permit('main', 'Closed'))).toBe('complete');
    for (const status of ['Cancelled', 'Not required']) expect(permitTone(permit('main', status))).toBe('neutral');
    for (const status of ['Expired', 'Corrections required', 'On hold']) expect(permitTone(permit('main', status))).toBe('blocked');
  });
  it('does not present unsupported closure or incomplete inspection passes as verified', () => {
    const unverified = permit('main', 'Closed', { evidence: '' });
    expect(needsPermitVerification(unverified)).toBe(true); expect(permitTone(unverified)).toBe('unknown');
    const check = { ...permit('inspection', 'Passed', { result_date: '2026-10-01', applicability: 'Required' }), kind: 'check' as const };
    expect(checkTone(check)).toBe('unknown');
    expect(checkTone({ ...check, data: { ...check.data, inspector: 'Official reviewer' } })).toBe('complete');
    expect(checkTone({ ...check, data: { ...check.data, inspector: 'Official reviewer', evidence: '', document_ids: ['evidence-file'] } })).toBe('complete');
    expect(checkTone({ ...check, data: { ...check.data, inspector: 'Official reviewer', applicability: 'Needs confirming' } })).toBe('unknown');
  });
  it('retains the master context when a child matches search or status filters', () => {
    const master = permit('building');
    const child = permit('ELEC-42', 'Corrections required', { permit_type: 'Subpermit', parent_permit_id: master.id, trade: 'Electrical' });
    const closed = permit('plumbing', 'Closed', { permit_type: 'Subpermit', parent_permit_id: master.id });
    const records = [master, child, closed];
    expect(permitGroups(records, 'Electrical')).toMatchObject([{ record: { id: 'building' }, contextOnly: true, children: [{ id: 'ELEC-42' }] }]);
    expect(permitGroups(records, '', 'blocked')).toMatchObject([{ contextOnly: true, children: [{ id: 'ELEC-42' }] }]);
    expect(permitGroups(records, '', 'unfinished')[0].children).toHaveLength(1);
    expect(permitGroups(records, 'building')[0].children).toHaveLength(2);
  });
  it('never hides orphaned, malformed or cross-property subpermits', () => {
    const records = [permit('master'), permit('orphan', 'Active', { permit_type: 'Subpermit', parent_permit_id: 'missing' }), permit('wrong-house', 'Active', { permit_type: 'Subpermit', parent_permit_id: 'master' }, 'other'), permit('no-parent', 'Unknown', { permit_type: 'Subpermit' })];
    const groups = permitGroups(records);
    expect(groups).toHaveLength(4); expect(groups.filter(g => g.unlinked)).toHaveLength(3);
  });
  it('prioritizes failed checks and blockers while respecting observed dates without changing statuses', () => {
    const active = permit('main', 'Active', { expiry_date: '2026-10-14', next_action: 'Confirm inspection' });
    const blocked = permit('correction', 'Corrections required', { next_action: 'Submit verified revision' });
    const failed = { ...permit('inspection', 'Failed', { findings: 'Missing approved drawing', reinspection_date: '2026-10-20' }), kind: 'check' as const };
    const actions = permitActions([active, permit('closed', 'Closed'), failed, blocked], '2026-10-15');
    expect(actions).toHaveLength(3); expect(actions[0].priority).toBe(0);
    expect(actions.find(a => a.record.id === 'main')?.message).toContain('Verify current validity');
    expect(active.status).toBe('Active'); expect(actions.find(a => a.record.id === 'inspection')?.date).toBe('2026-10-20');
  });
  it('surfaces missing next actions and unconfirmed checks without inventing requirements', () => {
    const actions = permitActions([permit('open'), { ...permit('check', 'Needs confirming'), kind: 'check' }], '2026-10-15');
    expect(actions.map(a => a.message).join(' ')).toMatch(/Next action not recorded/);
    expect(actions.map(a => a.message).join(' ')).toMatch(/Confirm whether this check is required/);
    expect(actions.every(a => a.date === undefined)).toBe(true);
  });
});
