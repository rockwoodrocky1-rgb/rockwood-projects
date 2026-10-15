import Papa from 'papaparse';
import requirements from '../data/customer-requirements.json';
import { PERMIT_STATUSES, permitSatisfied, validatePermit, validatePermitLinks } from './permits';

export type Kind = 'permit' | 'task' | 'contact' | 'bid' | 'material' | 'check' | 'document' | 'decision' | 'contract' | 'payment' | 'hold' | 'review';
export interface Project { id:string; workspace_id:string; name:string; address:string; project_type:string; status:string; start_date:string|null; target_date:string|null; lead:string; description:string; locations:string[]; is_demo:boolean; version:number; created_at:string }
export interface RecordRow { id:string; workspace_id:string; project_id:string|null; kind:Kind; title:string; status:string; owner_id:string|null; due_date:string|null; data:Record<string,any>; version:number; created_at:string; updated_at:string }
export interface Activity { id:string; workspace_id:string; project_id:string|null; record_id:string|null; action:string; summary:string; actor_id:string; created_at:string }
export interface Bootstrap { workspace:{id:string;name:string;role:string}; projects:Project[]; records:RecordRow[]; events:Activity[] }
export interface RecordInput { id?:string; kind:Kind; project_id?:string|null; title:string; status?:string; owner_id?:string|null; due_date?:string|null; data?:Record<string,any> }
export interface FieldDef { key:string; label:string; type:'text'|'textarea'|'number'|'date'|'select'|'checkbox'|'email'|'tel'|'url'; options?:string[]; required?:boolean; help?:string }
const field=(key:string,label:string,type:FieldDef['type']='text',options?:string[]):FieldDef=>({key,label,type,...(options?{options}:{})});
const notes=field('notes','Notes','textarea');
const trade=field('trade','Trade');
const location=field('location','Room / area');
const contact=field('contractor_id','Contractor / contact ID');
export const REMINDER_MODES=['Due + overdue','Overdue only','Off'];
export const APPLICABILITY=['Needs confirming','Required','Not applicable'];
export const PHASES=Array.from(new Map(requirements.master_tasks.map(t=>[parseInt(t.phase,10),t.phase.replace(/^\d+\.\s*/, '')])).entries()).map(([number,name])=>({number,name}));
const applicabilityFields=[field('applicability','Does this apply?','select',APPLICABILITY),field('applicability_reason','Applicability decision / reason','textarea')];
export const KIND_CONFIG:Record<Kind,{label:string;singular:string;statuses:string[];fields:FieldDef[]}>= {
 task:{label:'Work',singular:'Work item',statuses:['Waiting','Ready','Working','Blocked','Ready to check','Done','Not applicable'],fields:[field('phase','Phase number','number'),trade,location,field('suggested_owner','Responsible role'),contact,field('priority','Priority','select',['High','Medium','Low']),field('start_date','Planned start','date'),field('baseline_start','Original planned start','date'),field('baseline_finish','Original planned finish','date'),field('actual_start','Actual start','date'),field('actual_finish','Actual finish','date'),field('due_timing','Timing from template'),field('prerequisite_resolution','Excluded earlier work: completion evidence','textarea'),field('duration_days','Planned duration (days)','number'),field('reminder_mode','Reminder preference','select',REMINDER_MODES),field('inspection_required','Check required','checkbox'),field('inspection_type','Check type'),...applicabilityFields,field('waiting_reason','What are we waiting for?','textarea'),field('blocker_reason','What is stopping the work?','textarea'),field('completion_criteria','What finished means','textarea'),field('budget','Budget','number'),notes]},
 contact:{label:'Contacts',singular:'Contact',statuses:['Active','Considering','Inactive'],fields:[field('company','Company'),{...trade,label:'Trade / department',help:'Groups this contact in the directory and people lists.'},field('email','Email','email'),field('phone','Phone','tel'),field('role','Role','select',['Contractor','Supplier','Client','Inspector','Team member','Other']),field('address','Address'),field('license_number','License number'),field('insurance_expiry','Insurance expires','date'),field('service_area','Service area'),field('past_jobs','Past jobs / experience','textarea'),field('reference_contact','Reference contact'),field('reference_phone','Reference phone','tel'),field('quality_notes','Quality / reliability notes','textarea'),notes]},
 bid:{label:'Bids & prices',singular:'Bid / price',statuses:['Need someone','Requested','Received','Comparing','Selected','Declined'],fields:[contact,field('contractor_name','Contractor name'),trade,field('scope','Included scope','textarea'),field('labor_cost','Labor price','number'),field('material_cost','Materials price','number'),field('equipment_cost','Equipment price','number'),field('tax_amount','Tax amount','number'),field('other_cost','Other costs','number'),field('currency','Currency','select',['USD']),field('exclusions','Exclusions','textarea'),field('scope_gaps','Missing scope / questions','textarea'),field('value_engineering','Alternative / value engineering','textarea'),field('lead_time','Lead time'),field('valid_until','Price valid until','date'),field('payment_terms','Payment terms','textarea'),field('delay_terms','Delay terms','textarea'),field('shop_drawings','Shop drawings / technical approvals','textarea'),field('source_job','Past job / price source'),field('received_date','Received date','date'),notes]},
 material:{label:'Materials',singular:'Material / delivery',statuses:['Need to select','Need to order','Ordered','Confirmed','In transit','Delivered','Delayed','Cancelled'],fields:[trade,location,field('supplier_id','Supplier contact ID'),field('supplier_name','Supplier'),field('specification','Model / specification / sizes','textarea'),field('quantity','Quantity','number'),field('unit','Unit'),field('unit_cost','Unit cost','number'),field('total_cost','Total cost','number'),field('order_number','Order / purchase order'),field('ordered_date','Order date','date'),field('expected_date','Expected delivery','date'),field('received_date','Received date','date'),field('lead_time','Lead time'),field('long_lead','Long-lead item','checkbox'),field('product_approval','Product approval / NOA'),field('engineering_package','Engineering / shop drawing reference'),field('opening_readiness','Opening / field measurement readiness','textarea'),notes]},
 permit:{label:'Permits',singular:'Permit',statuses:[...PERMIT_STATUSES],fields:[field('permit_number','Permit number'),field('jurisdiction','Jurisdiction'),field('permit_type','Permit type','select',['Master','Subpermit','Standalone']),field('parent_permit_id','Master permit'),trade,field('raw_status','Status reported by source'),field('source_url','Official source URL','url'),field('evidence','Source details / evidence','textarea'),field('application_date','Application date','date'),field('issued_date','Issued date','date'),field('expiry_date','Expiration date','date'),field('closed_date','Closure date','date'),field('next_action','Next action','textarea'),field('next_action_date','Next action date','date'),field('fees_due','Fees due','number'),field('corrections','Corrections / holds','textarea'),field('automation_paused','Protect this record from automated updates','checkbox'),field('applicability_reason','Reason no permit is required','textarea'),notes]},
 check:{label:'Checks',singular:'Check / inspection',statuses:['Needs confirming','Waiting','Scheduled','Passed','Failed','Not applicable'],fields:[field('check_type','Check type','select',['Official inspection','Site readiness','Document review','Test','Certificate application','Certificate issuance','Internal review']),field('inspection_type','Discipline / inspection type'),field('permit_number','Permit number'),field('permit_id','Linked permit'),field('external_key','Source inspection identifier'),field('source_url','Official source URL','url'),field('inspection_code','Municipal inspection code'),field('jurisdiction','Jurisdiction'),location,...applicabilityFields,field('scheduled_date','Scheduled date','date'),field('result_date','Result date','date'),field('inspector','Inspector / reviewer'),field('evidence','Result reference / evidence','textarea'),field('findings','Findings / required corrections','textarea'),field('reinspection_date','Reinspection date','date'),field('automation_paused','Protect this record from automated updates','checkbox'),field('permit_closed','Permit closed','checkbox'),field('certificate_type','Certificate type','select',['CO','CC','Other']),notes]},
 document:{label:'Files',singular:'File / document',statuses:['Needed','Draft','Current','Superseded','Accepted'],fields:[field('category','Category','select',['Plans','Permit','Bid','Contract','Selection','Inspection','Trade warranty','Manufacturer warranty','Product approval / NOA','As-built survey','Manual','Contacts','Colors','Certificate','Invoice','Other']),field('revision','Revision'),field('document_date','Document date','date'),field('expiry_date','Expiry date','date'),field('approved_by','Approved by'),field('source','Source / provider'),field('related_record_id','Related work / record ID'),notes]},
 decision:{label:'Decisions',singular:'Decision / change',statuses:['Needed','Proposed','Approved','Rejected','Implemented'],fields:[field('decision_type','Type','select',['Selection','Question','Scope change','Design clarification','Other']),field('question','Decision needed','textarea'),field('proposed_answer','Proposed answer','textarea'),field('approved_answer','Approved decision','textarea'),field('approved_by','Approved by'),field('decision_date','Decision date','date'),field('cost_impact','Cost impact','number'),field('days_impact','Schedule impact (days)','number'),field('evidence','Decision evidence','textarea'),notes]},
 contract:{label:'Contracts',singular:'Contract',statuses:['Needed','Draft','Sent','Signed','Complete','Cancelled'],fields:[contact,field('contractor_name','Contractor name'),trade,field('scope','Agreed scope','textarea'),field('amount','Contract value','number'),field('start_date','Start date','date'),field('finish_date','Finish date','date'),field('payment_terms','Payment terms','textarea'),field('delay_terms','Delay terms','textarea'),field('exclusions','Exclusions','textarea'),field('retainage_percent','Retainage (%)','number'),field('signed_date','Signed date','date'),field('document_reference','Signed document reference'),notes]},
 payment:{label:'Payments',singular:'Payment / reconciliation',statuses:['Expected','Invoiced','Under review','Approved','Paid','Disputed'],fields:[contact,field('payee','Payee'),field('contract_id','Contract ID'),field('invoice_number','Invoice number'),field('payment_type','Type','select',['Invoice','Deposit','Progress payment','Retainage','Change order','Final payment','Fee']),field('amount','Invoice amount','number'),field('retainage','Retainage held','number'),field('change_order_amount','Change order amount','number'),field('paid_amount','Paid amount','number'),field('invoice_date','Invoice date','date'),field('paid_date','Paid date','date'),field('reference','Payment reference'),field('reconciliation','Reconciliation / discrepancy','textarea'),notes]},
 hold:{label:'Holds',singular:'Hold / blocker',statuses:['Open','Working','Cleared'],fields:[field('hold_type','Type','select',['Missing contractor','Material','Decision','Inspection','Fee','Document','Access','Other']),field('reason','What needs resolving?','textarea'),field('responsible_role','Who is arranging the solution?'),field('resolution','Resolution','textarea'),field('cleared_date','Cleared date','date'),field('evidence','Clearance evidence','textarea'),notes]},
 review:{label:'Reviews',singular:'Review / past job',statuses:['Draft','In review','Complete'],fields:[field('review_type','Type','select',['Past job','Closeout','Contractor','Lessons learned']),field('job_name','Job name / reference'),field('completed_date','Completed date','date'),field('original_budget','Original budget','number'),field('final_cost','Final cost','number'),field('planned_finish','Planned finish','date'),field('actual_finish','Actual finish','date'),field('contractor_id','Contractor contact ID'),field('what_worked','What worked','textarea'),field('problems','Problems / causes','textarea'),field('lessons_learned','What to do differently','textarea'),field('source_documents','Supporting documents / references','textarea'),notes]}
};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isDate(value:unknown):value is string { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00.000Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===value; }
const ids=(value:unknown):string[]=>Array.isArray(value)?value.filter((x):x is string=>typeof x==='string'):[];
const moneyFields=new Set(['labor_cost','material_cost','equipment_cost','tax_amount','other_cost','unit_cost','total_cost','amount','retainage','paid_amount','original_budget','final_cost','budget']);
const signedNumbers=new Set(['cost_impact','days_impact','change_order_amount']);
const assertSafeJson=(value:unknown,depth=0):void=>{if(depth>8)throw new Error('Record details are nested too deeply.');if(value===null||typeof value==='boolean')return;if(typeof value==='string'){if(value.length>30000)throw new Error('A detail is too long.');return;}if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Numbers must be finite.');return;}if(Array.isArray(value)){if(value.length>1000)throw new Error('Too many linked items.');value.forEach(v=>assertSafeJson(v,depth+1));return;}if(typeof value==='object'){for(const [k,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Invalid field name.');assertSafeJson(v,depth+1);}return;}throw new Error('Details must contain plain JSON values.');};
export function validateRecord(input:unknown):RecordInput {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('A record is required.');
 const raw=input as Record<string,unknown>;
 if(typeof raw.kind!=='string'||!Object.hasOwn(KIND_CONFIG,raw.kind))throw new Error('Choose a supported record type.');
 const kind=raw.kind as Kind, config=KIND_CONFIG[kind];
 if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.trim().length>240)throw new Error('Enter a title of 1–240 characters.');
 const status=raw.status??config.statuses[0];
 if(typeof status!=='string'||!config.statuses.includes(status))throw new Error(`Invalid ${config.singular.toLowerCase()} status.`);
 for(const k of ['id','project_id','owner_id'])if(raw[k]!=null&&(typeof raw[k]!=='string'||!UUID.test(raw[k] as string)))throw new Error(`${k.replace('_',' ')} must be a valid ID.`);
 if(raw.due_date!=null&&raw.due_date!==''&&!isDate(raw.due_date))throw new Error('Due date must be a real date in YYYY-MM-DD format.');
 if(raw.data!=null&&(typeof raw.data!=='object'||Array.isArray(raw.data)))throw new Error('Details must be an object.');
 if(kind==='permit')validatePermit(raw);
 assertSafeJson(raw.data??{});
 if(JSON.stringify(raw.data??{}).length>100000)throw new Error('Record details are too large.');
 const data={...(raw.data as Record<string,any>??{})};
 for(const f of config.fields){const v=data[f.key];if(v==null||v==='')continue;if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${f.label} must be a number.`);if(!signedNumbers.has(f.key)&&v<0)throw new Error(`${f.label} cannot be negative.`);if(moneyFields.has(f.key)&&v>1e12)throw new Error(`${f.label} is too large.`);}else if(f.type==='checkbox'){if(typeof v!=='boolean')throw new Error(`${f.label} must be yes or no.`);}else {if(typeof v!=='string')throw new Error(`${f.label} must be text.`);if(f.type==='date'&&!isDate(v))throw new Error(`${f.label} must be a real date in YYYY-MM-DD format.`);if(f.type==='select'&&!f.options?.includes(v))throw new Error(`Choose a valid ${f.label.toLowerCase()}.`);if(f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw new Error('Enter a valid email address.');}}
 for(const k of ['prerequisite_ids','check_ids','corrective_action_ids','document_ids','linked_task_ids','related_record_ids'])if(data[k]!=null&&(!Array.isArray(data[k])||data[k].some((v:unknown)=>typeof v!=='string'||!UUID.test(v))))throw new Error(`${k.replaceAll('_',' ')} must contain record IDs.`);
 if(data.phase!=null&&(!Number.isInteger(data.phase)||data.phase<1||data.phase>15))throw new Error('Phase must be a whole number from 1 to 15.');
 if(data.retainage_percent!=null&&data.retainage_percent>100)throw new Error('Retainage cannot exceed 100%.');
 for(const [a,b] of [['start_date','finish_date'],['baseline_start','baseline_finish'],['actual_start','actual_finish']])if(data[a]&&data[b]&&data[a]>data[b])throw new Error('Finish date cannot be before start date.');
 if(data.start_date&&raw.due_date&&data.start_date>raw.due_date)throw new Error('Due date cannot be before planned start.');
 return {...(raw.id?{id:raw.id as string}:{}),kind,title:raw.title.trim(),status,project_id:(raw.project_id as string|null)??null,owner_id:(raw.owner_id as string|null)??null,due_date:(raw.due_date as string)||null,data};
}

export function bidTotal(data:Record<string,any>):number{return Math.round(['labor_cost','material_cost','equipment_cost','tax_amount','other_cost'].reduce((sum,key)=>sum+(typeof data[key]==='number'?data[key]:0),0)*100)/100;}
function confirmedNotApplicable(record:Pick<RecordRow,'status'|'data'>):boolean{return (record.status==='Not applicable'||record.data.applicability==='Not applicable')&&Boolean(record.data.applicability_reason?.trim());}
export function checkSatisfied(check:RecordRow):boolean{return confirmedNotApplicable(check)||(check.status==='Passed'&&check.data.applicability==='Required'&&isDate(check.data.result_date)&&Boolean(check.data.inspector?.trim())&&Boolean(check.data.evidence?.trim()||ids(check.data.document_ids).length));}
function dependencySatisfied(record:RecordRow,records:RecordRow[]):boolean {if(record.kind==='permit')return permitSatisfied(record);if(confirmedNotApplicable(record))return true;if(record.kind==='check')return checkSatisfied(record);if(record.kind==='hold')return record.status==='Cleared';if(record.kind==='material')return record.status==='Delivered';if(record.kind==='decision')return ['Approved','Implemented'].includes(record.status);if(record.status!=='Done')return false;return ids(record.data.check_ids).every(id=>{const c=records.find(x=>x.id===id);return c?.kind==='check'&&checkSatisfied(c);});}
export function scheduleWarnings(record:RecordRow,records:RecordRow[]):string[]{
 const warnings:string[]=[];const d=record.data??{};
 if(d.applicability==='Needs confirming')warnings.push('Confirm whether this work or check applies to this project.');
 if(record.status==='Blocked')warnings.push(d.blocker_reason||'Record what is blocking this work.');
 for(const id of ids(d.prerequisite_ids)){const prior=records.find(x=>x.id===id);if(!prior){warnings.push('A prerequisite is missing from this project.');continue;}if(!dependencySatisfied(prior,records))warnings.push(`Waiting for ${prior.title}${prior.kind==='check'?` (${prior.status})`:''}.`);if(d.start_date&&prior.due_date&&d.start_date<prior.due_date)warnings.push(`Planned start is before ${prior.title} is due to finish.`);}
 for(const id of ids(d.check_ids)){const c=records.find(x=>x.id===id);if(!c)warnings.push('A required check is missing.');else if(!checkSatisfied(c))warnings.push(`Check needed: ${c.title} (${c.status}).`);}
 if(ids(d.unresolved_prerequisite_source_ids).length&&!d.prerequisite_resolution?.trim())warnings.push('Some prerequisite phases were excluded. Add their work or confirm the project-specific sequence.');
 if(!record.due_date&&d.due_timing)warnings.push(`Date needs confirming: ${d.due_timing}.`);
 return [...new Set(warnings)];
}
export function validateTransition(previous:RecordRow,next:RecordInput,records:RecordRow[]):void {
 validatePermitLinks(previous,next,records);
 if(next.kind!==previous.kind)throw new Error('A record type cannot be changed.');
 const data=next.data??previous.data;const status=next.status??previous.status;const project=next.project_id===undefined?previous.project_id:next.project_id;
 if(previous.project_id!==project)throw new Error('Moving a record between projects requires rechecking its links. Create a new record in the destination project.');
 for(const key of ['prerequisite_ids','check_ids','corrective_action_ids','linked_task_ids'])for(const id of ids(data[key])){if(id===previous.id)throw new Error('A record cannot depend on itself.');const linked=records.find(r=>r.id===id);if(!linked)throw new Error('A linked record no longer exists.');if(linked.project_id!==project)throw new Error('Linked work and checks must belong to the same project.');if(key==='check_ids'&&linked.kind!=='check')throw new Error('Check links must point to check records.');}
 if(previous.data.source_id){
  for(const key of ['check_ids','prerequisite_ids'])if(ids(previous.data[key]).some(id=>!ids(data[key]).includes(id)))throw new Error('Template gates cannot be removed. Record a confirmed non-applicability reason on the prerequisite instead.');
  if(previous.data.source_id!==data.source_id||JSON.stringify(previous.data.source_row)!==JSON.stringify(data.source_row))throw new Error('The original customer source reference must be preserved.');
 }
 const reaches=(id:string,visited=new Set<string>()):boolean=>{if(id===previous.id)return true;if(visited.has(id))return false;visited.add(id);const r=records.find(v=>v.id===id);return ids(r?.data.prerequisite_ids).some(nextId=>reaches(nextId,visited));};
 if(ids(data.prerequisite_ids).some(id=>reaches(id)))throw new Error('These prerequisites would create a circular schedule.');
 if(status==='Not applicable'||data.applicability==='Not applicable'){if(!data.applicability_reason?.trim())throw new Error('Record why this item does not apply.');}
 if(previous.kind==='task'&&['Ready','Working','Ready to check','Done'].includes(status)){
  if(data.applicability==='Needs confirming')throw new Error('Confirm whether this work applies before releasing it.');
  if(ids(data.unresolved_prerequisite_source_ids).length&&!data.prerequisite_resolution?.trim())throw new Error('Resolve prerequisites from excluded phases before releasing this work.');
  for(const id of ids(data.prerequisite_ids)){const r=records.find(x=>x.id===id);if(!r||!dependencySatisfied(r,records))throw new Error(`Complete or clear the prerequisite: ${r?.title??'missing item'}.`);}
 }
 if(previous.kind==='task'&&status==='Done')for(const id of ids(data.check_ids)){const c=records.find(x=>x.id===id);if(!c||!checkSatisfied(c))throw new Error(`Record an accepted result or confirmed non-applicability for ${c?.title??'the required check'} before completing this work.`);}
 if(previous.kind==='check'&&status==='Passed'){
  for(const id of ids(data.prerequisite_ids)){const prior=records.find(r=>r.id===id);if(!prior||!dependencySatisfied(prior,records))throw new Error(`Complete or clear the prerequisite: ${prior?.title??'missing item'}.`);}
  if(data.applicability!=='Required')throw new Error('Confirm this check is required before recording a pass.');
  if(!isDate(data.result_date)||!data.inspector?.trim()||(!data.evidence?.trim()&&!ids(data.document_ids).length))throw new Error('A passed check needs its result date, inspector/reviewer and evidence reference.');
  for(const id of ids(data.corrective_action_ids)){const task=records.find(r=>r.id===id);if(!task||task.status!=='Done')throw new Error('Complete linked corrections before recording the check as passed.');}
 }
 if(previous.kind==='hold'&&status==='Cleared'&&(!data.resolution?.trim()||!isDate(data.cleared_date)))throw new Error('Clearing a hold needs a resolution and clearance date.');
 const isCertificate=previous.kind==='check'&&['Certificate application','Certificate issuance'].includes(data.check_type);
 if(isCertificate&&status==='Passed'){
  const openHold=records.find(r=>r.project_id===project&&r.kind==='hold'&&r.status!=='Cleared');if(openHold)throw new Error(`Clear the open hold: ${openHold.title}.`);
  const outstanding=records.find(r=>r.project_id===project&&r.kind==='check'&&r.id!==previous.id&&!['Certificate application','Certificate issuance'].includes(r.data.check_type)&&!checkSatisfied(r));if(outstanding)throw new Error(`Resolve the outstanding check: ${outstanding.title}.`);
 }
}

const normalizeHeader=(s:string)=>s.trim().toLowerCase().replace(/[\s/()-]+/g,'_').replace(/^_|_$/g,'');
export function parseImport(text:string,kind:Kind):{rows:RecordInput[];errors:string[]}{
 const rows:RecordInput[]=[],errors:string[]=[];
 if(!Object.hasOwn(KIND_CONFIG,kind))return {rows,errors:['Choose a supported record type.']};
 if(text.length>5_000_000)return {rows,errors:['CSV must be smaller than 5 MB.']};
 const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy',delimiter:','});
 errors.push(...parsed.errors.map(e=>`CSV${e.row!=null?` row ${e.row+1}`:''}: ${e.message}`));
 if(!parsed.data.length)return {rows,errors:['CSV is empty.']};
 const config=KIND_CONFIG[kind];const aliases=new Map<string,string>([['title','title'],['name','title'],['task','title'],['status','status'],['due_date','due_date'],['due','due_date']]);
 for(const f of config.fields){aliases.set(normalizeHeader(f.key),f.key);aliases.set(normalizeHeader(f.label),f.key);}
 const headers=parsed.data[0].map(h=>aliases.get(normalizeHeader(h))??'');
 if(!headers.includes('title'))errors.push('CSV needs a Title column.');
 headers.forEach((h,i)=>{if(!h)errors.push(`Unknown column: ${parsed.data[0][i]}. Use the sample CSV column names.`);else if(headers.indexOf(h)!==i)errors.push(`Duplicate column: ${parsed.data[0][i]}.`);});
 if(parsed.data.length>501)errors.push('Import at most 500 rows at a time.');
 if(errors.length)return {rows,errors};
 const seen=new Set<string>();
 parsed.data.slice(1).forEach((values,index)=>{
  const rowNum=index+2;if(values.length!==headers.length){errors.push(`Row ${rowNum}: expected ${headers.length} columns, found ${values.length}.`);return;}
  const input:RecordInput={kind,title:'',data:{}};
  try {values.forEach((raw,i)=>{const value=raw.trim(),key=headers[i];if(!value)return;if(key==='title'){input.title=value;return;}if(key==='status'){input.status=config.statuses.find(s=>s.toLowerCase()===value.toLowerCase())??value;return;}if(key==='due_date'){input.due_date=value;return;}const f=config.fields.find(f=>f.key===key)!;
    if(f.type==='number'){if(!/^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value))throw new Error(`${f.label} must be a number.`);const normalized=value.replace('$', '').replace(/,/g,'');if(!/^-?\d+(\.\d+)?$/.test(normalized))throw new Error(`${f.label} must be a number.`);input.data![key]=Number(normalized);}else if(f.type==='checkbox'){if(!/^(true|false|yes|no|1|0)$/i.test(value))throw new Error(`${f.label} must be yes or no.`);input.data![key]=/^(true|yes|1)$/i.test(value);}else if(f.type==='select')input.data![key]=f.options?.find(x=>x.toLowerCase()===value.toLowerCase())??value;else input.data![key]=value;
  });const validated=validateRecord(input);const duplicate=validated.title.toLowerCase().replace(/\s+/g,' ');if(seen.has(duplicate))throw new Error('Duplicate title in this import. Combine or rename the duplicate.');seen.add(duplicate);rows.push(validated);
  }catch(error){errors.push(`Row ${rowNum}: ${(error as Error).message}`);}
 });
 if(!rows.length&&!errors.length)errors.push('CSV has headers but no data rows.');
 return {rows,errors};
}
export function exportRecordsCsv(records:RecordRow[]):string {const data=records.map(r=>({title:r.title,status:r.status,due_date:r.due_date??'',...r.data}));return Papa.unparse(data,{escapeFormulae:true});}
export { createProjectRecords } from './template';
