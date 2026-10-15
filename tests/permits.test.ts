import {describe,expect,it,vi} from 'vitest';
import {eligibleProject,monitorState,permitQueue,permitSatisfied} from '../lib/permits';
import {payloadHash,completePermitCheck} from '../lib/permit-server';
import {validateRecord,validateTransition} from '../lib/domain';
import type {Project,RecordRow} from '../lib/domain';
const pid='66666666-6666-4666-8666-666666666666',wid='44444444-4444-4444-8444-444444444444',rid='11111111-1111-4111-8111-111111111111';
const project={id:pid,status:'Active',is_demo:false} as Project;
const permit={id:rid,project_id:pid,workspace_id:wid,kind:'permit',title:'Building',status:'Issued',version:2,owner_id:null,due_date:null,data:{permit_number:'BLD-123',jurisdiction:'Example City',permit_type:'Master',source_url:'https://example.gov/permit/1',evidence:'Official result',notes:'Preserve my note'},created_at:'2026-01-01',updated_at:'2026-01-01'} as RecordRow;
vi.mock('../lib/server',async importOriginal=>({...await importOriginal<typeof import('../lib/server')>(),allRows:async()=>[permit]}));
describe('permit queue and application validation',()=>{
 it('discovers new real properties without requiring a pre-created monitor',()=>{
  expect(permitQueue([project],[],[],[],Date.now())).toMatchObject([{project:{id:pid},needs_source:true,due:true}]);
  for(const status of ['Complete','Completed','Past job','Archived','Cancelled'])expect(eligibleProject({...project,status})).toBe(false);
  expect(eligibleProject({...project,is_demo:true})).toBe(false);
 });
 it('excludes paused, future and currently leased work but reclaims expired work',()=>{
  const now=Date.now(),monitor={project_id:pid,enabled:true,next_check_at:new Date(now-1).toISOString()} as any;
  expect(permitQueue([project],[{...monitor,enabled:false}],[],[],now)).toHaveLength(0);
  expect(permitQueue([project],[{...monitor,next_check_at:new Date(now+1000).toISOString()}],[],[],now)).toHaveLength(0);
  const run={project_id:pid,status:'running',lease_expires_at:new Date(now+1000).toISOString()} as any;
  expect(permitQueue([project],[monitor],[run],[],now)).toHaveLength(0);
  expect(permitQueue([project],[monitor],[{...run,lease_expires_at:new Date(now-1000).toISOString()}],[],now)).toHaveLength(1);
 });
 it('distinguishes freshness, failures and initial unknown state',()=>{
  expect(monitorState(project,undefined,undefined)).toBe('Needs source');
  expect(monitorState(project,{last_success_at:new Date(Date.now()-3*3600000).toISOString(),last_outcome:'success'} as any,undefined)).toBe('Stale');
  expect(monitorState(project,{last_success_at:new Date().toISOString(),last_outcome:'blocked'} as any,undefined)).toBe('Needs attention');
 });
 it('rejects unsupported status, missing evidence, invalid source and subpermit links',()=>{
  for(const data of [{...permit.data,evidence:''},{...permit.data,source_url:'javascript:alert(1)'},{...permit.data,permit_type:'Subpermit'},{...permit.data,issued_date:'2026-11-10',expiry_date:'2026-11-01'}])expect(()=>validateRecord({...permit,data})).toThrow();
  expect(permitSatisfied({...permit,status:'Approved'})).toBe(false);expect(permitSatisfied(permit)).toBe(true);
  expect(()=>validateTransition(permit,{...permit,data:{...permit.data,permit_type:'Subpermit',parent_permit_id:rid}},[permit])).toThrow(/same property/);
 });
 it('merges observed fields without losing human notes and hashes canonical payloads',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'success'},error:null});
  const run={id:crypto.randomUUID(),project_id:pid,status:'running'} as any;
  await completePermitCheck({workspace:{id:wid},db:{rpc}} as any,run,{outcome:'success',summary:'Source checked',source_url:'https://example.gov',records:[{id:rid,kind:'permit',version:2,data:{evidence:'New observation',source_observed_at:new Date().toISOString()}}]});
  expect(rpc.mock.calls[0][1].p_updates[0].data).toMatchObject({notes:'Preserve my note',evidence:'New observation'});
  expect(payloadHash({b:2,a:1})).toBe(payloadHash({a:1,b:2}));
 });
 it('stops stale edits and reconciles exact completed payloads without resaving',async()=>{
  const rpc=vi.fn(),ctx={workspace:{id:wid},userId:rid,db:{rpc}} as any,run={id:crypto.randomUUID(),project_id:pid,status:'running'} as any;
  await expect(completePermitCheck(ctx,run,{outcome:'success',summary:'Source checked',source_url:'https://example.gov',records:[{id:rid,kind:'permit',version:1,data:{}}]})).rejects.toMatchObject({status:409});expect(rpc).not.toHaveBeenCalled();
  const input={outcome:'blocked',summary:'CAPTCHA',source_url:'',records:[]};const completed={...run,status:'blocked',actor_id:rid,payload_hash:payloadHash(input)};
  expect(await completePermitCheck(ctx,completed,input)).toBe(completed);expect(rpc).not.toHaveBeenCalled();
 });
});
