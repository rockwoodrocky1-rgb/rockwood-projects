import { describe, expect, it } from 'vitest';
import { agentCapabilities } from '../lib/capabilities';
import { KIND_CONFIG } from '../lib/domain';

describe('agent discovery contract', () => {
  const workspace = { id: '11111111-1111-4111-8111-111111111111', name: 'Example workspace', role: 'reader' };

  it('advertises reads but never available writes for a read-only or unknown role', () => {
    for (const role of ['reader', 'unrecognized']) {
      const capabilities = agentCapabilities({ ...workspace, role });
      expect(capabilities.tools.filter(tool => tool.available).map(tool => tool.name)).toEqual(['capabilities', 'snapshot', 'get_record', 'get_project', 'get_file_url', 'permit_dashboard', 'permit_queue', 'get_permit_check', 'list_cam_visits', 'get_cam_visit', 'get_cam_pdf', 'list_cam_reports']);
      expect(capabilities.tools.find(tool => tool.name === 'update_record')?.available).toBe(false);
    }
    expect(agentCapabilities({ ...workspace, role: 'manager' }).tools.every(tool => tool.available)).toBe(true);
  });

  it('uses the actual field/status catalog and requires reviewed versions for edits', () => {
    const capabilities = agentCapabilities(workspace);
    expect(capabilities.recordKinds).toBe(KIND_CONFIG);
    for (const name of ['update_record', 'update_project']) {
      const tool = capabilities.tools.find(tool => tool.name === name)!;
      expect(tool.inputSchema.required).toEqual(['id', 'version', 'changes']);
      expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    }
    expect(capabilities.tools.find(tool => tool.name === 'create_record')?.inputSchema.properties.record?.properties.kind.enum).toEqual(Object.keys(KIND_CONFIG));
  });

  it('does not advertise unsupported sending, approvals, deletes or arbitrary execution', () => {
    const capabilities = agentCapabilities(workspace);
    const names = capabilities.tools.map(tool => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const unsupported of ['send_reminder', 'send_email', 'delete_record', 'run_sql', 'run_shell', 'pay_invoice', 'approve_inspection']) expect(names).not.toContain(unsupported);
    expect(capabilities.notImplemented).toContain('Email/SMS delivery and inbound replies');
    expect(capabilities.rules.activitySummaryLimit).toBe(250);
    expect(capabilities.workspace).toEqual(workspace);
  });
});
