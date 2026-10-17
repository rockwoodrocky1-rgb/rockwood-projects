import { contactName } from './contact-presentation';
import type { RecordRow } from './domain';

// Office leads are the task's "Person responsible" (owner_id). The lead sub
// doing the work is the task's existing "Contractor" (data.contractor_id), and
// any other subs working with them are listed in data.other_contractor_ids.
// All of them point to contact records; none needs a login.
export const UNASSIGNED = 'unassigned';
export const ALL = 'all';

const CLOSED_TASK = new Set(['Done', 'Not applicable']);
const text = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export type Person = { id: string; name: string; group: string };
export type Load = { id: string; name: string; group: string; isTeam: boolean; open: number; needsAnswer: number; overdue: number; nextDue: string | null };

export function isOpenTask(row: RecordRow): boolean {
  return row.kind === 'task' && !CLOSED_TASK.has(row.status);
}

export function isTeamMember(contact: Pick<RecordRow, 'data'>): boolean {
  return [contact.data.role, contact.data.trade].some(value => text(value).toLowerCase() === 'team member');
}

/** Open work whose applicability is still unconfirmed. validateTransition refuses to release it (Ready, Working, Ready to check, Done) until someone answers. */
export function awaitsApplicability(row: RecordRow): boolean {
  return isOpenTask(row) && row.data.applicability === 'Needs confirming';
}

/** The contact behind an id, or null for an empty or unknown id. The group is the contact's trade or role, never a made-up category. */
export function person(contacts: readonly RecordRow[], id: unknown): Person | null {
  if (typeof id !== 'string' || !id) return null;
  const contact = contacts.find(c => c.id === id && c.kind === 'contact');
  return contact ? { id: contact.id, name: contactName(contact), group: text(contact.data.trade) || text(contact.data.role) } : null;
}

/** An empty or unknown contact id counts as unassigned, so nothing disappears from the team view. */
export function leadKey(row: RecordRow, contacts: readonly RecordRow[]): string {
  return person(contacts, row.owner_id)?.id || UNASSIGNED;
}

/** Other subs working with the lead sub, in the order they were added. Unknown ids, repeats and the lead sub itself are skipped. */
export function otherSubs(row: RecordRow, contacts: readonly RecordRow[]): Person[] {
  const lead = person(contacts, row.data.contractor_id)?.id;
  const ids: unknown[] = Array.isArray(row.data.other_contractor_ids) ? row.data.other_contractor_ids : [];
  const seen = new Set(lead ? [lead] : []);
  return ids.flatMap(id => {
    const found = person(contacts, id);
    if (!found || seen.has(found.id)) return [];
    seen.add(found.id);
    return [found];
  });
}

/** Every sub on the job, lead sub first. A job with none counts as unassigned ("No sub yet"). */
export function subKeys(row: RecordRow, contacts: readonly RecordRow[]): string[] {
  const lead = person(contacts, row.data.contractor_id)?.id;
  const keys = [...(lead ? [lead] : []), ...otherSubs(row, contacts).map(sub => sub.id)];
  return keys.length ? keys : [UNASSIGNED];
}

function summarize(tasks: readonly RecordRow[], contacts: readonly RecordRow[], today: string, keysOf: (row: RecordRow) => string[], includeTeam: boolean): Load[] {
  const loads = new Map<string, Load>();
  const ensure = (id: string): Load => {
    const existing = loads.get(id);
    if (existing) return existing;
    const contact = contacts.find(c => c.id === id && c.kind === 'contact');
    const found = id === UNASSIGNED ? null : person(contacts, id);
    const load: Load = { id, name: found?.name || 'Unassigned', group: found?.group || '', isTeam: Boolean(contact && isTeamMember(contact)), open: 0, needsAnswer: 0, overdue: 0, nextDue: null };
    loads.set(id, load);
    return load;
  };
  if (includeTeam) contacts.filter(c => c.kind === 'contact' && c.status === 'Active' && isTeamMember(c)).forEach(c => ensure(c.id));
  for (const row of tasks) {
    if (!isOpenTask(row)) continue;
    // A job shared by several subs counts once for each of them.
    for (const key of keysOf(row)) {
      const load = ensure(key);
      load.open += 1;
      if (awaitsApplicability(row)) load.needsAnswer += 1;
      if (row.due_date && row.due_date < today) load.overdue += 1;
      // Past dates are already counted as overdue; "next due" looks forward only.
      else if (row.due_date && (!load.nextDue || row.due_date < load.nextDue)) load.nextDue = row.due_date;
    }
  }
  const names = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });
  return [...loads.values()].sort((a, b) => {
    if (a.id === UNASSIGNED || b.id === UNASSIGNED) return a.id === b.id ? 0 : a.id === UNASSIGNED ? 1 : -1;
    if (a.isTeam !== b.isTeam) return a.isTeam ? -1 : 1;
    return names.compare(a.name, b.name) || a.id.localeCompare(b.id);
  });
}

/** Open work per office lead. Active team members always appear, even with nothing open; "Unassigned" appears only when it has work. */
export function leadLoads(tasks: readonly RecordRow[], contacts: readonly RecordRow[], today: string): Load[] {
  return summarize(tasks, contacts, today, row => [leadKey(row, contacts)], true).filter(load => load.id !== UNASSIGNED || load.open > 0);
}

/** Open work per sub or crew, for "this sub has three of my jobs". Lead and other subs both count. The unassigned bucket ("No sub yet") comes last. */
export function subLoads(tasks: readonly RecordRow[], contacts: readonly RecordRow[], today: string): Load[] {
  return summarize(tasks, contacts, today, row => subKeys(row, contacts), false);
}

export function matchesPeople(row: RecordRow, contacts: readonly RecordRow[], lead: string, sub: string): boolean {
  return (lead === ALL || leadKey(row, contacts) === lead) && (sub === ALL || subKeys(row, contacts).includes(sub));
}
