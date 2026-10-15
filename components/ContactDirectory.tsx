'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { contactName, groupContacts } from '@/lib/contact-presentation';
import type { RecordRow } from '@/lib/domain';
import { useWorkspaceRuntime } from './WorkspaceRuntime';

export default function ContactDirectory({ records, allRecords, searching, onEdit }: {
  records: RecordRow[];
  allRecords: RecordRow[];
  searching: boolean;
  onEdit: (record: RecordRow) => void;
}) {
  const { isShowcase } = useWorkspaceRuntime();
  const id = useId();
  const groups = useMemo(() => groupContacts(records), [records]);
  const [expanded, setExpanded] = useState(() => new Map<string, boolean>());
  const defaultOpen = searching || groups.length === 1;
  const allExpanded = groups.every(group => expanded.get(group.key) ?? defaultOpen);
  const bidCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of allRecords) if (record.kind === 'bid' && record.data.contractor_id) {
      counts.set(record.data.contractor_id, (counts.get(record.data.contractor_id) || 0) + 1);
    }
    return counts;
  }, [allRecords]);
  const toggle = (key: string) => setExpanded(previous => new Map(previous).set(key, !(previous.get(key) ?? defaultOpen)));

  return <div className="contact-directory">
    <div className="contact-directory-heading">
      <div><h2>Trades & departments <span className="count">{groups.length}</span></h2><p>Choose a group to see contacts. Groups and names are sorted A–Z.</p></div>
      <button type="button" className="button compact" onClick={() => setExpanded(new Map(groups.map(group => [group.key, !allExpanded])))}>{allExpanded ? 'Collapse all' : 'Expand all'}</button>
    </div>
    <div className="contact-groups">
      {groups.map(group => {
        const open = expanded.get(group.key) ?? defaultOpen;
        const panelId = `${id}-${encodeURIComponent(group.key)}`;
        return <section className={`panel contact-group ${open ? 'is-open' : ''}`} key={group.key}>
          <h3><button type="button" className="contact-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => toggle(group.key)}>
            <span className="contact-group-icon"><Users size={22} /></span>
            <span className="contact-group-heading"><span className="contact-group-title">{group.label}<span className="count">{group.contacts.length}</span></span><span className="contact-group-preview">{group.contacts.slice(0, 3).map(contactName).join(', ')}{group.contacts.length > 3 ? ` +${group.contacts.length - 3} more` : ''}</span></span>
            <ChevronDown size={20} className="contact-group-chevron" />
          </button></h3>
          <div id={panelId} hidden={!open}>
            {open && <div className="contact-group-list">{group.contacts.map(contact => {
              const name = contactName(contact);
              const bids = bidCounts.get(contact.id) || 0;
              return <article className="contact-entry" key={contact.id}>
                <button type="button" className="contact-entry-main" onClick={() => onEdit(contact)} aria-label={`Open ${name}`}>
                  <span className="contact-avatar" aria-hidden="true">{name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <span className="contact-entry-name"><strong>{name}</strong>{contact.data.company && <small>{contact.data.company}</small>}<small>{bids} linked {bids === 1 ? 'bid' : 'bids'}{contact.data.past_jobs ? ' · Past experience added' : ''}</small></span>
                  <span className="status neutral"><span />{contact.status}</span><ChevronRight size={18} />
                </button>
                {(contact.data.email || contact.data.phone) && <div className="contact-entry-links">
                  {contact.data.phone && (isShowcase ? <span>{contact.data.phone}</span> : <a href={`tel:${contact.data.phone}`}>{contact.data.phone}<ArrowUpRight size={15} /></a>)}
                  {contact.data.email && (isShowcase ? <span>{contact.data.email}</span> : <a href={`mailto:${contact.data.email}`}>{contact.data.email}<ArrowUpRight size={15} /></a>)}
                </div>}
              </article>;
            })}</div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
