// Renames timestamped smoke-test samples for presentation, through authenticated APIs.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const token = JSON.parse(readFileSync(process.env.PM_TEST_TOKEN_FILE, 'utf8')).access_token;
const base = process.env.PM_TEST_URL || 'http://127.0.0.1:8792';
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
}
const initial = await api('/api/bootstrap');
const project = initial.projects.find(p => p.name === 'Oak Street House · Demo' && p.is_demo);
assert(project, 'Expected the explicitly labeled demo project.');
const rows = initial.records.filter(r => r.project_id === project.id);
const changed = [];
const groups = [
  { kind: 'contact', pattern: /^Demo plumbing contractor \d{4}-/, title: 'Sample Plumbing Contractor' },
  { kind: 'bid', pattern: /^Demo rough-plumbing price \d{4}-/, title: 'Sample Rough-Plumbing Quote' },
  { kind: 'document', pattern: /^Demo plumbing quote \d{4}-/, title: 'Sample Plumbing Quote Attachment' },
];
for (const group of groups) {
  const matches = rows.filter(r => r.kind === group.kind && group.pattern.test(r.title)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const existing = rows.filter(r => r.kind === group.kind && r.title.startsWith(`${group.title} `)).length;
  for (let i = 0; i < matches.length; i++) {
    const row = matches[i], label = String.fromCharCode(65 + existing + i), title = `${group.title} ${label}`;
    await api(`/api/records/${row.id}`, 'PATCH', { version: row.version, title });
    changed.push({ kind: row.kind, title });
  }
}
const fresh = await api('/api/bootstrap');
const after = fresh.records.filter(r => r.project_id === project.id);
assert.equal(after.filter(r => r.kind === 'task' && r.data.source_id).length, 109);
assert.equal(after.filter(r => r.kind === 'check').length, 44);
console.log(JSON.stringify({ changed, sourceRows: 109, checks: 44 }, null, 2));
