import { describe, expect, it } from 'vitest';
import requirements from '../data/customer-requirements.json';
import { createProjectRecords, validateRecord, validateTransition, scheduleWarnings, parseImport, bidTotal, isDate, exportRecordsCsv, PHASES, KIND_CONFIG, type RecordInput, type RecordRow } from '../lib/domain';
const project='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const row=(input:RecordInput):RecordRow=>({id:input.id??crypto.randomUUID(),workspace_id:workspace,project_id:input.project_id??project,kind:input.kind,title:input.title,status:input.status??KIND_CONFIG[input.kind].statuses[0],owner_id:input.owner_id??null,due_date:input.due_date??null,data:input.data??{},version:1,created_at:'2026-10-13T12:00:00Z',updated_at:'2026-10-13T12:00:00Z'});
const accepted=(r:RecordRow):RecordRow=>({...r,status:r.kind==='check'?'Passed':'Done',data:{...r.data,applicability:'Required',result_date:'2026-10-13',inspector:'Sample inspector',evidence:'Inspection report 001'}});
const edit=(r:RecordRow,status:string,data=r.data):RecordInput=>({id:r.id,kind:r.kind,project_id:r.project_id,title:r.title,status,data});

describe('Customer template coverage',()=>{
 it('preserves every original task, source owner, note and relative timing across 15 phases',()=>{
  const records=createProjectRecords(project);const tasks=records.filter(r=>r.kind==='task');
  expect(tasks).toHaveLength(109);expect(PHASES).toHaveLength(15);
  for(const source of requirements.master_tasks){const t=tasks.find(t=>t.data?.source_id===source.id)!;expect(t).toBeDefined();expect(t.title).toBe(source.task);expect(t.data?.source_owner).toBe(source.owner);expect(t.data?.notes).toBe(source.notes);expect(t.data?.due_timing).toBe(source.due_timing);expect(t.data?.source_row).toEqual(source);expect(t.data?.suggested_owner).not.toMatch(/Chris|RVS/);expect(t.due_date).toBeNull();expect(t.data?.start_date).toBeNull();expect(t.status).toBe('Waiting');expect(t.data?.reminder_mode).toBe('Off');}
 });
 it('preserves all35 catalogue rows and splits compound checks without duplicate roofing finals',()=>{
  const records=createProjectRecords(project);const checks=records.filter(r=>r.kind==='check');
  expect(new Set(checks.map(c=>c.data?.source_id)).size).toBe(35);
  expect(checks).toHaveLength(44);expect(checks.filter(c=>c.data?.source_id==='P6-25')).toHaveLength(6);
  expect(checks.filter(c=>c.data?.source_id==='P6-35')).toHaveLength(2);
  expect(checks.filter(c=>c.data?.source_id==='P6-15')).toHaveLength(2);
  const roofTasks=records.filter(r=>['P3-17','P4-17'].includes(r.data?.source_id));expect(roofTasks[0].data?.check_ids).toEqual(roofTasks[1].data?.check_ids);
  for(const c of checks){expect(c.data?.source_row).toEqual(requirements.inspection_list.find(s=>s.id===c.data?.source_id));expect(c.data?.applicability).toBe('Needs confirming');}
 });
 it('uses UUID links that all resolve, includes gates for selected phases, never fabricates real durations',()=>{
  for(const records of [createProjectRecords(project),createProjectRecords(project,{selectedPhases:[8]})]){const byId=new Map(records.map(r=>[r.id,r]));for(const r of records){validateRecord(r);for(const key of ['prerequisite_ids','check_ids','linked_task_ids'])for(const id of r.data?.[key]??[])expect(byId.has(id),`${r.title} ${key} ${id}`).toBe(true);}}
  const partial=createProjectRecords(project,{selectedPhases:[8]});expect(partial.filter(r=>r.kind==='task').every(r=>r.data?.phase===8)).toBe(true);expect(partial.some(r=>r.data?.source_id==='P6-18')).toBe(true);
  const hang=partial.find(r=>r.data?.source_id==='P3-29')!;expect(hang.data?.unresolved_prerequisite_source_ids).toContain('P3-21');expect(hang.data?.duration_days).toBeNull();
 });
 it('keeps fictional data explicit and relationships inside the demo',()=>{
  const records=createProjectRecords(project,{isDemo:true,startDate:'2026-10-13'});const hang=records.find(r=>r.data?.source_id==='P3-29')!;expect(hang.data?.start_date).toBe('2026-10-21');expect(hang.data?.demo_note).toMatch(/Fictional/);
  const bid=records.find(r=>r.kind==='bid')!;expect(bid.data?.is_demo).toBe(true);expect(records.find(r=>r.id===bid.data?.contractor_id)?.kind).toBe('contact');expect(bidTotal(bid.data!)).toBe(6126);
 });
});

describe('Manual gates and scheduling',()=>{
 it('requires all rough, insulation and conditional gas approvals before drywall',()=>{
  const records=createProjectRecords(project).map(row).map(accepted);const hang=records.find(r=>r.data.source_id==='P3-29')!;
  expect(()=>validateTransition(hang,edit(hang,'Working'),records)).not.toThrow();
  for(const source of ['P6-18','P6-19','P6-20','P6-21','P6-22']){const changed=records.map(r=>r.data.source_id===source?{...r,status:'Failed'}:r);expect(()=>validateTransition(hang,edit(hang,'Working'),changed)).toThrow(/prerequisite/);}
 });
 it('does not let the inspection wrapper substitute for an accepted authoritative check',()=>{
  const records=createProjectRecords(project).map(row).map(accepted);const wrapper=records.find(r=>r.data.source_id==='P3-23')!;const check=records.find(r=>r.data.source_id==='P6-19')!;check.status='Failed';
  expect(()=>validateTransition(wrapper,edit(wrapper,'Done'),records)).toThrow(/accepted result/);
  const hang=records.find(r=>r.data.source_id==='P3-29')!;expect(()=>validateTransition(hang,edit(hang,'Working'),records)).toThrow(/prerequisite/);
 });
 it('requires a non-applicability reason and preserves existing customer gates',()=>{
  const records=createProjectRecords(project).map(row);const check=records.find(r=>r.data.source_id==='P6-24')!;
  expect(()=>validateTransition(check,edit(check,'Not applicable'),records)).toThrow(/why/);
  expect(()=>validateTransition(check,edit(check,'Not applicable',{...check.data,applicability:'Not applicable',applicability_reason:'Confirmed against project permit card'}),records)).not.toThrow();
  const work=records.find(r=>r.data.source_id==='P3-31')!;expect(()=>validateTransition(work,edit(work,'Waiting',{...work.data,prerequisite_ids:[]}),records)).toThrow(/cannot be removed/);
 });
 it('lets a partial project document completed earlier work without bypassing required checks',()=>{
  const records=createProjectRecords(project,{selectedPhases:[8]}).map(row).map(accepted);const work=records.find(r=>r.data.source_id==='P3-27')!;
  expect(()=>validateTransition(work,edit(work,'Working'),records)).toThrow(/excluded phases/);
  const documented={...work.data,prerequisite_resolution:'Earlier rough work completed by prior contractor; inspection results attached.'};
  expect(()=>validateTransition(work,edit(work,'Working',documented),records)).not.toThrow();
  records.find(r=>r.data.source_id==='P6-20')!.status='Failed';expect(()=>validateTransition(work,edit(work,'Working',documented),records)).toThrow(/prerequisite/);
 });
 it('requires result evidence and closed corrections before a pass',()=>{
  const check=row({kind:'check',project_id:project,title:'Rough inspection',status:'Failed',data:{applicability:'Required'}});const correction=row({kind:'task',project_id:project,title:'Repair failed work',status:'Working'});
  expect(()=>validateTransition(check,edit(check,'Passed'),[check])).toThrow(/result date/);
  const data={applicability:'Required',result_date:'2026-10-13',inspector:'Reviewer',evidence:'Signed report',corrective_action_ids:[correction.id]};
  expect(()=>validateTransition(check,edit(check,'Passed',data),[check,correction])).toThrow(/corrections/);
  correction.status='Done';expect(()=>validateTransition(check,edit(check,'Passed',data),[check,correction])).not.toThrow();
 });
 it('refuses circular or foreign-project prerequisites and warns about date conflicts',()=>{
  const a=row({kind:'task',title:'A',project_id:project,due_date:'2026-10-20'});const b=row({kind:'task',title:'B',project_id:project,data:{prerequisite_ids:[a.id],start_date:'2026-10-15'}});
  expect(scheduleWarnings(b,[a,b]).join(' ')).toMatch(/before A is due/);expect(()=>validateTransition(a,edit(a,'Waiting',{prerequisite_ids:[b.id]}),[a,b])).toThrow(/circular/);
  b.project_id=crypto.randomUUID();expect(()=>validateTransition(a,edit(a,'Waiting',{prerequisite_ids:[b.id]}),[a,b])).toThrow(/same project/);
 });
 it('requires holds cleared and final checks resolved before certificate application',()=>{
  const records=createProjectRecords(project).map(row).map(accepted);const application=records.find(r=>r.data.template_key==='P6-35-application')!;const hold=row({kind:'hold',title:'Outstanding fee',project_id:project,status:'Open'});
  expect(()=>validateTransition(application,edit(application,'Passed'),[...records,hold])).toThrow(/open hold/);hold.status='Cleared';expect(()=>validateTransition(application,edit(application,'Passed'),[...records,hold])).not.toThrow();
 });
});

describe('Data validation and CSV intake',()=>{
 it('validates actual dates, numeric prices, chronology and statuses',()=>{
  expect(isDate('2026-02-29')).toBe(false);expect(isDate('2028-02-29')).toBe(true);
  expect(()=>validateRecord({kind:'task',title:'Work',due_date:'2026-04-31'})).toThrow(/real date/);
  expect(()=>validateRecord({kind:'bid',title:'Bid',data:{labor_cost:-10}})).toThrow(/negative/);
  expect(()=>validateRecord({kind:'bid',title:'Bid',data:{labor_cost:'100'}})).toThrow(/number/);
  expect(()=>validateRecord({kind:'task',title:'Work',due_date:'2026-10-13',data:{start_date:'2026-10-14'}})).toThrow(/before planned start/);
  expect(()=>validateRecord({kind:'task',title:'Work',status:'Passed'})).toThrow(/status/);
 });
 it('previews quoted multiline bids, typed money and checkbox values',()=>{
  const result=parseImport('Title,Status,Labor price,Materials price,Tax amount,Exclusions\n"Plumbing, rough",received,"$1,200.50",800,140,"No fixtures\nPermit excluded"','bid');
  expect(result.errors).toEqual([]);expect(result.rows[0].data?.labor_cost).toBe(1200.5);expect(result.rows[0].data?.exclusions).toContain('\n');expect(bidTotal(result.rows[0].data!)).toBe(2140.5);
  expect(parseImport('Title,Long-lead item\nWindows,yes','material').rows[0].data?.long_lead).toBe(true);
 });
 it('rejects malformed dates, ambiguous numbers, duplicate rows, columns and unknown fields',()=>{
  expect(parseImport('Title,Due date\nWork,10/13/26','task').errors[0]).toMatch(/YYYY/);
  expect(parseImport('Title,Labor price\nWork,"1,2"','bid').errors[0]).toMatch(/number/);
  expect(parseImport('Title\nA\na','task').errors[0]).toMatch(/Duplicate title/);
  expect(parseImport('Title,title\nA,B','task').errors[0]).toMatch(/Duplicate column/);
  expect(parseImport('Title,Guess\nA,B','task').errors[0]).toMatch(/Unknown column/);
  expect(parseImport('Title,Status\nA,Approved','task').errors[0]).toMatch(/status/);
 });
 it('protects spreadsheet exports from formula execution',()=>{
  const csv=exportRecordsCsv([row({kind:'contact',title:'=HYPERLINK("https://example.com")',data:{notes:'+1+1'}})]);expect(csv).toContain("'=HYPERLINK");expect(csv).toContain("'+1+1");
 });
});
