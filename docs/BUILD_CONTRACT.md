# Shared implementation contract
Next.js 16 App Router + React 19 + TypeScript. Supabase Auth, Postgres RLS, private Storage. Real API persistence only; no pretend local persistence. Palette ivory #F1EEE7, burgundy #7A464E, ink #342E2B. Supplied logo unchanged. Full mobile/desktop interface.

## Types (lib/domain.ts, owned by data agent)
Kind = task | contact | bid | material | check | document | decision | contract | payment | hold | review.
Project: {id:string,workspace_id:string,name:string,address:string,project_type:string,status:string,start_date:string|null,target_date:string|null,lead:string,description:string,locations:string[],is_demo:boolean,version:number,created_at:string}.
RecordRow: {id:string,workspace_id:string,project_id:string|null,kind:Kind,title:string,status:string,owner_id:string|null,due_date:string|null,data:Record<string,any>,version:number,created_at:string,updated_at:string}.
Activity: {id:string,workspace_id:string,project_id:string|null,record_id:string|null,action:string,summary:string,actor_id:string,created_at:string}.
Bootstrap: {workspace:{id:string,name:string,role:string},projects:Project[],records:RecordRow[],events:Activity[]}.
RecordInput: {kind:Kind,project_id?:string|null,title:string,status?:string,owner_id?:string|null,due_date?:string|null,data?:Record<string,any>}.
FieldDef: {key:string,label:string,type:'text'|'textarea'|'number'|'date'|'select'|'checkbox'|'email'|'tel',options?:string[],required?:boolean,help?:string}.
KIND_CONFIG: Record<Kind,{label:string,singular:string,statuses:string[],fields:FieldDef[]}>. Labels: Work, Contacts, Bids & prices, Materials, Checks, Files, Decisions, Contracts, Payments, Holds, Reviews.
Functions data agent exposes: createProjectRecords(projectId:string, options:{selectedPhases?:number[],isDemo?:boolean,startDate?:string}): RecordInput[]; parseImport(text:string,kind:Kind): {rows:RecordInput[],errors:string[]}; scheduleWarnings(record:RecordRow, records:RecordRow[]):string[]; validateRecord(input:unknown): RecordInput (throw Error); validateTransition(previous:RecordRow,next:RecordInput,records:RecordRow[]):void (throw Error). Date controls use YYYY-MM-DD.
Template metadata preserves all customer source IDs, due_timing, notes, source_owner, phase, trade, priority, reminder_mode, inspection_required, inspection_type, applicability. data.prerequisite_ids contains record IDs. data.check_ids links source inspection task wrappers to actual check record (one authoritative check result). Unknown applicability requires confirmation. Unknown source durations/dates remain null. All source Waiting means template default, not real progress.

## API (owned by backend agent)
Bearer Supabase JWT on all /api calls; response errors JSON {error:string}, appropriate status. Server validates auth through getUser and uses caller's JWT client/RLS (never server service role runtime).
GET /api/bootstrap -> Bootstrap.
POST /api/projects accepts name,address,project_type,status,start_date,target_date,lead,description,locations,is_demo,template:boolean,selected_phases?:number[]. Creates project and template records atomically; -> {project:Project}.
PATCH /api/projects/[id] accepts fields + version; -> {project}.
POST /api/records accepts RecordInput; -> {record:RecordRow}.
PATCH /api/records/[id] accepts RecordInput fields + version; validates transition and optimistic concurrency; -> {record}.
POST /api/import {kind,project_id,rows:RecordInput[]} -> {count:number}. Revalidate server-side, atomic, max500, no duplicate imports by kind/title/project.
POST /api/files multipart {file,project_id,category,title,record_id?} -> {record}; max20MB, private storage, allow PDFs/images/Office/CSV/text; no arbitrary HTML/executables.
GET /api/files/[id] -> {url:string} short-lived signed download URL after workspace access check.
Mutations append audit events, ideally SQL trigger. Reader can only read; admin/manager can write. App has no public signup; initial workspace/member provisioned separately by root.

## UI (owned by frontend agent)
components/App.tsx and app/globals.css; root will own app/layout.tsx and app/page.tsx. Use lib/domain.ts above; own client fetch/auth helpers under components or lib/client.ts. Supabase createClient with NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY, signInWithPassword. No login password hardcoded. Show clear configured errors, loading/empty/save/conflict states. App logo at /brand/rockwood-logo.png. Sidebar Overview, Today, Project plan, Bids & prices, Contacts, Materials, Checks, Files, Closeout, Activity, Settings. Responsive mobile nav. Project selector incl All projects; labeled demo project separate from real. New project wizard creates template from all15 phases or selected, optional empty/past-job. Project edit. CRUD via modal/drawer with KIND_CONFIG dynamic fields and base title/status/owner/date. Work plan list/board/Gantt, source notes/timing, dependencies, priority, reminder modes. Bid comparison totals labor+material, tax etc using data keys from configs. Contacts/history can be workspace-wide. CSV import preview errors and save; export CSV. Files upload and signed download with category and project associations. Closeout switch contracts/payments/holds/reviews/decisions/files. Task/check links and gate warnings. No pretend agent sending; Settings explains automations not active yet. User can create labeled demo using New project. No server seed of fake data into real projects.
