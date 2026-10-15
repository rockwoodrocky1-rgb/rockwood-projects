import { contactName, groupContacts } from '@/lib/contact-presentation';
import type { RecordRow } from '@/lib/domain';

/** Shared by Today, responsible-person fields, contractors and suppliers. */
export default function ContactOptions({ contacts }: { contacts: RecordRow[] }) {
  return groupContacts(contacts).map(group => <optgroup key={group.key} label={group.label}>
    {group.contacts.map(contact => <option key={contact.id} value={contact.id}>
      {group.label} — {contactName(contact)}{contact.status !== 'Active' ? ` (${contact.status})` : ''}
    </option>)}
  </optgroup>);
}
