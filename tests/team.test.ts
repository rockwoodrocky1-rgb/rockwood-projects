import { describe, expect, it } from 'vitest';
import { KIND_CONFIG, scheduleWarnings, validateRecord, validateTransition, type RecordRow } from '../lib/domain';
import { validateRelationships } from '../lib/server';
import { createShowcaseClient } from '../lib/showcase';
import { ALL, UNASSIGNED, awaitsApplicability, isTeamMember, leadLoads, matchesPeople, person, subKeys, subLoads, subsOf } from '../lib/team';

function row(id: string, kind: RecordRow['kind'], title: string, extra: Partial<RecordRow> = {}): RecordRow {
  return { id, kind, title, status: kind === 'contact' ? 'Active' : 'Ready', workspace_id: 'w', project_id: kind === 'contact' ? null : 'p', owner_id: null, due_date: null, data: {}, version: 1, created_at: '', updated_at: '', ...extra };
}
const chris = row('chris', 'contact', 'Chris Rivas', { data: { role: 'Team member' } });
const mike = row('mike', 'contact', 'Mike V', { data: { trade: 'Team member' } });
const carlos = row('carlos', 'contact', 'Carlos (Outdoor Kitchen)', { data: { trade: 'Outdoor Kitchen', role: 'Contractor' } });
const rene = row('rene', 'contact', 'Rene', { data: { trade: 'Plumbing' } });
const loose = row('loose', 'contact', 'Pat');
const contacts = [chris, mike, carlos, rene, loose];
const today = '2026-10-17';

describe('office team view', () => {
  it('counts open work per office lead, keeps team members visible and puts unassigned last', () => {
    const tasks = [
      row('t1', 'task', 'Framing walk', { owner_id: 'mike', due_date: '2026-10-20', data: { contractor_id: 'carlos' } }),
      row('t2', 'task', 'Kitchen outlets', { owner_id: 'mike', status: 'Waiting', due_date: '2026-10-10', data: { applicability: 'Needs confirming' } }),
      row('t3', 'task', 'Done already', { owner_id: 'mike', status: 'Done' }),
      row('t4', 'task', 'Not needed', { owner_id: 'chris', status: 'Not applicable', data: { applicability: 'Not applicable', applicability_reason: 'No pool' } }),
      row('t5', 'task', 'Nobody yet', { status: 'Waiting' }),
      row('t6', 'task', 'Deleted contact', { owner_id: 'gone' }),
    ];
    const loads = leadLoads(tasks, contacts, today);
    expect(loads.map(load => [load.id, load.open, load.needsAnswer, load.overdue, load.nextDue])).toEqual([
      ['chris', 0, 0, 0, null],
      ['mike', 2, 1, 1, '2026-10-20'],
      [UNASSIGNED, 2, 0, 0, null],
    ]);
    expect(loads.find(load => load.id === 'mike')?.name).toBe('Mike V');
  });

  it('looks forward for "next due" and leaves past dates to the overdue count', () => {
    const tasks = [
      row('a', 'task', 'Late', { owner_id: 'chris', due_date: '2026-10-01' }),
      row('b', 'task', 'Today', { owner_id: 'chris', due_date: today }),
      row('c', 'task', 'Later', { owner_id: 'chris', due_date: '2026-11-02' }),
    ];
    const chrisLoad = leadLoads(tasks, contacts, today).find(load => load.id === 'chris');
    expect([chrisLoad?.overdue, chrisLoad?.nextDue]).toEqual([1, today]);
    const onlyLate = leadLoads([tasks[0]], contacts, today).find(load => load.id === 'chris');
    expect([onlyLate?.overdue, onlyLate?.nextDue]).toEqual([1, null]);
  });

  it('hides the unassigned lead card when every open item has a lead, and marks owners who are not office staff', () => {
    expect(leadLoads([row('t1', 'task', 'A', { owner_id: 'chris' })], contacts, today).map(load => load.id)).toEqual(['chris', 'mike']);
    const crewAsOwner = leadLoads([row('t1', 'task', 'A', { owner_id: 'carlos' })], contacts, today);
    expect(crewAsOwner.map(load => [load.id, load.isTeam])).toEqual([['chris', true], ['mike', true], ['carlos', false]]);
  });

  it('shows how many jobs each sub or crew has, with "no sub yet" last', () => {
    const tasks = [
      row('t1', 'task', 'Outdoor kitchen footing', { owner_id: 'mike', data: { contractor_id: 'carlos' } }),
      row('t2', 'task', 'Outdoor kitchen block', { owner_id: 'chris', data: { contractor_id: 'carlos' } }),
      row('t3', 'task', 'Grill gas line', { owner_id: 'chris', data: { contractor_id: 'carlos' } }),
      row('t4', 'task', 'Island PVC', { owner_id: 'mike', data: { contractor_id: 'rene' } }),
      row('t5', 'task', 'Unclear', { owner_id: 'mike' }),
    ];
    const subs = subLoads(tasks, contacts, today);
    expect(subs.map(load => [load.name, load.group, load.open])).toEqual([
      ['Carlos', 'Outdoor Kitchen', 3], ['Rene', 'Plumbing', 1], ['Unassigned', '', 1],
    ]);
    expect(subs.at(-1)?.id).toBe(UNASSIGNED);
    expect(tasks.filter(task => matchesPeople(task, contacts, 'chris', 'carlos')).map(task => task.id)).toEqual(['t2', 't3']);
    expect(tasks.filter(task => matchesPeople(task, contacts, ALL, UNASSIGNED)).map(task => task.id)).toEqual(['t5']);
    expect(tasks.filter(task => matchesPeople(task, contacts, ALL, ALL))).toHaveLength(5);
  });

  it('counts a shared job once for every sub on it, all equal, and finds it under any of them', () => {
    const cesar = row('cesar', 'contact', 'Cesar (Shell)', { data: { trade: 'Shell' } });
    const ricardo = row('ricardo', 'contact', 'Ricardo Diaz', { data: { trade: 'Trusses' } });
    const people = [...contacts, cesar, ricardo];
    const tasks = [
      row('t1', 'task', 'Trusses measurement', { owner_id: 'chris', data: { contractor_id: 'cesar', other_contractor_ids: ['ricardo', 'cesar', 'ricardo', 'gone'] } }),
      row('t2', 'task', 'Truss delivery', { owner_id: 'chris', data: { contractor_id: 'ricardo' } }),
      row('t3', 'task', 'Finished crew job', { status: 'Done', data: { contractor_id: 'cesar', other_contractor_ids: ['ricardo'] } }),
    ];
    // Repeats and unknown contacts are skipped.
    expect(subsOf(tasks[0], people)).toEqual([{ id: 'cesar', name: 'Cesar', group: 'Shell' }, { id: 'ricardo', name: 'Ricardo Diaz', group: 'Trusses' }]);
    expect(subKeys(tasks[0], people)).toEqual(['cesar', 'ricardo']);
    expect(subLoads(tasks, people, today).map(load => [load.id, load.open])).toEqual([['cesar', 1], ['ricardo', 2]]);
    expect(tasks.filter(task => matchesPeople(task, people, 'chris', 'ricardo')).map(task => task.id)).toEqual(['t1', 't2']);
    expect(tasks.filter(task => matchesPeople(task, people, ALL, 'cesar')).map(task => task.id)).toEqual(['t1', 't3']);
    // A first sub that no longer exists leaves the others in place; a job with no subs is "No sub yet".
    expect(subKeys(row('t4', 'task', 'Orphan', { data: { contractor_id: 'gone', other_contractor_ids: ['ricardo'] } }), people)).toEqual(['ricardo']);
    expect(subKeys(row('t5', 'task', 'Nobody', { data: { other_contractor_ids: [] } }), people)).toEqual([UNASSIGNED]);
  });

  it('accepts extra subs only as a short list of workspace contacts', async () => {
    const base = { kind: 'task' as const, title: 'Trusses measurement' };
    const one = crypto.randomUUID();
    expect(validateRecord({ ...base, data: { other_contractor_ids: [one] } }).data?.other_contractor_ids).toEqual([one]);
    expect(() => validateRecord({ ...base, data: { other_contractor_ids: 'Ricardo' } })).toThrow(/record IDs/);
    expect(() => validateRecord({ ...base, data: { other_contractor_ids: ['Ricardo'] } })).toThrow(/record IDs/);
    expect(() => validateRecord({ ...base, data: { other_contractor_ids: Array.from({ length: 21 }, () => crypto.randomUUID()) } })).toThrow(/at most 20/);

    const workspace = crypto.randomUUID(), sub = crypto.randomUUID(), task = crypto.randomUUID(), outsider = crypto.randomUUID();
    const records = [
      { id: sub, workspace_id: workspace, project_id: null, kind: 'contact' },
      { id: task, workspace_id: workspace, project_id: null, kind: 'task' },
      { id: outsider, workspace_id: crypto.randomUUID(), project_id: null, kind: 'contact' },
    ] as RecordRow[];
    const input = (ids: string[]) => ({ ...base, data: { other_contractor_ids: ids } });
    expect(() => validateRelationships(input([sub]), records, workspace)).not.toThrow();
    for (const bad of [task, outsider, crypto.randomUUID()]) expect(() => validateRelationships(input([bad]), records, workspace)).toThrow(/for each sub/);

    // The demo runtime applies the same rule.
    const client = createShowcaseClient(), snapshot = client.snapshot();
    const [lead, other] = snapshot.records.filter(r => r.kind === 'contact');
    const waiting = snapshot.records.find(r => r.kind === 'task' && r.status === 'Waiting')!;
    const save = (data: Record<string, unknown>) => client.request(`/api/records/${waiting.id}`, { method: 'PATCH', body: JSON.stringify({ version: waiting.version, data: { ...waiting.data, ...data } }) });
    await expect(save({ contractor_id: lead.id, other_contractor_ids: [waiting.id] })).rejects.toThrow();
    await save({ contractor_id: lead.id, other_contractor_ids: [other.id] });
    expect(client.snapshot().records.find(r => r.id === waiting.id)?.data.other_contractor_ids).toEqual([other.id]);
  });

  it('resolves people without inventing names or categories, and recognizes team members by role or department', () => {
    expect(person(contacts, 'carlos')).toEqual({ id: 'carlos', name: 'Carlos', group: 'Outdoor Kitchen' });
    expect(person(contacts, 'loose')).toEqual({ id: 'loose', name: 'Pat', group: '' });
    expect(person(contacts, 'missing')).toBeNull();
    expect(person(contacts, null)).toBeNull();
    expect([chris, mike, carlos].map(isTeamMember)).toEqual([true, true, false]);
  });

  it('flags open work awaiting an applicability answer, which the server will not release until answered', () => {
    const flagged: string[] = [];
    for (const status of KIND_CONFIG.task.statuses) {
      const awaiting = row(`t-${status}`, 'task', 'Gate', { status, data: { applicability: 'Needs confirming', ...(status === 'Not applicable' ? { applicability_reason: 'Not in scope' } : {}) } });
      if (awaitsApplicability(awaiting)) flagged.push(status);
      expect(awaitsApplicability({ ...awaiting, data: { applicability: 'Required' } })).toBe(false);
      expect(awaitsApplicability({ ...awaiting, data: {} })).toBe(false);
    }
    expect(flagged).toEqual(['Waiting', 'Ready', 'Working', 'Blocked', 'Ready to check']);
    const waiting = row('w', 'task', 'Waiting gate', { status: 'Waiting', data: { applicability: 'Needs confirming' } });
    expect(() => validateTransition(waiting, { kind: 'task', title: waiting.title, status: 'Waiting', data: waiting.data }, [waiting])).not.toThrow();
    expect(() => validateTransition(waiting, { kind: 'task', title: waiting.title, status: 'Ready', data: waiting.data }, [waiting])).toThrow(/Confirm whether this work applies/);
    // A task that never had an applicability value is not gated; the editor must not add one on save.
    const unset = row('u', 'task', 'Ad-hoc office task', { status: 'Ready', data: { trade: 'Plumbing' } });
    expect(() => validateTransition(unset, { kind: 'task', title: unset.title, status: 'Working', data: unset.data }, [unset])).not.toThrow();
    expect(() => validateTransition(unset, { kind: 'task', title: unset.title, status: 'Working', data: { ...unset.data, applicability: 'Needs confirming' } }, [unset])).toThrow(/Confirm whether this work applies/);
  });

  it('adds exactly one applicability warning, which the work card replaces with its plain-language note', () => {
    const waiting = row('w', 'task', 'Waiting gate', { status: 'Waiting', data: { applicability: 'Needs confirming' } });
    expect(scheduleWarnings(waiting, [waiting]).filter(w => /applies/.test(w))).toHaveLength(1);
    expect(scheduleWarnings({ ...waiting, data: {} }, [waiting]).filter(w => /applies/.test(w))).toHaveLength(0);
  });
});
