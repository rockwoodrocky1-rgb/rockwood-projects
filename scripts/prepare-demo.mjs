// Applies fictional presentation states through the same authenticated APIs as the UI.
// Requires PM_TEST_TOKEN_FILE. Never modifies a real project or passes an inspection.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const token = JSON.parse(readFileSync(process.env.PM_TEST_TOKEN_FILE, 'utf8')).access_token;
const base = process.env.PM_TEST_URL || 'http://127.0.0.1:8792';
const start = process.env.PM_DEMO_START || '2026-10-13';
const day = offset => { const date = new Date(`${start}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${result.error || response.status}`);
  return result;
}
const initial = await api('/api/bootstrap');
const project = initial.projects.find(p => p.name === 'Oak Street House · Demo' && p.is_demo);
assert(project, 'The explicitly labeled Oak Street demonstration project must exist.');
const rows = initial.records.filter(r => r.project_id === project.id);
const checksBefore = JSON.stringify(rows.filter(r => r.kind === 'check').map(r => [r.id, r.status, r.version]).sort());
async function contact(title, trade, role = 'Contractor') {
  const existing = rows.find(r => r.kind === 'contact' && r.title === title);
  if (existing) return existing;
  const { record } = await api('/api/records', 'POST', { kind: 'contact', project_id: project.id, title, status: 'Active', data: { company: 'Fictional demonstration contact', trade, role, notes: 'Demo only. No real person, contractor or contact channel.' } });
  rows.push(record); return record;
}
const electrical = await contact('Sample Electrical Crew', 'Electrical');
const hvac = await contact('Sample HVAC Crew', 'Mechanical / HVAC');
const plumber = await contact('Sample Plumbing Crew', 'Plumbing');
const lead = await contact('Sample Site Lead', 'Project coordination', 'Team member');
const updates = [
  { source: 'P3-24', status: 'Working', owner: lead.id, offset: 0, finish: 3, extra: { contractor_id: electrical.id, actual_start: start, location: 'Kitchen', completion_criteria: 'Rough electrical work ready for the separately recorded official inspection.' } },
  { source: 'P3-20', status: 'Ready', owner: lead.id, offset: 1, finish: 3, extra: { contractor_id: hvac.id, location: 'Living room', completion_criteria: 'Rough HVAC installation ready for its separately recorded inspection.' } },
  { source: 'P3-22', status: 'Blocked', owner: lead.id, offset: 0, finish: 2, extra: { contractor_id: plumber.id, location: 'Kitchen / Bathroom', blocker_reason: `Fictional demo: the plumbing fittings delivery moved to ${day(2)}. The crew is waiting for those materials.` } },
  { source: 'P2-01', status: 'Done', owner: lead.id, offset: 0, finish: 0, extra: { actual_start: start, actual_finish: start, completion_criteria: 'Fictional demo: approved plan set received and filed; this is not an inspection pass.' } },
  { source: 'P2-04', status: 'Ready to check', owner: lead.id, offset: 0, finish: 0, extra: { actual_start: start, completion_criteria: 'Site lead reviews the scope by trade and confirms that no work is missing.' } },
];
const saved = [];
for (const update of updates) {
  const row = rows.find(r => r.kind === 'task' && r.data.source_id === update.source);
  assert(row, `Missing required source row ${update.source}`);
  const { record } = await api(`/api/records/${row.id}`, 'PATCH', { version: row.version, status: update.status, owner_id: update.owner, due_date: day(update.finish), data: { ...row.data, ...update.extra, start_date: day(update.offset), demo_note: 'Fictional presentation status and dates. Real inspection results remain unconfirmed.' } });
  saved.push({ source: update.source, task: record.title, status: record.status, due: record.due_date });
}
await api(`/api/projects/${project.id}`, 'PATCH', { version: project.version, status: 'Active' });
const after = await api('/api/bootstrap');
const afterRows = after.records.filter(r => r.project_id === project.id);
assert.equal(afterRows.filter(r => r.kind === 'task' && r.data.source_id).length, 109, 'All source work rows remain intact.');
assert.equal(JSON.stringify(afterRows.filter(r => r.kind === 'check').map(r => [r.id, r.status, r.version]).sort()), checksBefore, 'Official checks must remain untouched.');
console.log(JSON.stringify({ result: 'passed', sourceRows: 109, inspectionsUnchanged: true, updates: saved }, null, 2));
