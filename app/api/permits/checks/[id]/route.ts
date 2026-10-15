import { context, endpoint, response, jsonBody, validId } from '@/lib/server';
import { completePermitCheck, permitRun } from '@/lib/permit-server';
type Params = {params:Promise<{id:string}>};
export async function GET(request: Request, {params}:Params) { return endpoint(async()=>{ const ctx=await context(request); return response({run:await permitRun(ctx,validId((await params).id))}); }); }
export async function PATCH(request: Request, {params}:Params) { return endpoint(async()=>{ const ctx=await context(request,true), run=await permitRun(ctx,validId((await params).id)); return response({run:await completePermitCheck(ctx,run,await jsonBody(request))}); }); }
