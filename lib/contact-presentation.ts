import type { RecordRow } from './domain';

type Contact = Pick<RecordRow, 'title' | 'data'>;
export type ContactGroup = { key: string; label: string; contacts: RecordRow[] };
const alphabetical = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });
const spellingOrder = new Intl.Collator('en-US', { numeric: true, caseFirst: 'upper' });
const text = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const key = (value: string) => text(value).toLocaleLowerCase('en-US');

export function contactSegment(contact: Contact): string {
  return text(contact.data.trade) || text(contact.data.role) || 'Uncategorized';
}

// Imported names often repeat the stored trade. Only remove an exact matching
// suffix for display; never change the saved title or unrelated parentheticals.
export function contactName(contact: Contact): string {
  const name = text(contact.title);
  const suffix = name.match(/\s*\(([^()]*)\)$/);
  if (suffix && text(contact.data.trade) && key(suffix[1]) === key(contact.data.trade)) {
    return name.slice(0, suffix.index).trim() || name;
  }
  return name;
}

export function groupContacts(records: readonly RecordRow[]): ContactGroup[] {
  const groups = new Map<string, ContactGroup>();
  for (const contact of records) {
    if (contact.kind !== 'contact') continue;
    const label = contactSegment(contact);
    const groupKey = key(label);
    const group = groups.get(groupKey);
    if (group) {
      group.contacts.push(contact);
      // Pick the same spelling even when the API's record order changes.
      if (spellingOrder.compare(label, group.label) < 0) group.label = label;
    } else groups.set(groupKey, { key: groupKey, label, contacts: [contact] });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'uncategorized' || b.key === 'uncategorized') return a.key === b.key ? 0 : a.key === 'uncategorized' ? 1 : -1;
    return alphabetical.compare(a.label, b.label) || spellingOrder.compare(a.label, b.label);
  }).map(group => ({ ...group, contacts: group.contacts.sort((a, b) =>
    alphabetical.compare(contactName(a), contactName(b)) || alphabetical.compare(text(a.data.company), text(b.data.company)) || a.id.localeCompare(b.id)
  ) }));
}
