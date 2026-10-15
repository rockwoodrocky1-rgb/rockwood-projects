import { context, endpoint, response, jsonBody, databaseError } from '@/lib/server';
import { monitorInput } from '@/lib/permit-server';
export async function PATCH(request: Request) { return endpoint(async()=>{ const ctx=await context(request,true), input=monitorInput.parse(await jsonBody(request)); const {data,error}=await ctx.db.rpc('pm_configure_permit_monitor',{p_workspace_id:ctx.workspace.id,p_project_id:input.project_id,p_expected_version:input.version,p_settings:input.settings}); if(error) databaseError(error); return response({monitor:data}); }); }
