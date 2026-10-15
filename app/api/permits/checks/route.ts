import { context, endpoint, response, jsonBody, databaseError } from '@/lib/server';
import { claimInput } from '@/lib/permit-server';
export async function POST(request: Request) { return endpoint(async()=>{ const ctx=await context(request,true), input=claimInput.parse(await jsonBody(request)); const {data,error}=await ctx.db.rpc('pm_claim_permit_check',{p_workspace_id:ctx.workspace.id,p_project_id:input.project_id,p_request_key:input.request_key}); if(error) databaseError(error); return response({run:data}); }); }
