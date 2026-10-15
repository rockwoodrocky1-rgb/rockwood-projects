import { createProjectRecords, isDate, KIND_CONFIG, validateRecord, validateTransition, type Activity, type Bootstrap, type Kind, type Project, type RecordInput, type RecordRow } from './domain';

// The public showcase is a closed, disposable simulation. It imports no live client,
// performs no network requests and never reads storage, cookies or environment keys.
export const SHOWCASE_PROJECT_ID = 'a0000000-0000-4000-8000-000000000001';
const WORKSPACE_ID = 'a0000000-0000-4000-8000-000000000002';
const ACTOR_ID = 'a0000000-0000-4000-8000-000000000003';
const PAST_PROJECT_ID = 'a0000000-0000-4000-8000-000000000004';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', csv: 'text/csv', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', rtf: 'application/rtf' };
const copy = <T,>(value: T): T => structuredClone(value);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const offsetDate = (date: string, offset: number) => { const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + offset); return result.toISOString().slice(0, 10); };
const now = () => new Date().toISOString();
const sampleText = (value: unknown): any => typeof value === 'string' ? value.replace(/\bChris\b/g, 'Project lead').replace(/\bRVS\b/g, 'Supplier coordinator') : Array.isArray(value) ? value.map(sampleText) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sampleText(child)])) : value;

function row(input: RecordInput): RecordRow {
  return { id: input.id || crypto.randomUUID(), workspace_id: WORKSPACE_ID, project_id: input.project_id ?? null, kind: input.kind, title: input.title, status: input.status || KIND_CONFIG[input.kind].statuses[0], owner_id: input.owner_id ?? null, due_date: input.due_date ?? null, data: { ...input.data, is_demo: true }, version: 1, created_at: now(), updated_at: now() };
}

function seed(): { state: Bootstrap; files: Map<string, Blob> } {
  const current = today(), day = (offset: number) => offsetDate(current, offset), files = new Map<string, Blob>();
  const project: Project = { id: SHOWCASE_PROJECT_ID, workspace_id: WORKSPACE_ID, name: 'Oak Street House · Demo', address: '184 Oak Street · Fictional property', project_type: 'New construction', status: 'Active', start_date: day(-50), target_date: day(48), lead: 'Sample Site Lead', description: 'A fictional project for exploring the tool. All progress, prices, contacts and inspection results are simulated. Changes stay in this browser session and reset on refresh.', locations: ['Kitchen', 'Bathroom', 'Living room', 'Exterior', 'Whole house'], is_demo: true, version: 1, created_at: `${day(-50)}T14:00:00.000Z` };
  const past: Project = { ...project, id: PAST_PROJECT_ID, name: 'Cedar Lane Kitchen · Demo', address: '42 Cedar Lane · Fictional past job', project_type: 'Renovation', status: 'Past job', start_date: day(-140), target_date: day(-75), description: 'Fictional completed job for reviewing costs and lessons learned.', locations: ['Kitchen'], created_at: `${day(-140)}T14:00:00.000Z` };
  const records = sampleText(createProjectRecords(project.id, { isDemo: true, startDate: current })).map((input: RecordInput) => row(input)) as RecordRow[];
  const add = (kind: Kind, title: string, status: string, data: Record<string, any> = {}, extra: Partial<RecordInput> = {}) => { const result = row({ kind, title, status, project_id: project.id, data, ...extra }); records.push(result); return result; };
  const contact = (title: string, trade: string, role = 'Contractor') => add('contact', title, 'Active', { company: title, trade, role, email: `${trade.toLowerCase().replace(/[^a-z]/g, '') || 'team'}@example.com`, phone: '555-0100', past_jobs: 'Fictional reference: Cedar Lane kitchen renovation.', quality_notes: 'Sample profile for comparing experience and availability.', notes: 'Fictional showcase contact. No calls, emails or messages are sent.' });
  const lead = contact('Sample Site Lead', 'Project coordination', 'Team member');
  const electrical = contact('Sample Electrical Crew', 'Electrical');
  const hvac = contact('Sample HVAC Crew', 'Mechanical');
  const drywall = contact('Sample Drywall Crew', 'Drywall');
  const alternate = contact('Sample Plumbing Contractor B', 'Plumbing');
  const plumber = records.find(r => r.kind === 'contact' && r.title === 'Sample Plumbing Crew')!;
  const supplier = records.find(r => r.kind === 'contact' && r.title === 'Sample Supply House')!;
  const phaseOffsets = [-50, -45, -38, -30, -21, -12, 0, 7, 15, 23, 28, 33, 38, 42, 46];
  const phaseCounters = new Map<number, number>();
  for (const task of records.filter(r => r.kind === 'task')) {
    const phase = task.data.phase as number, order = phaseCounters.get(phase) || 0; phaseCounters.set(phase, order + 1);
    const start = phaseOffsets[phase - 1] + Math.min(order % 4, 3);
    task.data.start_date = day(start); task.due_date = day(start + (task.data.is_inspection_wrapper ? 0 : 2));
    task.data.baseline_start = task.data.start_date; task.data.baseline_finish = task.due_date;
    task.data.duration_days = task.data.is_inspection_wrapper ? 0 : 2; task.owner_id = lead.id;
    task.data.demo_note = 'Fictional showcase schedule and progress. Source timing is preserved; real jobs need confirmation.';
    if (phase <= 6) { task.status = 'Done'; task.data.applicability = 'Required'; task.data.actual_start = task.data.start_date; task.data.actual_finish = task.due_date; }
  }
  for (const check of records.filter(r => r.kind === 'check')) {
    check.owner_id = lead.id; check.due_date = day(phaseOffsets[(check.data.phase || 12) - 1] + 3);
    if (check.data.category === 'Pool') { check.status = 'Not applicable'; check.data.applicability = 'Not applicable'; check.data.applicability_reason = 'Fictional showcase scope: this example house has no pool.'; }
    else if (check.data.phase <= 6) { check.status = 'Passed'; Object.assign(check.data, { applicability: 'Required', result_date: check.due_date, inspector: 'Sample inspector (fictional)', evidence: 'SIMULATED RESULT for the public showcase only. This is not a real inspection or official approval.' }); }
    else if (check.data.category === 'MEP Rough') { check.status = 'Scheduled'; check.due_date = day(3); Object.assign(check.data, { applicability: 'Required', scheduled_date: day(3), inspector: 'Sample inspector (fictional)' }); }
    check.data.demo_note = 'Every result in this public example is fictional. No live inspection records are accessed.';
  }
  const source = (id: string) => records.find(r => r.kind === 'task' && r.data.source_id === id)!;
  const updateWork = (id: string, status: string, owner: string, start: number, finish: number, details: Record<string, any> = {}) => {
    const task = source(id); task.status = status; task.owner_id = owner; task.due_date = day(finish);
    Object.assign(task.data, { start_date: day(start), baseline_start: day(start), baseline_finish: day(finish), applicability: 'Required', ...details });
  };
  updateWork('P3-24', 'Working', electrical.id, -1, 2, { location: 'Kitchen / Living room', trade: 'Electrical', actual_start: day(-1), completion_criteria: 'Rough electrical installation ready for its separate inspection.' });
  updateWork('P3-20', 'Ready', hvac.id, 0, 2, { location: 'Whole house', trade: 'Mechanical', completion_criteria: 'Install the rough ductwork and request the separate HVAC inspection.' });
  updateWork('P3-22', 'Blocked', plumber.id, -1, 2, { location: 'Kitchen / Bathroom', trade: 'Plumbing', priority: 'High', blocker_reason: `Sample delivery delay: rough-in fittings arrive ${day(2)}. Confirm receipt before restarting.`, completion_criteria: 'Rough plumbing complete and ready for its separate inspection.' });
  updateWork('P2-21', 'Ready to check', lead.id, -1, 0, { actual_start: day(-1), actual_finish: null, completion_criteria: 'Review scope, exclusions and totals for the remaining interior package.', notes: `${source('P2-21').data.source_notes || ''}\nShowcase context: early structural and rough-in packages were already awarded. This current comparison covers the remaining interior finishes.` });
  for (const [index, id] of ['P2-22', 'P2-23', 'P2-24'].entries()) updateWork(id, 'Waiting', lead.id, index + 1, index + 1, { actual_start: null, actual_finish: null, notes: `${source(id).data.source_notes || ''}\nShowcase context: arrange the remaining interior package while rough-in work proceeds under existing agreements.` });
  // Give the visible rough-in-to-finishes demonstration an explicit, coherent handoff sequence.
  for (const [id, start, finish] of [
    ['P3-21', 3, 3], ['P3-23', 3, 3], ['P3-25', 3, 3],
    ['P3-27', 4, 5], ['P3-28', 6, 6], ['P3-29', 7, 9],
    ['P3-30', 10, 10], ['P3-31', 11, 14], ['P3-32', 15, 17],
    ['P3-33', 15, 18], ['P3-34', 19, 22], ['P4-07', 19, 20],
  ] as [string, number, number][]) updateWork(id, 'Waiting', ['P3-29', 'P3-30', 'P3-31'].includes(id) ? drywall.id : lead.id, start, finish);
  for (const id of ['P3-29', 'P3-30', 'P3-31']) { source(id).owner_id = drywall.id; source(id).data.trade = 'Drywall'; }
  const lowVoltage = source('P3-26'); lowVoltage.status = 'Not applicable'; Object.assign(lowVoltage.data, { applicability: 'Not applicable', applicability_reason: 'Fictional scope: low-voltage/security installation is not included.' });
  const material = records.find(r => r.kind === 'material')!;
  material.title = 'Rough-in plumbing fittings'; material.status = 'Delayed'; material.due_date = day(2);
  Object.assign(material.data, { expected_date: day(2), original_expected_date: day(-1), quantity: 1, unit: 'lot', unit_cost: 680, total_cost: 680, linked_task_ids: [source('P3-22').id], notes: 'Fictional supplier update: delivery moved by three days. Nothing has been ordered or sent.' });
  const hold = records.find(r => r.kind === 'hold')!; hold.title = 'Confirm plumbing fittings delivery'; hold.due_date = day(1); hold.owner_id = lead.id;
  Object.assign(hold.data, { reason: 'Sample rough-in fittings are late; plumbing cannot finish yet.', linked_task_ids: [source('P3-22').id], responsible_role: 'Site lead' });
  add('material', 'Drywall boards — sample order', 'Confirmed', { supplier_id: supplier.id, supplier_name: supplier.title, trade: 'Drywall', quantity: 120, unit: 'sheets', unit_cost: 17, total_cost: 2040, order_number: 'SAMPLE-104', expected_date: day(6), linked_task_ids: [source('P3-29').id] }, { due_date: day(6), owner_id: drywall.id });
  add('material', 'Interior paint — selection pending', 'Need to select', { location: 'Whole house', quantity: 1, unit: 'package', notes: 'Choose the approved color before ordering.' }, { due_date: day(12), owner_id: lead.id });
  add('bid', 'Kitchen and bathroom plumbing — alternate price', 'Comparing', { contractor_id: alternate.id, contractor_name: alternate.title, trade: 'Plumbing', labor_cost: 3900, material_cost: 1600, tax_amount: 112, currency: 'USD', scope: 'Sample rough-in and trim price for comparing inclusions.', exclusions: 'Water heater, fixtures and permit fees', scope_gaps: 'Confirm testing and inspection attendance.', payment_terms: 'Sample: 30% deposit, balance after approved work.' }, { owner_id: alternate.id, due_date: day(1) });
  add('bid', 'Drywall supply and installation — sample price', 'Received', { contractor_id: drywall.id, contractor_name: drywall.title, trade: 'Drywall', labor_cost: 5800, material_cost: 2040, tax_amount: 142.8, currency: 'USD', scope: 'Hang, tape, finish and clean up. Inspection coordination included.', exclusions: 'Painting and specialty ceilings' }, { owner_id: drywall.id, due_date: day(2) });
  const contract = add('contract', 'Electrical work agreement — sample', 'Signed', { contractor_id: electrical.id, contractor_name: electrical.title, trade: 'Electrical', scope: 'Fictional rough and finish electrical work.', amount: 14800, payment_terms: '30% deposit; progress payments after review.', retainage_percent: 10, signed_date: day(-18), start_date: day(-1), finish_date: day(25), document_reference: 'Sample agreement notes' }, { owner_id: electrical.id });
  add('payment', 'Electrical deposit — sample record', 'Paid', { contract_id: contract.id, contractor_id: electrical.id, payee: electrical.title, payment_type: 'Deposit', invoice_number: 'SAMPLE-E01', amount: 4440, paid_amount: 4440, paid_date: day(-17), invoice_date: day(-18), reference: 'Fictional example — no money moved' }, { owner_id: lead.id, due_date: day(-17) });
  add('payment', 'Electrical retainage — sample record', 'Expected', { contract_id: contract.id, contractor_id: electrical.id, payee: electrical.title, payment_type: 'Retainage', amount: 1480, paid_amount: 0, retainage: 1480, reconciliation: 'Release only after required completion and closeout review.' }, { owner_id: lead.id, due_date: day(45) });
  add('decision', 'Choose the kitchen paint color', 'Needed', { decision_type: 'Selection', question: 'Which finish and color should the painter order?', proposed_answer: 'Warm white walls with satin trim — sample proposal.', cost_impact: 0, days_impact: 0 }, { owner_id: lead.id, due_date: day(3) });
  add('decision', 'Kitchen outlet location — sample clarification', 'Approved', { decision_type: 'Design clarification', question: 'Confirm the island outlet location.', approved_answer: 'Use the sample approved layout.', approved_by: 'Sample project lead', decision_date: day(-1), evidence: 'Fictional decision note; no construction authorization.' }, { owner_id: electrical.id });
  const pastCrew = add('contact', 'Sample Kitchen Renovation Crew', 'Active', { company: 'Fictional past-job contractor', trade: 'Renovation', role: 'Contractor', email: 'renovation@example.com', past_jobs: 'Cedar Lane Kitchen — fictional completed renovation.', notes: 'Historical sample only. No messages are sent.' }, { project_id: past.id });
  add('review', 'Cedar Lane kitchen — past job review', 'Complete', { review_type: 'Past job', job_name: 'Cedar Lane Kitchen · Demo', completed_date: day(-75), original_budget: 42000, final_cost: 43800, planned_finish: day(-78), actual_finish: day(-75), contractor_id: pastCrew.id, what_worked: 'Early field measurements reduced cabinet changes.', problems: 'Sample fixture delivery arrived three days late.', lessons_learned: 'Confirm long-lead fixtures before scheduling trim work.', source_documents: 'Fictional example notes for demonstrating past-job intake.' }, { project_id: past.id, owner_id: pastCrew.id });
  add('bid', 'Cedar Lane renovation — historical price', 'Selected', { contractor_id: pastCrew.id, contractor_name: pastCrew.title, trade: 'Renovation', labor_cost: 27000, material_cost: 15000, currency: 'USD', scope: 'Fictional completed kitchen renovation.', received_date: day(-142), source_job: past.name, notes: 'Historical sample contract price $42,000. Final cost $43,800 is recorded in the past-job review.' }, { project_id: past.id, owner_id: pastCrew.id, due_date: day(-140) });
  add('review', 'Closeout lessons — start collecting now', 'Draft', { review_type: 'Lessons learned', lessons_learned: 'Track supplier promises and review missing scope before selecting a quote.' }, { owner_id: lead.id, due_date: day(45) });
  function sampleDocument(title: string, category: string, content: string, related?: string) {
    const document = add('document', title, 'Current', { category, file_name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`, mime_type: 'text/plain', source: 'Generated fictional showcase note', ...(related ? { related_record_id: related } : {}) });
    const blob = new Blob([`ROCKWOOD DEVELOPMENT — PUBLIC SHOWCASE\nFICTIONAL EXAMPLE ONLY\n\n${title}\n\n${content}\n\nNo real project, approved plan, contract or municipal record is represented.\n`], { type: 'text/plain;charset=utf-8' });
    document.data.storage_path = `showcase/${document.id}.txt`; document.data.file_size = blob.size; files.set(document.id, blob); return document;
  }
  sampleDocument('Sample project scope notes', 'Plans', 'Example areas: kitchen, bathroom, living room and exterior. The 15-phase checklist organizes work, responsibilities, inspections and closeout. This text is not a drawing or approved plan.');
  sampleDocument('Sample plumbing quote notes', 'Bid', 'Example price: labor $4,200; materials $1,800; tax $126. Exclusions: permit fees and owner-selected fixtures. Confirm water-heater scope before choosing a contractor.');
  sampleDocument('Sample electrical agreement notes', 'Contract', 'Example contract value $14,800. Deposit 30%; retainage 10%. This generated note is not a signed or binding contract.', contract.id);
  add('document', 'Collect contractor warranty letters', 'Needed', { category: 'Trade warranty', notes: 'Example closeout requirement; upload the actual letters in a real workspace.' }, { due_date: day(42), owner_id: lead.id });
  add('document', 'Collect equipment manuals and colors', 'Needed', { category: 'Manual', notes: 'Example closeout requirement, with no real file attached.' }, { due_date: day(42), owner_id: lead.id });
  // The checklist repeats a few already-completed inspections in final closeout
  // (for example roof final). Those wrappers refer to the same sample result.
  for (const check of records.filter(record => record.kind === 'check' && record.status === 'Passed')) {
    for (const task of records.filter(record => record.kind === 'task' && record.data.is_inspection_wrapper && (record.data.check_ids || []).includes(check.id))) {
      task.status = 'Done'; task.data.applicability = 'Required'; task.data.start_date = check.due_date; task.due_date = check.due_date;
    }
  }
  // This only prepares fictional seed dates; user edits remain manual. Propagate a
  // prerequisite's finish to the next day and keep each authoritative check aligned
  // with its checklist wrapper (or the checked work's finish when no wrapper exists).
  const dependsOn = (record: RecordRow, id: string, visited = new Set<string>()): boolean => {
    if (visited.has(record.id)) return false; visited.add(record.id);
    return (record.data.prerequisite_ids || []).some((priorId: string) => priorId === id || records.some(prior => prior.id === priorId && dependsOn(prior, id, visited)));
  };
  for (let pass = 0; pass < records.length; pass++) {
    let changed = false;
    for (const record of records.filter(record => record.kind === 'task' || record.kind === 'check')) {
      if (record.status === 'Not applicable') continue;
      if (record.kind === 'task' && record.data.is_inspection_wrapper) {
        const checkDates = (record.data.check_ids || []).map((id: string) => records.find(check => check.id === id && check.status !== 'Not applicable')?.due_date).filter((date: unknown): date is string => typeof date === 'string');
        const latest = checkDates.sort().at(-1);
        if (latest && (!record.due_date || record.due_date < latest)) { record.data.start_date = latest; record.due_date = latest; changed = true; }
      }
      const priorDates = (record.data.prerequisite_ids || []).map((id: string) => records.find(candidate => candidate.id === id)?.due_date).filter((date: unknown): date is string => typeof date === 'string');
      if (record.kind === 'task' && record.data.start_date && record.due_date && priorDates.length) {
        const earliest = offsetDate(priorDates.sort().at(-1)!, 1);
        if (record.data.start_date < earliest) {
          const duration = Math.round((Date.parse(`${record.due_date}T12:00:00Z`) - Date.parse(`${record.data.start_date}T12:00:00Z`)) / 86400000);
          record.data.start_date = earliest; record.due_date = offsetDate(earliest, duration); changed = true;
        }
      }
      if (record.kind === 'check') {
        // Some links describe work released by a preparatory check, not inspected
        // work. Do not turn those reference links into reverse scheduling edges.
        const linked = (record.data.linked_task_ids || []).map((id: string) => records.find(candidate => candidate.id === id)).filter((item: RecordRow | undefined): item is RecordRow => !!item && !dependsOn(item, record.id));
        const wrappers = linked.filter((item: RecordRow) => item.data.is_inspection_wrapper);
        const candidates = [...(wrappers.length ? wrappers : linked).map((item: RecordRow) => item.due_date), ...priorDates.map((date: string) => offsetDate(date, 1))].filter((date: unknown): date is string => typeof date === 'string');
        const aligned = candidates.sort().at(-1);
        if (aligned && record.due_date !== aligned) { record.due_date = aligned; changed = true; }
      }
    }
    if (!changed) break;
    if (pass === records.length - 1) throw new Error('The showcase schedule could not resolve its dates.');
  }
  for (const record of records) {
    if (record.kind === 'task') { record.data.baseline_start = record.data.start_date; record.data.baseline_finish = record.due_date; if (record.status === 'Done') { record.data.actual_start = record.data.start_date; record.data.actual_finish = record.due_date; } }
    if (record.kind === 'check' && record.status === 'Passed') record.data.result_date = record.due_date;
    if (record.kind === 'check' && record.status === 'Scheduled') record.data.scheduled_date = record.due_date;
  }
  const lastWorkDate = records.filter(record => record.kind === 'task').map(record => record.due_date).filter((date): date is string => !!date).sort().at(-1);
  if (lastWorkDate && lastWorkDate > project.target_date!) project.target_date = lastWorkDate;
  // Fictional permit fixtures stay inside this isolated test runtime.
  const masterPermit = add('permit', 'Fictional building permit', 'Issued', { permit_number:'DEMO-BLD-100', jurisdiction:'Example City (fictional)', permit_type:'Master', source_url:'https://example.com/permits/demo', evidence:'SIMULATED RESULT for local UI tests only.', issued_date:day(-30), expiry_date:day(60), last_verified_at:now(), last_permit_run_id:crypto.randomUUID() });
  const subPermit = add('permit', 'Fictional plumbing subpermit', 'Corrections required', { permit_number:'DEMO-PLB-101', jurisdiction:'Example City (fictional)', permit_type:'Subpermit', parent_permit_id:masterPermit.id, trade:'Plumbing', raw_status:'Corrections pending (simulated)', source_url:'https://example.com/permits/demo', evidence:'SIMULATED RESULT for local UI tests only.', corrections:'Example correction: clarify fixture count.', next_action:'Submit revised fixture schedule (example)', next_action_date:day(2), last_verified_at:now() });
  const permitCheck = records.find(r => r.kind === 'check' && /plumbing/i.test(r.title));
  if (permitCheck) permitCheck.data.permit_id = subPermit.id;
  const permitTask = records.find(r => r.kind === 'task' && r.status === 'Waiting');
  if (permitTask) permitTask.data.prerequisite_ids = [...(permitTask.data.prerequisite_ids || []), subPermit.id];
  const events: Activity[] = [
    { title: 'Plumbing marked blocked: sample fittings delivery moved', record: source('P3-22') },
    { title: 'Electrical rough-in started in the kitchen and living room', record: source('P3-24') },
    { title: 'HVAC crew assigned and work released for the sample schedule', record: source('P3-20') },
    { title: 'Alternate plumbing price added for scope comparison', record: records.find(r => r.title.includes('alternate price'))! },
    { title: 'Sample inspection results loaded for the completed early phases', record: records.find(r => r.kind === 'check' && r.status === 'Passed')! },
  ].map((event, index) => ({ id: crypto.randomUUID(), workspace_id: WORKSPACE_ID, project_id: project.id, record_id: event.record.id, action: 'sample_update', summary: event.title, actor_id: ACTOR_ID, created_at: new Date(Date.now() - index * 35 * 60 * 1000).toISOString() }));
  // Validate the generated snapshot itself, so later edits do not inherit impossible gates.
  for (const record of records) { validateRecord(record); validateTransition(record, record, records); }
  return { state: { workspace: { id: WORKSPACE_ID, name: 'Rockwood Development · Public showcase', role: 'manager' }, projects: [project, past], records, events }, files };
}

export type ShowcaseUpload = { name: string; size: number; project_id: string | null; title: string; category: string };
export function createShowcaseClient() {
  let { state, files } = seed();
  const urls = new Map<string, string>();
  const fail = (message: string): never => { throw new Error(message); };
  const getProject = (id: unknown) => state.projects.find(project => project.id === id) || fail('Project not found in this showcase.');
  const getRecord = (id: string) => state.records.find(record => record.id === id) || fail('Item not found in this showcase.');
  const expectedVersion = (input: Record<string, any>, current: { version: number }) => { if (!Number.isInteger(input.version) || input.version !== current.version) fail('This item changed while you were editing. Refresh and review the latest version before saving.'); };
  const event = (action: string, summary: string, projectId: string | null, recordId: string | null = null) => state.events.unshift({ id: crypto.randomUUID(), workspace_id: WORKSPACE_ID, project_id: projectId, record_id: recordId, action, summary, actor_id: ACTOR_ID, created_at: now() });
  const parse = (options: RequestInit) => { if (typeof options.body !== 'string' || options.body.length > 4_000_000) return fail('Send a valid JSON object.'); let body; try { body = JSON.parse(options.body); } catch { return fail('Send a valid JSON object.'); } if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Send a valid JSON object.'); return body as Record<string, any>; };
  function validateProject(input: Record<string, any>): Omit<Project, 'id' | 'workspace_id' | 'version' | 'created_at'> {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) fail('Enter a project name of 1–200 characters.');
    for (const field of ['address', 'project_type', 'status', 'lead', 'description']) if (input[field] != null && (typeof input[field] !== 'string' || input[field].length > (field === 'description' ? 20000 : 1000))) fail(`Enter valid ${field.replaceAll('_', ' ')}.`);
    const start = input.start_date || null, target = input.target_date || null;
    if (start && !isDate(start) || target && !isDate(target)) fail('Use a real date in YYYY-MM-DD format.');
    if (start && target && start > target) fail('Target finish cannot be before the start.');
    const locations = input.locations ?? [];
    if (!Array.isArray(locations) || locations.length > 200 || locations.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) fail('Add rooms or areas as a list of names.');
    return { name: input.name.trim(), address: input.address || '', project_type: input.project_type || 'Residential', status: input.status || 'Draft', start_date: start, target_date: target, lead: input.lead || '', description: input.description || '', locations: locations.map((value: string) => value.trim()), is_demo: true };
  }
  function relationships(input: RecordInput, available = state.records) {
    if (input.project_id) getProject(input.project_id);
    const data = input.data || {};
    const check = (id: unknown, requiredKind?: Kind, shared = false, anyProject = false) => {
      if (id == null || id === '') return;
      if (typeof id !== 'string' || !UUID.test(id)) fail('Choose a valid related item.');
      const related = available.find(record => record.id === id);
      if (!related || related.workspace_id !== WORKSPACE_ID || requiredKind && related.kind !== requiredKind) fail('The related item is not available in this showcase.');
      if (!anyProject && related!.project_id !== (input.project_id || null) && !(shared && related!.project_id === null)) fail('Linked work must belong to the same project.');
    };
    check(input.owner_id, 'contact', true, true);
    for (const key of ['contractor_id', 'supplier_id', 'contact_id']) check(data[key], 'contact', true, true);
    for (const key of ['related_record_id', 'linked_record_id', 'contract_id', 'bid_id', 'material_id', 'task_id']) check(data[key], key === 'contract_id' ? 'contract' : undefined);
    for (const key of ['prerequisite_ids', 'check_ids', 'corrective_action_ids', 'document_ids', 'linked_task_ids', 'related_record_ids']) for (const id of data[key] || []) check(id, key === 'check_ids' ? 'check' : key === 'document_ids' ? 'document' : undefined, ['document_ids', 'related_record_ids'].includes(key));
  }
  function validated(input: unknown, previous?: RecordRow, available = state.records) {
    const result = validateRecord(input); result.data = { ...result.data, is_demo: true };
    relationships(result, available);
    validateTransition(previous || row(result), result, available);
    return result;
  }
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase(), route = path.split('?')[0];
    let result: unknown;
    if (route === '/api/bootstrap' && method === 'GET') result = state;
    else if (route === '/api/projects' && method === 'POST') {
      const input = parse(options), id = crypto.randomUUID(), project = { ...validateProject(input), id, workspace_id: WORKSPACE_ID, version: 1, created_at: now() };
      if (input.template != null && typeof input.template !== 'boolean') fail('Choose whether to use the project template.');
      if (input.selected_phases != null && (!Array.isArray(input.selected_phases) || input.selected_phases.some((phase: unknown) => !Number.isInteger(phase) || Number(phase) < 1 || Number(phase) > 15))) fail('Choose phases from 1 to 15.');
      const generated = input.template ? sampleText(createProjectRecords(id, { selectedPhases: input.selected_phases, isDemo: true, startDate: project.start_date || today() })).map((item: RecordInput) => row(item)) as RecordRow[] : [];
      for (const record of generated) { validateRecord(record); validateTransition(record, record, [...state.records, ...generated]); }
      state.projects.push(project); state.records.push(...generated); event('create', `Created ${project.name} (temporary showcase project)`, id); result = { project };
    } else if (/^\/api\/projects\/[^/]+$/.test(route) && method === 'PATCH') {
      const previous = getProject(route.split('/').pop()), input = parse(options); expectedVersion(input, previous);
      const project = { ...previous, ...validateProject({ ...previous, ...input }), version: previous.version + 1 };
      state.projects = state.projects.map(item => item.id === previous.id ? project : item); event('update', `Updated ${project.name}`, project.id); result = { project };
    } else if (route === '/api/records' && method === 'POST') {
      const input = parse(options), created = row(validated({ ...input, id: crypto.randomUUID() }));
      state.records.push(created); event('create', `Created ${created.title}`, created.project_id, created.id); result = { record: created };
    } else if (/^\/api\/records\/[^/]+$/.test(route) && method === 'PATCH') {
      const previous = getRecord(route.split('/').pop()!), input = parse(options); expectedVersion(input, previous);
      const next = validated({ ...previous, ...input, id: previous.id }, previous);
      if (previous.kind === 'document' && files.has(previous.id) && next.data?.storage_path !== previous.data.storage_path) fail('The attached file reference cannot be changed. Upload another file instead.');
      const updated: RecordRow = { ...previous, ...next, id: previous.id, project_id: previous.project_id, owner_id: next.owner_id || null, due_date: next.due_date || null, status: next.status!, data: next.data!, version: previous.version + 1, updated_at: now() };
      state.records = state.records.map(item => item.id === previous.id ? updated : item); event('update', `Updated ${updated.title}`, updated.project_id, updated.id); result = { record: updated };
    } else if (/^\/api\/records\/[^/]+$/.test(route) && method === 'DELETE') {
      const previous = getRecord(route.split('/').pop()!), input = parse(options); expectedVersion(input, previous);
      if (previous.data.source_id) fail('Keep customer checklist items. Mark an inapplicable item with a reason instead.');
      if (state.records.some(item => item.id !== previous.id && (item.owner_id === previous.id || JSON.stringify(item.data).includes(previous.id)))) fail('This item is still linked to other work. Remove those links before deleting it.');
      state.records = state.records.filter(item => item.id !== previous.id); files.delete(previous.id); const url = urls.get(previous.id); if (url) URL.revokeObjectURL(url); urls.delete(previous.id); event('delete', `Deleted ${previous.title}`, previous.project_id, previous.id); result = { deleted: true };
    } else if (route === '/api/import' && method === 'POST') {
      const input = parse(options); if (!Object.hasOwn(KIND_CONFIG, input.kind)) fail('Choose a supported record type.');
      if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 500) fail('Import 1 to 500 rows at a time.');
      const projectId = input.project_id || null; if (projectId) getProject(projectId);
      const titles = new Set(state.records.filter(item => item.kind === input.kind && item.project_id === projectId).map(item => item.title.trim().toLowerCase()));
      const imported = input.rows.map((item: RecordInput) => { if (item.kind !== input.kind) fail('All rows must have the selected record type.'); const parsed = validated({ ...item, id: crypto.randomUUID(), project_id: projectId }); const key = parsed.title.toLowerCase(); if (titles.has(key)) fail(`An item with this title already exists: ${parsed.title}.`); titles.add(key); return row(parsed); });
      state.records.push(...imported); for (const item of imported) event('import', `Imported ${item.title}`, item.project_id, item.id); result = { count: imported.length };
    } else if (/^\/api\/files\/[^/]+$/.test(route) && method === 'GET') {
      const record = getRecord(route.split('/').pop()!), blob = files.get(record.id); if (record.kind !== 'document' || !blob) fail('No sample or locally uploaded file is attached to this item.');
      if (!urls.has(record.id)) urls.set(record.id, URL.createObjectURL(blob!)); result = { url: urls.get(record.id) };
    } else fail('This action is not available in the public showcase.');
    return copy(result) as T;
  }
  async function uploadFile(file: File, payload: ShowcaseUpload, onStage?: (text: string) => void): Promise<void> {
    if (payload.project_id) getProject(payload.project_id);
    if (!file || file.size < 1 || file.size > 20 * 1024 * 1024 || file.size !== payload.size || file.name !== payload.name) fail('Choose a file between 1 byte and 20 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase() || '', mime = FILE_TYPES[extension];
    if (!mime || file.name.length > 240 || /[\x00-\x1f/\\]/.test(file.name)) fail('Choose a PDF, image, Office document, CSV or text file with a valid name.');
    if (!KIND_CONFIG.document.fields.find(field => field.key === 'category')?.options?.includes(payload.category)) fail('Choose a document category.');
    onStage?.('Reading into this browser session…');
    const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer()), prefix = new TextDecoder().decode(bytes), starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
    const matches = extension === 'pdf' ? prefix.startsWith('%PDF-') : extension === 'png' ? starts(137,80,78,71,13,10,26,10) : ['jpg','jpeg'].includes(extension) ? starts(255,216,255) : extension === 'gif' ? /^GIF8[79]a/.test(prefix) : extension === 'webp' ? prefix.startsWith('RIFF') && prefix.slice(8,12) === 'WEBP' : ['heic','heif'].includes(extension) ? prefix.slice(4,8) === 'ftyp' : ['tif','tiff'].includes(extension) ? starts(73,73,42,0) || starts(77,77,0,42) : ['docx','xlsx','pptx'].includes(extension) ? starts(80,75,3,4) : ['doc','xls','ppt'].includes(extension) ? starts(208,207,17,224,161,177,26,225) : extension === 'rtf' ? prefix.startsWith('{\\rtf') : !bytes.includes(0) && !/^\s*(<!doctype html|<html|<svg|<script)/i.test(prefix);
    if (!matches) fail('The file contents do not match its extension.');
    const record = row(validated({ kind: 'document', project_id: payload.project_id, title: payload.title || file.name, status: 'Current', data: { category: payload.category, file_name: file.name, file_size: file.size, mime_type: mime, source: 'Local browser-session upload; never sent to a server' } }));
    record.data.storage_path = `showcase/${record.id}.${extension}`;
    files.set(record.id, file.slice(0, file.size, mime)); state.records.push(record); event('upload', `Added ${record.title} to this browser session`, record.project_id, record.id); onStage?.('Available in this session only.');
  }
  function dispose() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); }
  function reset() { dispose(); const fresh = seed(); state = fresh.state; files = fresh.files; }
  return { request, uploadFile, reset, dispose, initialProjectId: SHOWCASE_PROJECT_ID, snapshot: () => copy(state) };
}
