import { describe, expect, it } from 'vitest';
import { contactName, contactSegment, groupContacts } from '../lib/contact-presentation';
import type { RecordRow } from '../lib/domain';

function contact(id: string, title: string, data: Record<string, unknown> = {}, status = 'Active'): RecordRow {
  return { id, title, kind: 'contact', data, status, workspace_id: 'workspace', project_id: null, owner_id: null, due_date: null, version: 1, created_at: '', updated_at: '' };
}

describe('contact organization', () => {
  it('groups trades A–Z and sorts names inside each trade, independent of API order', () => {
    const records = [
      contact('p', 'Piter (Mechanical)', { trade: 'Mechanical' }),
      contact('e', 'Édel (Electrical)', { trade: 'Electrical' }),
      contact('g', 'gerardo (Mechanical)', { trade: ' mechanical ' }),
      contact('f', 'Felix (Mechanical)', { trade: 'Mechanical' }),
      contact('a', 'Ana', { trade: 'Electrical' }),
    ];
    const snapshot = structuredClone(records);
    const grouped = groupContacts(records);
    expect(grouped.map(group => [group.label, group.contacts.map(row => row.id)])).toEqual([
      ['Electrical', ['a', 'e']], ['Mechanical', ['f', 'g', 'p']],
    ]);
    expect(groupContacts([...records].reverse())).toEqual(grouped);
    expect(records).toEqual(snapshot);
  });

  it('keeps unclassified and inactive contacts findable without inventing a trade', () => {
    const records = [
      contact('u', 'Alex (Plumbing)'),
      contact('i', 'Taylor', { role: 'Inspector' }),
      contact('m', 'Rene', { trade: 'Plumbing', role: 'Contractor' }, 'Inactive'),
      contact('n', 'Morgan', { trade: '   ', role: null }),
      { ...contact('task', 'Task'), kind: 'task' as const },
    ];
    const grouped = groupContacts(records);
    expect(grouped.map(group => group.label)).toEqual(['Inspector', 'Plumbing', 'Uncategorized']);
    expect(grouped.flatMap(group => group.contacts.map(row => row.id))).toEqual(['i', 'm', 'u', 'n']);
    expect(grouped[1].contacts[0].status).toBe('Inactive');
    expect(contactSegment(records[0])).toBe('Uncategorized');
  });

  it('cleans only repeated trade suffixes for display and preserves company qualifiers', () => {
    expect(contactName(contact('a', '  Felix ( Mechanical ) ', { trade: 'mechanical' }))).toBe('Felix');
    expect(contactName(contact('b', 'Alex (Office)', { trade: 'Electrical' }))).toBe('Alex (Office)');
    expect(contactName(contact('c', 'ACME (South)'))).toBe('ACME (South)');
    expect(contactName(contact('d', '(Mechanical)', { trade: 'Mechanical' }))).toBe('(Mechanical)');
  });

  it('retains same-name records by ID and merges spacing/case variants of a department', () => {
    const records = [
      contact('b', 'Jose', { trade: 'Interior   Doors', company: 'West' }),
      contact('a', 'Jose', { trade: 'interior doors', company: 'East' }),
      contact('c', 'Juan', { trade: 'Interior Doors' }),
    ];
    expect(groupContacts(records).map(group => [group.label, group.contacts.map(row => row.id)])).toEqual([
      ['Interior Doors', ['a', 'b', 'c']],
    ]);
  });
});
