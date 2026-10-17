import requirements from '../data/customer-requirements.json';
import type { RecordInput } from './domain';

type SourceTask=typeof requirements.master_tasks[number];
const phaseOf=(task:SourceTask)=>parseInt(task.phase,10);
const genericRole=(source:string)=>source.replace(/Chris/g,'Project lead').replace(/\bRVS\b/g,'Supplier coordinator').replace(/\bPM\b/g,'Project manager').replace(/\bVA\b/g,'Assistant');
const conditional=(text:string)=>/if applicable|if required|as applicable|when applicable|scope dependent|optional|if separate permit|if not already closed|if home has/i.test(text);
const inspectionWrappers=new Set(['P2-26','P2-30','P2-32','P3-02','P3-03','P3-06','P3-07','P3-09','P3-10','P3-13','P3-15','P3-17','P3-19','P3-21','P3-23','P3-25','P3-28','P3-30','P4-12','P4-13','P4-14','P4-15','P4-16','P4-17','P4-18','P4-19','P4-20','P4-21','P4-22','P4-23','P4-24','P4-37','P5-01']);
// Only unambiguous handoffs from the source are encoded. Broad phrases such as
// "late-stage" and "after heavy work" remain text for the project lead to resolve.
const taskDependencies:Record<string,string[]>={
 'P2-06':['P2-01','P2-04'],'P2-07':['P2-06'],'P2-22':['P2-21'],'P2-23':['P2-21','P2-22'],'P2-24':['P2-23'],
 'P2-31':['P2-26','P2-30'],'P3-02':['P3-01'],'P3-04':['P2-33','P3-02','P3-03'],'P3-05':['P3-04'],
 'P3-09':['P3-08'],'P3-12':['P3-11'],'P3-13':['P3-12'],'P3-14':['P3-09'],'P3-15':['P3-14'],'P3-16':['P3-15'],'P3-17':['P3-16'],
 'P3-21':['P3-20'],'P3-23':['P3-22'],'P3-25':['P3-24'],
 'P3-27':['P3-21','P3-23','P3-25'],'P3-28':['P3-27'],
 'P3-29':['P3-21','P3-23','P3-25','P3-28','P3-26'],'P3-30':['P3-29'],'P3-31':['P3-29','P3-30'],
 'P3-32':['P3-31'],'P3-33':['P3-31'],'P3-34':['P3-33'],'P4-07':['P3-33'],
 'P4-14':['P4-04'],'P4-15':['P4-05'],'P4-16':['P4-06'],'P4-19':['P4-10'],
 'P4-26':['P4-25'],'P4-27':['P4-26'],'P4-28':['P4-27'],'P4-29':['P4-28'],
 'P4-37':['P4-34','P4-36'],'P5-01':['P4-37'],'P5-02':['P5-01'],'P5-03':['P4-29','P5-01']
};
// Check IDs are source catalogue keys, mapped to each project's generated UUIDs.
const checkGates:Record<string,string[]>={
 'P3-04':['P6-04','P6-05','P6-06','P6-07','P6-08'],
 'P3-14':['P6-12'],'P3-16':['P6-13'],
 'P3-27':['P6-11','P6-18','P6-19','P6-20','P6-21'],
 'P3-29':['P6-11','P6-18','P6-19','P6-20','P6-21','P6-22'],
 'P3-31':['P6-24'],'P3-35':['P6-16-waterproofing'],
 'P4-34':['P6-14','P6-15-final','P6-23','P6-25-final','P6-26','P6-27','P6-28','P6-29','P6-30','P6-31','P6-32','P6-33','P6-34']
};
const categoryPhase:Record<string,number>={'Site / Preconstruction':3,'Survey / Layout':3,Underground:4,Foundation:4,Structure:5,Roof:6,Envelope:6,Stucco:6,'MEP Rough':7,Energy:8,Drywall:8,Pool:12,'Site Final':11,Final:12,CO:15};
export function createProjectRecords(projectId:string,options:{selectedPhases?:number[];isDemo?:boolean;startDate?:string}={}):RecordInput[]{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId))throw new Error('A valid project ID is required.');
 const selected=new Set(options.selectedPhases??Array.from({length:15},(_,i)=>i+1));
 if([...selected].some(p=>!Number.isInteger(p)||p<1||p>15))throw new Error('Select phases 1–15.');
 const allTasks=requirements.master_tasks;const sources=allTasks.filter(t=>selected.has(phaseOf(t)));
 const taskIds=new Map(sources.map(t=>[t.id,crypto.randomUUID()]));
 const checks:RecordInput[]=[];
 const checksByKey=new Map<string,RecordInput>();
 const checksByTask=new Map<string,RecordInput[]>();
 const addCheck=(source:typeof requirements.inspection_list[number],key:string,title:string,related:string[],extra:Record<string,any>={})=>{
  const matching=allTasks.filter(t=>related.includes(t.id));const phase=matching.length?phaseOf(matching[0]):categoryPhase[source.category]??12;
  const row:RecordInput={id:crypto.randomUUID(),kind:'check',project_id:projectId,title,status:'Needs confirming',owner_id:null,due_date:null,data:{source_id:source.id,source_ids:[source.id,...related],template_key:key,source_page:source.page,source_row:source,category:source.category,phase,phase_name:matching[0]?.phase.replace(/^\d+\.\s*/,'')??source.category,inspection_type:source.category,source_owner:matching.map(t=>t.owner).join('; '),suggested_owner:'Project manager / Inspector',source_condition:source.condition||matching.filter(t=>conditional(t.notes+' '+t.task)).map(t=>t.notes).join('; '),applicability:'Needs confirming',applicability_reason:'',check_type:'Official inspection',mapping_note:source.mapping_note,source_notes:source.mapping_note,notes:source.mapping_note,due_timing:matching.map(t=>t.due_timing).filter((v,i,a)=>a.indexOf(v)===i).join('; '),linked_task_ids:related.flatMap(id=>taskIds.has(id)?[taskIds.get(id)!]:[]),reminder_mode:'Off',prerequisite_ids:[],...extra}};
  checks.push(row);checksByKey.set(key,row);for(const id of related)checksByTask.set(id,[...(checksByTask.get(id)??[]),row]);
 };
 for(const source of requirements.inspection_list){
  if(source.id==='P6-09'){addCheck(source,'P6-09-masonry','Masonry wall inspection',['P3-05']);addCheck(source,'P6-09','Tie beam / lintel inspection',['P3-06']);}
  else if(source.id==='P6-15'){addCheck(source,'P6-15','Window / exterior door installation inspection',['P3-13']);addCheck(source,'P6-15-final','Window / door separate-permit final',['P4-18'],{source_condition:'If separate permit'});}
  else if(source.id==='P6-16'){addCheck(source,'P6-16-waterproofing','Waterproofing inspection, if required',['P3-35']);addCheck(source,'P6-16-flashing','Flashing inspection, if required',[],{phase:6});}
  else if(source.id==='P6-25'){for(const stage of ['Steel','Shell','Plumbing','Electrical','Barrier','Final'])addCheck(source,`P6-25-${stage.toLowerCase()}`,`Pool ${stage.toLowerCase()} inspection, if applicable`,stage==='Final'?['P4-22']:[],{phase:stage==='Final'?12:4,source_condition:'If applicable; confirm each stage against the pool permit'});}
  else if(source.id==='P6-35'){addCheck(source,'P6-35-application','CO / CC application submission',['P4-37'],{check_type:'Certificate application'});addCheck(source,'P6-35-issuance','CO / CC certificate issuance',['P5-01'],{check_type:'Certificate issuance'});}
  else addCheck(source,source.id,source.inspection,source.related_master_rows,{...(['P6-01','P6-02'].includes(source.id)?{check_type:'Site readiness'}:{}),...(source.id==='P6-08'?{check_type:'Document review'}:{}),...(source.id==='P6-23'?{check_type:'Test'}:{})});
 }
 // The internal drainage walk and municipal result have different authorities.
 const drainage=checksByKey.get('P6-27')!;drainage.data!.notes+=' The project manager’s own drainage review does not substitute for this result.';
 const poolFinal=checksByKey.get('P6-25-final')!;poolFinal.data!.prerequisite_ids=['steel','shell','plumbing','electrical','barrier'].map(s=>checksByKey.get(`P6-25-${s}`)!.id);
 checksByKey.get('P6-35-issuance')!.data!.prerequisite_ids=[checksByKey.get('P6-35-application')!.id];
 const tasks:RecordInput[]=sources.map(source=>{
  const relevantChecks=checksByTask.get(source.id)??[];
  const priorSources=taskDependencies[source.id]??[];const linkedPrereqs=priorSources.flatMap(id=>taskIds.has(id)?[taskIds.get(id)!]:[]);
  const requiredChecks=(checkGates[source.id]??[]).map(key=>checksByKey.get(key)!).filter(Boolean);
  return {id:taskIds.get(source.id),kind:'task',project_id:projectId,title:source.task,status:'Waiting',owner_id:null,due_date:null,data:{source_id:source.id,source_ids:[source.id],source_page:source.page,source_row:source,source_owner:source.owner,suggested_owner:genericRole(source.owner),phase:phaseOf(source),phase_name:source.phase.replace(/^\d+\.\s*/,''),trade:source.task.includes('bid follow-up')?source.task.replace(' bid follow-up',''):genericRole(source.owner),source_notes:source.notes,notes:source.notes,due_timing:source.due_timing,start_date:null,baseline_start:null,baseline_finish:null,actual_start:null,actual_finish:null,duration_days:null,priority:'Medium',reminder_mode:'Off',inspection_required:relevantChecks.length>0,inspection_type:relevantChecks.map(c=>c.data!.inspection_type).filter((v,i,a)=>a.indexOf(v)===i).join('; '),applicability:conditional(source.task+' '+source.notes)?'Needs confirming':'Required',applicability_reason:'',check_ids:relevantChecks.map(c=>c.id),prerequisite_ids:[...linkedPrereqs,...requiredChecks.map(c=>c.id)],unresolved_prerequisite_source_ids:priorSources.filter(id=>!taskIds.has(id)),is_inspection_wrapper:inspectionWrappers.has(source.id),template_version:requirements.audit_date,is_demo:Boolean(options.isDemo)}};
 });
 // Include checks in selected phases, links from selected work, and transitive check gates.
 const needed=new Set<string>(tasks.flatMap(t=>[...t.data!.check_ids,...t.data!.prerequisite_ids]));
 for(const c of checks)if(selected.has(c.data!.phase))needed.add(c.id!);
 let changed=true;while(changed){changed=false;for(const c of checks)if(needed.has(c.id!))for(const id of c.data!.prerequisite_ids??[])if(!needed.has(id)){needed.add(id);changed=true;}}
 const chosenChecks=checks.filter(c=>needed.has(c.id!));
 const records=[...tasks,...chosenChecks];
 // A demo is deliberately fictional. Real templates never infer durations or dates.
 if(options.isDemo){
  const start=options.startDate&&/^\d{4}-\d{2}-\d{2}$/.test(options.startDate)?options.startDate:'2026-10-13';
  const baseline=new Date(start+'T00:00:00Z');if(isNaN(baseline.getTime())||baseline.toISOString().slice(0,10)!==start)throw new Error('Demo start date is invalid.');
  const day=(offset:number)=>{const d=new Date(baseline);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  const demoDates:Record<string,[number,number]>={'P3-20':[0,2],'P3-21':[3,3],'P3-22':[0,3],'P3-23':[4,4],'P3-24':[0,2],'P3-25':[3,3],'P3-26':[0,3],'P3-27':[5,6],'P3-28':[7,7],'P3-29':[8,10],'P3-30':[11,11],'P3-31':[12,15]};
  for(const task of tasks){const dates=demoDates[task.data!.source_id];if(dates){task.data!.start_date=day(dates[0]);task.due_date=day(dates[1]);task.data!.baseline_start=task.data!.start_date;task.data!.baseline_finish=task.due_date;task.data!.demo_note='Fictional dates for the demonstration. Source timing is preserved separately.';} }
  const plumber=crypto.randomUUID(),supplier=crypto.randomUUID();
  records.push({id:plumber,kind:'contact',project_id:projectId,title:'Sample Plumbing Crew',status:'Active',data:{company:'Fictional example contractor',trade:'Plumbing',role:'Contractor',email:'crew@example.com',past_jobs:'Fictional reference: Maple Avenue kitchen, 2025',notes:'Demo contact. No messages will be sent.',is_demo:true}},{id:supplier,kind:'contact',project_id:projectId,title:'Sample Supply House',status:'Active',data:{company:'Fictional example supplier',trade:'Plumbing',role:'Supplier',email:'supplier@example.com',is_demo:true}},
   {id:crypto.randomUUID(),kind:'bid',project_id:projectId,title:'Kitchen and bathroom plumbing — sample bid',status:'Received',owner_id:plumber,data:{contractor_id:plumber,contractor_name:'Sample Plumbing Crew',trade:'Plumbing',scope:'Fictional rough-in and trim for kitchen and one bathroom.',labor_cost:4200,material_cost:1800,tax_amount:126,other_cost:0,equipment_cost:0,exclusions:'Permit fees and owner-selected fixtures',scope_gaps:'Confirm water heater scope',currency:'USD',is_demo:true}},
   {id:crypto.randomUUID(),kind:'material',project_id:projectId,title:'Kitchen sink — sample order',status:'Delayed',due_date:day(5),data:{supplier_id:supplier,supplier_name:'Sample Supply House',location:'Kitchen',quantity:1,unit:'each',unit_cost:450,total_cost:450,expected_date:day(5),notes:'Fictional example: supplier confirmation pending.',is_demo:true}},
   {id:crypto.randomUUID(),kind:'hold',project_id:projectId,title:'Confirm kitchen sink delivery — example',status:'Open',owner_id:supplier,due_date:day(2),data:{hold_type:'Material',reason:'Sample delivery needs confirmation.',responsible_role:'Project lead',is_demo:true}});
  const rough=tasks.find(t=>t.data!.source_id==='P3-22');if(rough)rough.data!.contractor_id=plumber;
 }
 return records;
}
