-- Rockwood Projects is isolated from existing applications by the pm_ prefix.
create table if not exists public.pm_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);
create table if not exists public.pm_members (
  workspace_id uuid not null references public.pm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','manager','reader')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create table if not exists public.pm_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.pm_workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 200),
  address text not null default '', project_type text not null default 'Residential',
  status text not null default 'Planning', start_date date, target_date date,
  lead text not null default '', description text not null default '',
  locations jsonb not null default '[]' check (jsonb_typeof(locations)='array'),
  is_demo boolean not null default false, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (start_date is null or target_date is null or target_date >= start_date)
);
create table if not exists public.pm_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.pm_workspaces(id),
  project_id uuid,
  kind text not null check (kind in ('task','contact','bid','material','check','document','decision','contract','payment','hold','review')),
  title text not null check (length(btrim(title)) between 1 and 300),
  status text not null default 'Waiting', owner_id uuid, due_date date,
  data jsonb not null default '{}' check (jsonb_typeof(data)='object' and octet_length(data::text) <= 200000),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.pm_projects(id,workspace_id),
  unique (id, workspace_id)
);
create index if not exists pm_records_workspace_project on public.pm_records(workspace_id,project_id,kind);
create index if not exists pm_records_due on public.pm_records(workspace_id,due_date) where due_date is not null;
create unique index if not exists pm_document_object_unique on public.pm_records(workspace_id,(data->>'storage_path')) where kind='document' and data ? 'storage_path';
create table if not exists public.pm_audit (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.pm_workspaces(id),
  project_id uuid, record_id uuid, action text not null, summary text not null,
  actor_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index if not exists pm_audit_workspace_time on public.pm_audit(workspace_id,created_at desc);

create or replace function public.pm_has_access(p_workspace_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public,pg_temp as $$
  select exists(select 1 from public.pm_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid()
    and (not p_write or m.role in ('admin','manager')));
$$;
revoke all on function public.pm_has_access(uuid,boolean) from public;
grant execute on function public.pm_has_access(uuid,boolean) to authenticated;

alter table public.pm_workspaces enable row level security;
alter table public.pm_members enable row level security;
alter table public.pm_projects enable row level security;
alter table public.pm_records enable row level security;
alter table public.pm_audit enable row level security;
drop policy if exists pm_workspace_read on public.pm_workspaces;
create policy pm_workspace_read on public.pm_workspaces for select to authenticated using (public.pm_has_access(id));
drop policy if exists pm_member_read on public.pm_members;
create policy pm_member_read on public.pm_members for select to authenticated using (user_id=auth.uid());
drop policy if exists pm_project_read on public.pm_projects;
create policy pm_project_read on public.pm_projects for select to authenticated using (public.pm_has_access(workspace_id));
drop policy if exists pm_record_read on public.pm_records;
create policy pm_record_read on public.pm_records for select to authenticated using (public.pm_has_access(workspace_id));
drop policy if exists pm_audit_read on public.pm_audit;
create policy pm_audit_read on public.pm_audit for select to authenticated using (public.pm_has_access(workspace_id));
-- Writes are only available through the bounded RPCs below, never arbitrary table mutations.
revoke all on public.pm_workspaces,public.pm_members,public.pm_projects,public.pm_records,public.pm_audit from anon,authenticated;
grant usage on schema public to authenticated,service_role;
grant select on public.pm_workspaces,public.pm_members,public.pm_projects,public.pm_records,public.pm_audit to authenticated;
grant all on public.pm_workspaces,public.pm_members,public.pm_projects,public.pm_records,public.pm_audit to service_role;

create or replace function public.pm_audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.workspace_id<>old.workspace_id then raise exception 'Identity cannot change' using errcode='23514'; end if;
    new.version:=old.version+1;
    new.updated_at:=now();
  end if;
  insert into public.pm_audit(workspace_id,project_id,record_id,action,summary,actor_id,before_data,after_data)
  values(new.workspace_id,case when tg_table_name='pm_projects' then new.id else (to_jsonb(new)->>'project_id')::uuid end,
    case when tg_table_name='pm_records' then new.id else null end,
    lower(tg_op),case when tg_op='INSERT' then 'Created ' else 'Updated ' end || coalesce(to_jsonb(new)->>'title',to_jsonb(new)->>'name'),auth.uid(),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
revoke all on function public.pm_audit_change() from public;
drop trigger if exists pm_project_audit on public.pm_projects;
create trigger pm_project_audit before insert or update on public.pm_projects for each row execute function public.pm_audit_change();
drop trigger if exists pm_record_audit on public.pm_records;
create trigger pm_record_audit before insert or update on public.pm_records for each row execute function public.pm_audit_change();

create or replace function public.pm_dependency_satisfied(p_id uuid) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.pm_records; c public.pm_records; v text;
begin
  select * into r from public.pm_records where id=p_id;
  if r.id is null then return false; end if;
  if (r.status='Not applicable' or r.data->>'applicability'='Not applicable') and coalesce(btrim(r.data->>'applicability_reason'),'')<>'' then return true; end if;
  if r.kind='check' then return r.status='Passed' and r.data->>'applicability'='Required' and coalesce(r.data->>'result_date','')<>'' and coalesce(btrim(r.data->>'inspector'),'')<>'' and (coalesce(btrim(r.data->>'evidence'),'')<>'' or jsonb_array_length(coalesce(r.data->'document_ids','[]'))>0); end if;
  if r.kind='material' then return r.status='Delivered'; end if;
  if r.kind='hold' then return r.status='Cleared'; end if;
  if r.kind='decision' then return r.status in ('Approved','Implemented'); end if;
  if r.status<>'Done' then return false; end if;
  for v in select jsonb_array_elements_text(coalesce(r.data->'check_ids','[]')) loop
    select * into c from public.pm_records where id=v::uuid;
    if c.kind<>'check' or not public.pm_dependency_satisfied(c.id) then return false; end if;
  end loop;
  return true;
end; $$;
revoke all on function public.pm_dependency_satisfied(uuid) from public;

-- Deferred checks also validate the links created in a single project-template transaction.
create or replace function public.pm_validate_links() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v text; k text; related public.pm_records; reached boolean; old_state text; allowed text[];
begin
  allowed:=case new.kind
    when 'task' then array['Waiting','Ready','Working','Blocked','Ready to check','Done','Not applicable']
    when 'contact' then array['Active','Considering','Inactive']
    when 'bid' then array['Need someone','Requested','Received','Comparing','Selected','Declined']
    when 'material' then array['Need to select','Need to order','Ordered','Confirmed','In transit','Delivered','Delayed','Cancelled']
    when 'check' then array['Needs confirming','Waiting','Scheduled','Passed','Failed','Not applicable']
    when 'document' then array['Needed','Draft','Current','Superseded','Accepted']
    when 'decision' then array['Needed','Proposed','Approved','Rejected','Implemented']
    when 'contract' then array['Needed','Draft','Sent','Signed','Complete','Cancelled']
    when 'payment' then array['Expected','Invoiced','Under review','Approved','Paid','Disputed']
    when 'hold' then array['Open','Working','Cleared']
    when 'review' then array['Draft','In review','Complete'] end;
  if not new.status=any(allowed) then raise exception 'Invalid record status' using errcode='23514'; end if;
  if new.kind in ('task','check') and new.data ? 'applicability' and coalesce(new.data->>'applicability','') not in ('','Needs confirming','Required','Not applicable') then raise exception 'Choose a valid applicability' using errcode='23514'; end if;
  if new.data ? 'reminder_mode' and coalesce(new.data->>'reminder_mode','') not in ('','Due + overdue','Overdue only','Off') then raise exception 'Choose a valid reminder preference' using errcode='23514'; end if;
  if new.data ? 'priority' and coalesce(new.data->>'priority','') not in ('','High','Medium','Low') then raise exception 'Choose a valid priority' using errcode='23514'; end if;
  if new.data ? 'phase' and new.data->'phase'<>'null'::jsonb then
    if jsonb_typeof(new.data->'phase')<>'number' or (new.data->>'phase')::numeric<>trunc((new.data->>'phase')::numeric) or (new.data->>'phase')::numeric not between 1 and 15 then raise exception 'Phase must be a whole number from 1 to 15' using errcode='23514'; end if;
  end if;
  foreach k in array array['inspection_required','long_lead','permit_closed'] loop
    if new.data ? k and new.data->k<>'null'::jsonb and jsonb_typeof(new.data->k)<>'boolean' then raise exception '% must be yes or no',k using errcode='23514'; end if;
  end loop;
  foreach k in array array['labor_cost','material_cost','equipment_cost','tax_amount','other_cost','unit_cost','total_cost','amount','retainage','paid_amount','original_budget','final_cost','budget','quantity','duration_days','retainage_percent','cost_impact','days_impact','change_order_amount'] loop
    if new.data ? k and new.data->k<>'null'::jsonb then
      if jsonb_typeof(new.data->k)<>'number' then raise exception '% must be numeric',k using errcode='23514'; end if;
      if k not in ('cost_impact','days_impact','change_order_amount') and (new.data->>k)::numeric<0 then raise exception '% cannot be negative',k using errcode='23514'; end if;
      if abs((new.data->>k)::numeric)>1000000000000 then raise exception '% is too large',k using errcode='23514'; end if;
    end if;
  end loop;
  if new.data ? 'retainage_percent' and (new.data->>'retainage_percent')::numeric>100 then raise exception 'Retainage cannot exceed 100 percent' using errcode='23514'; end if;
  foreach k in array array['start_date','finish_date','baseline_start','baseline_finish','actual_start','actual_finish','result_date','scheduled_date','reinspection_date','cleared_date','insurance_expiry','valid_until','received_date','ordered_date','expected_date','document_date','expiry_date','decision_date','signed_date','invoice_date','paid_date','completed_date','planned_finish'] loop
    v:=nullif(new.data->>k,'');
    if v is not null then
      if v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD dates' using errcode='23514'; end if;
      perform v::date;
    end if;
  end loop;
  if new.data->>'start_date' is not null and new.due_date is not null and (new.data->>'start_date')::date>new.due_date then raise exception 'Finish cannot be before start' using errcode='23514'; end if;
  if new.data->>'start_date'>new.data->>'finish_date' or new.data->>'baseline_start'>new.data->>'baseline_finish' or new.data->>'actual_start'>new.data->>'actual_finish' then raise exception 'Finish cannot be before start' using errcode='23514'; end if;
  if new.owner_id is not null and not exists(select 1 from public.pm_records r where r.id=new.owner_id and r.workspace_id=new.workspace_id and r.kind='contact') then
    raise exception 'Owner must be a contact in this workspace' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.data ? 'source_id' then
    if new.data->'source_id' is distinct from old.data->'source_id' or new.data->'source_row' is distinct from old.data->'source_row' then raise exception 'Customer source references must be preserved' using errcode='23514'; end if;
    foreach k in array array['check_ids','prerequisite_ids'] loop
      if not coalesce(new.data->k,'[]') @> coalesce(old.data->k,'[]') then raise exception 'Keep the original customer workflow links; mark an inapplicable prerequisite with its reason instead' using errcode='23514'; end if;
    end loop;
  end if;
  foreach k in array array['prerequisite_ids','check_ids','corrective_action_ids','document_ids','linked_task_ids','related_record_ids'] loop
    if new.data ? k and jsonb_typeof(new.data->k)<>'array' then raise exception '% must be an array',k using errcode='23514'; end if;
    for v in select jsonb_array_elements_text(coalesce(new.data->k,'[]')) loop
      if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid related record identifier' using errcode='23514'; end if;
      select * into related from public.pm_records r where r.id=v::uuid;
      if related.id is null or related.workspace_id<>new.workspace_id or (related.project_id is distinct from new.project_id and not(k in ('document_ids','related_record_ids') and related.project_id is null)) or related.id=new.id then
        raise exception 'Related work must belong to the same project' using errcode='23514';
      end if;
      if k='check_ids' and related.kind<>'check' then raise exception 'Check links must reference checks' using errcode='23514'; end if;
      if k='document_ids' and related.kind<>'document' then raise exception 'Document links must reference documents' using errcode='23514'; end if;
    end loop;
  end loop;
  foreach k in array array['related_record_id','linked_record_id','contact_id','contractor_id','supplier_id','bid_id','contract_id','task_id','material_id'] loop
    v:=nullif(new.data->>k,'');
    if v is not null then
      if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid related record identifier' using errcode='23514'; end if;
      select * into related from public.pm_records r where r.id=v::uuid;
      if related.id is null or related.workspace_id<>new.workspace_id or (k not in ('contact_id','contractor_id','supplier_id') and related.project_id is distinct from new.project_id) then
        raise exception 'Related record belongs to a different project' using errcode='23514';
      end if;
      if k in ('contact_id','contractor_id','supplier_id') and related.kind<>'contact' then raise exception 'Choose a contact for the assigned company' using errcode='23514'; end if;
      if k='contract_id' and related.kind<>'contract' then raise exception 'Choose a contract' using errcode='23514'; end if;
    end if;
  end loop;
  if new.data ? 'storage_path' and split_part(new.data->>'storage_path','/',1)<>new.workspace_id::text then
    raise exception 'Invalid document workspace' using errcode='23514';
  end if;
  with recursive chain(id) as (
    select value::uuid from jsonb_array_elements_text(coalesce(new.data->'prerequisite_ids','[]'))
    union select link.value::uuid from chain c join public.pm_records r on r.id=c.id
      cross join lateral jsonb_array_elements_text(coalesce(r.data->'prerequisite_ids','[]')) link(value)
  ) select exists(select 1 from chain where id=new.id) into reached;
  if reached then raise exception 'Dependencies cannot form a cycle' using errcode='23514'; end if;
  if new.kind='check' and new.status='Passed' then
    if new.data->>'applicability' is distinct from 'Required' or coalesce(btrim(new.data->>'result_date'),'')='' or coalesce(btrim(new.data->>'inspector'),'')='' or (coalesce(btrim(new.data->>'evidence'),'')='' and jsonb_array_length(coalesce(new.data->'document_ids','[]'))=0) then
      raise exception 'A passed check needs its result date, inspector and evidence' using errcode='23514';
    end if;
    perform (new.data->>'result_date')::date;
    for v in select jsonb_array_elements_text(coalesce(new.data->'corrective_action_ids','[]')) loop
      if not exists(select 1 from public.pm_records where id=v::uuid and status='Done') then raise exception 'Complete linked corrections before passing the check' using errcode='23514'; end if;
    end loop;
    for v in select jsonb_array_elements_text(coalesce(new.data->'prerequisite_ids','[]')) loop
      if not public.pm_dependency_satisfied(v::uuid) then raise exception 'Resolve prerequisite checks first' using errcode='23514'; end if;
    end loop;
    if new.data->>'check_type' in ('Certificate application','Certificate issuance') then
      if exists(select 1 from public.pm_records r where r.project_id=new.project_id and r.kind='hold' and r.status<>'Cleared') then raise exception 'Clear project holds before certificate application or issuance' using errcode='23514'; end if;
      if exists(select 1 from public.pm_records r where r.project_id=new.project_id and r.kind='check' and r.id<>new.id and coalesce(r.data->>'check_type','') not in ('Certificate application','Certificate issuance') and not public.pm_dependency_satisfied(r.id)) then raise exception 'Resolve outstanding checks before certificate application or issuance' using errcode='23514'; end if;
    end if;
  end if;
  if (new.status='Not applicable' or new.data->>'applicability'='Not applicable') and coalesce(btrim(new.data->>'applicability_reason'),'')='' then
    raise exception 'Explain why this check is not applicable' using errcode='23514';
  end if;
  if new.kind='hold' and new.status='Cleared' and (coalesce(btrim(new.data->>'resolution'),'')='' or coalesce(new.data->>'cleared_date','')='') then raise exception 'Clearing a hold needs a resolution and clearance date' using errcode='23514'; end if;
  -- Revisions to plans stay possible; gates apply whenever entering an active/completed state.
  old_state:=case when tg_op='UPDATE' then old.status else '' end;
  if new.kind='task' and new.status in ('Ready','Working','Ready to check','Done') and (new.status<>old_state or new.data is distinct from old.data) then
    if new.data->>'applicability'='Needs confirming' then raise exception 'Confirm whether this work applies first' using errcode='23514'; end if;
    if jsonb_array_length(coalesce(new.data->'unresolved_prerequisite_source_ids','[]'))>0 and coalesce(btrim(new.data->>'prerequisite_resolution'),'')='' then raise exception 'Resolve prerequisites from excluded phases before releasing this work' using errcode='23514'; end if;
    for v in select jsonb_array_elements_text(coalesce(new.data->'prerequisite_ids','[]')) loop
      if not public.pm_dependency_satisfied(v::uuid) then raise exception 'Complete prerequisites before releasing this work' using errcode='23514'; end if;
    end loop;
    if new.status='Done' then
      for v in select jsonb_array_elements_text(coalesce(new.data->'check_ids','[]')) loop
        if not public.pm_dependency_satisfied(v::uuid) then raise exception 'Required checks are not approved' using errcode='23514'; end if;
      end loop;
    end if;
  end if;
  return null;
end; $$;
revoke all on function public.pm_validate_links() from public;
drop trigger if exists pm_record_links on public.pm_records;
create constraint trigger pm_record_links after insert or update on public.pm_records deferrable initially deferred for each row execute function public.pm_validate_links();

create or replace function public.pm_create_project(p_workspace_id uuid,p_project jsonb,p_records jsonb default '[]')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.pm_projects; item jsonb;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>500 then raise exception 'Invalid template records' using errcode='23514'; end if;
  insert into public.pm_projects(id,workspace_id,name,address,project_type,status,start_date,target_date,lead,description,locations,is_demo)
  values(coalesce(nullif(p_project->>'id','')::uuid,gen_random_uuid()),p_workspace_id,btrim(p_project->>'name'),coalesce(p_project->>'address',''),coalesce(p_project->>'project_type','Residential'),
    coalesce(p_project->>'status','Planning'),nullif(p_project->>'start_date','')::date,nullif(p_project->>'target_date','')::date,coalesce(p_project->>'lead',''),coalesce(p_project->>'description',''),coalesce(p_project->'locations','[]'),coalesce((p_project->>'is_demo')::boolean,false)) returning * into result;
  for item in select value from jsonb_array_elements(p_records) loop
    insert into public.pm_records(id,workspace_id,project_id,kind,title,status,owner_id,due_date,data)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),p_workspace_id,result.id,item->>'kind',btrim(item->>'title'),coalesce(item->>'status','Waiting'),nullif(item->>'owner_id','')::uuid,nullif(item->>'due_date','')::date,coalesce(item->'data','{}'));
  end loop;
  return to_jsonb(result);
end; $$;
create or replace function public.pm_update_project(p_workspace_id uuid,p_id uuid,p_expected_version integer,p_project jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.pm_projects;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  select * into result from public.pm_projects where id=p_id and workspace_id=p_workspace_id for update;
  if result.id is null then raise exception 'Project not found' using errcode='P0002'; end if;
  if p_expected_version is null or result.version<>p_expected_version then raise exception 'This project changed. Refresh before saving.' using errcode='PT409'; end if;
  update public.pm_projects set name=p_project->>'name',address=p_project->>'address',project_type=p_project->>'project_type',status=p_project->>'status',start_date=nullif(p_project->>'start_date','')::date,
    target_date=nullif(p_project->>'target_date','')::date,lead=p_project->>'lead',description=p_project->>'description',locations=p_project->'locations',is_demo=(p_project->>'is_demo')::boolean where id=p_id returning * into result;
  return to_jsonb(result);
end; $$;
create or replace function public.pm_save_record(p_workspace_id uuid,p_record jsonb,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.pm_records; wanted uuid:=nullif(p_record->>'id','')::uuid;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  -- Serialize related updates in one workspace to avoid racing prerequisite checks.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  if p_expected_version is null then
    insert into public.pm_records(id,workspace_id,project_id,kind,title,status,owner_id,due_date,data)
    values(coalesce(wanted,gen_random_uuid()),p_workspace_id,nullif(p_record->>'project_id','')::uuid,p_record->>'kind',btrim(p_record->>'title'),p_record->>'status',nullif(p_record->>'owner_id','')::uuid,nullif(p_record->>'due_date','')::date,coalesce(p_record->'data','{}')) returning * into result;
  else
    select * into result from public.pm_records where id=wanted and workspace_id=p_workspace_id for update;
    if result.id is null then raise exception 'Record not found' using errcode='P0002'; end if;
    if result.version<>p_expected_version then raise exception 'This item changed. Refresh before saving.' using errcode='PT409'; end if;
    if result.kind<>p_record->>'kind' or result.project_id is distinct from nullif(p_record->>'project_id','')::uuid then raise exception 'Record kind and project cannot change' using errcode='23514'; end if;
    update public.pm_records set title=btrim(p_record->>'title'),status=p_record->>'status',owner_id=nullif(p_record->>'owner_id','')::uuid,due_date=nullif(p_record->>'due_date','')::date,data=coalesce(p_record->'data','{}') where id=wanted returning * into result;
  end if;
  return to_jsonb(result);
end; $$;
create or replace function public.pm_import_records(p_workspace_id uuid,p_project_id uuid,p_kind text,p_records jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; inserted integer:=0;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 500 then raise exception 'Import 1 to 500 rows at a time' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  for item in select value from jsonb_array_elements(p_records) loop
    if item->>'kind'<>p_kind then raise exception 'All import rows must have the selected type' using errcode='23514'; end if;
    if exists(select 1 from public.pm_records r where r.workspace_id=p_workspace_id and r.project_id is not distinct from p_project_id and r.kind=p_kind and lower(btrim(r.title))=lower(btrim(item->>'title'))) then
      raise exception 'An item with this title already exists: %',item->>'title' using errcode='23505';
    end if;
    insert into public.pm_records(id,workspace_id,project_id,kind,title,status,owner_id,due_date,data)
    values(gen_random_uuid(),p_workspace_id,p_project_id,p_kind,btrim(item->>'title'),item->>'status',nullif(item->>'owner_id','')::uuid,nullif(item->>'due_date','')::date,coalesce(item->'data','{}'));
    inserted:=inserted+1;
  end loop;
  return inserted;
end; $$;
revoke all on function public.pm_create_project(uuid,jsonb,jsonb),public.pm_update_project(uuid,uuid,integer,jsonb),public.pm_save_record(uuid,jsonb,integer),public.pm_import_records(uuid,uuid,text,jsonb) from public;
grant execute on function public.pm_create_project(uuid,jsonb,jsonb),public.pm_update_project(uuid,uuid,integer,jsonb),public.pm_save_record(uuid,jsonb,integer),public.pm_import_records(uuid,uuid,text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pm-documents','pm-documents',false,20971520,
array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/tiff','text/csv','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/rtf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.pm_storage_access(p_path text,p_write boolean default false) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare folder text:=split_part(p_path,'/',1);
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_path like '%..%' or array_length(string_to_array(p_path,'/'),1)<>3 then return false; end if;
  return public.pm_has_access(folder::uuid,p_write);
end; $$;
revoke all on function public.pm_storage_access(text,boolean) from public;
grant execute on function public.pm_storage_access(text,boolean) to authenticated;
drop policy if exists pm_documents_read on storage.objects;
create policy pm_documents_read on storage.objects for select to authenticated using(bucket_id='pm-documents' and public.pm_storage_access(name));
drop policy if exists pm_documents_insert on storage.objects;
create policy pm_documents_insert on storage.objects for insert to authenticated with check(bucket_id='pm-documents' and public.pm_storage_access(name,true));
drop policy if exists pm_documents_delete on storage.objects;
create policy pm_documents_delete on storage.objects for delete to authenticated using(bucket_id='pm-documents' and public.pm_storage_access(name,true));
