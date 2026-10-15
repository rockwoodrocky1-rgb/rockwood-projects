-- Additive permit tracking. Existing projects, records, memberships and Storage remain intact.
begin;
alter table public.pm_records drop constraint pm_records_kind_check;
alter table public.pm_records add constraint pm_records_kind_check check
  (kind in ('task','contact','bid','material','check','document','decision','contract','payment','hold','review','permit'));
create unique index pm_permit_number_unique on public.pm_records
  (workspace_id,project_id,lower(btrim(data->>'jurisdiction')),upper(regexp_replace(data->>'permit_number','\s','','g')))
  where kind='permit';
create unique index pm_inspection_external_unique on public.pm_records
  (workspace_id,project_id,(data->>'external_key')) where kind='check' and coalesce(data->>'external_key','')<>'';

create table public.pm_permit_monitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  enabled boolean not null default true,
  jurisdiction text not null default '' check(length(jurisdiction)<=200),
  source_url text not null default '' check(length(source_url)<=2048 and (source_url='' or source_url ~ '^https://[^/@ ]+([/?#]|$)')),
  version integer not null default 1,
  last_attempt_at timestamptz, last_success_at timestamptz, next_check_at timestamptz,
  last_outcome text, last_summary text not null default '', failure_count integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,project_id),
  foreign key(project_id,workspace_id) references public.pm_projects(id,workspace_id)
);
create table public.pm_permit_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
  actor_id uuid not null, request_key uuid not null,
  status text not null default 'running' check(status in ('running','success','no_permits','partial','blocked','error','interrupted')),
  started_at timestamptz not null default now(), lease_expires_at timestamptz not null default(now()+interval '30 minutes'),
  finished_at timestamptz, summary text not null default '', source_url text not null default '',
  payload_hash text, result jsonb,
  foreign key(project_id,workspace_id) references public.pm_projects(id,workspace_id),
  unique(workspace_id,request_key)
);
create index pm_permit_runs_project_time on public.pm_permit_runs(workspace_id,project_id,started_at desc);
alter table public.pm_permit_monitors enable row level security;
alter table public.pm_permit_runs enable row level security;
create policy pm_permit_monitor_read on public.pm_permit_monitors for select to authenticated using(public.pm_has_access(workspace_id));
create policy pm_permit_run_read on public.pm_permit_runs for select to authenticated using(public.pm_has_access(workspace_id));
revoke all on public.pm_permit_monitors,public.pm_permit_runs from anon,authenticated;
grant select on public.pm_permit_monitors,public.pm_permit_runs to authenticated;
grant all on public.pm_permit_monitors,public.pm_permit_runs to service_role;

create function public.pm_validate_permits() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare parent public.pm_records; child public.pm_records; k text; v text;
begin
  if new.kind='permit' then
    if jsonb_typeof(new.data->'permit_number') is distinct from 'string' or jsonb_typeof(new.data->'jurisdiction') is distinct from 'string' or new.project_id is null or coalesce(btrim(new.data->>'permit_number'),'')='' or coalesce(btrim(new.data->>'jurisdiction'),'')=''
      or length(new.data->>'permit_number')>200 or length(new.data->>'jurisdiction')>200 then
      raise exception 'A permit needs its property, number and jurisdiction' using errcode='23514';
    end if;
    if new.status not in ('Unknown','Applied','In review','Corrections required','Approved','Issued','Active','Final inspections','On hold','Expired','Closed','Cancelled','Not required') then
      raise exception 'Invalid permit status' using errcode='23514';
    end if;
    if coalesce(new.data->>'permit_type','') not in ('Master','Subpermit','Standalone') then raise exception 'Choose Master, Subpermit or Standalone' using errcode='23514'; end if;
    if (new.data->>'permit_type'='Subpermit') <> (coalesce(new.data->>'parent_permit_id','')<>'') then raise exception 'Only a subpermit must link to its master permit' using errcode='23514'; end if;
    if new.status<>'Unknown' and (coalesce(new.data->>'source_url','')='' or coalesce(btrim(new.data->>'evidence'),'')='') then raise exception 'A known permit status needs its source URL and evidence' using errcode='23514'; end if;
    if new.status='Not required' and coalesce(btrim(new.data->>'applicability_reason'),'')='' then raise exception 'Explain why no permit is required' using errcode='23514'; end if;
    if new.data->>'issued_date'>new.data->>'expiry_date' then raise exception 'Expiration cannot precede issuance' using errcode='23514'; end if;
    if nullif(new.data->>'fees_due','') is not null and (jsonb_typeof(new.data->'fees_due')<>'number' or (new.data->>'fees_due')::numeric<0 or (new.data->>'fees_due')::numeric>1000000000000) then raise exception 'Invalid fees due' using errcode='23514'; end if;
    for child in select * from public.pm_records where kind='permit' and data->>'parent_permit_id'=new.id::text loop
      if new.data->>'permit_type'<>'Master' then raise exception 'A permit with subpermits must remain a master permit' using errcode='23514'; end if;
      if new.status='Closed' and child.status not in ('Closed','Cancelled','Not required') then raise exception 'Resolve open subpermits before closing the master permit' using errcode='23514'; end if;
    end loop;
  end if;
  if new.kind in ('permit','check') then
    if coalesce(new.data->>'source_url','')<>'' and (length(new.data->>'source_url')>2048 or new.data->>'source_url' !~ '^https://[^/@ ]+([/?#]|$)') then raise exception 'Use an HTTPS source URL without credentials' using errcode='23514'; end if;
    if new.data ? 'automation_paused' and jsonb_typeof(new.data->'automation_paused')<>'boolean' then raise exception 'Automation paused must be boolean' using errcode='23514'; end if;
    foreach k in array array['application_date','issued_date','closed_date','next_action_date'] loop
      v:=nullif(new.data->>k,'');
      if v is not null then
        if v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD dates' using errcode='23514'; end if;
        perform v::date;
      end if;
    end loop;
    foreach k in array array['last_verified_at','source_observed_at'] loop
      if nullif(new.data->>k,'') is not null then perform (new.data->>k)::timestamptz; end if;
    end loop;
  end if;
  foreach k in array array['parent_permit_id','permit_id'] loop
    v:=nullif(new.data->>k,'');
    if v is not null then
      select * into parent from public.pm_records where id=v::uuid;
      if parent.id is null or parent.kind<>'permit' or parent.workspace_id<>new.workspace_id or parent.project_id is distinct from new.project_id or parent.id=new.id then raise exception 'Choose a permit in the same property' using errcode='23514'; end if;
      if k='parent_permit_id' then
        if new.kind<>'permit' or parent.data->>'permit_type'<>'Master' then raise exception 'Subpermits must link to a master permit' using errcode='23514'; end if;
        if parent.status='Closed' and new.status not in ('Closed','Cancelled','Not required') then raise exception 'Reopen the master permit before reopening a subpermit' using errcode='23514'; end if;
      end if;
    end if;
  end loop;
  return null;
end; $$;
revoke all on function public.pm_validate_permits() from public;
create constraint trigger pm_record_permits after insert or update on public.pm_records
  deferrable initially deferred for each row execute function public.pm_validate_permits();

-- Keep the original dependency implementation as a fallback for existing record kinds.
alter function public.pm_dependency_satisfied(uuid) rename to pm_dependency_satisfied_before_permits;
create function public.pm_dependency_satisfied(p_id uuid) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.pm_records;
begin
  select * into r from public.pm_records where id=p_id;
  if r.kind='permit' then
    if r.status='Not required' then return coalesce(btrim(r.data->>'applicability_reason'),'')<>''; end if;
    return r.status in ('Issued','Active','Final inspections','Closed') and coalesce(btrim(r.data->>'evidence'),'')<>'' and coalesce(r.data->>'source_url','') ~ '^https://[^/@ ]+([/?#]|$)';
  end if;
  return public.pm_dependency_satisfied_before_permits(p_id);
end; $$;
revoke all on function public.pm_dependency_satisfied(uuid) from public;

create function public.pm_configure_permit_monitor(p_workspace_id uuid,p_project_id uuid,p_expected_version integer,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.pm_permit_monitors; before_value jsonb;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  if not exists(select 1 from public.pm_projects where id=p_project_id and workspace_id=p_workspace_id) then raise exception 'Project not found' using errcode='P0002'; end if;
  select * into m from public.pm_permit_monitors where workspace_id=p_workspace_id and project_id=p_project_id for update;
  if p_expected_version is null or p_expected_version<>coalesce(m.version,0) then raise exception 'Monitoring settings changed. Refresh before saving.' using errcode='PT409'; end if;
  before_value:=to_jsonb(m);
  if m.id is null then
    insert into public.pm_permit_monitors(workspace_id,project_id) values(p_workspace_id,p_project_id) returning * into m;
  end if;
  update public.pm_permit_monitors set
    enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
    jurisdiction=coalesce(p_settings->>'jurisdiction',jurisdiction),
    source_url=coalesce(p_settings->>'source_url',source_url),
    next_check_at=case when p_settings->>'check_now'='true' or p_settings->>'enabled'='true' then now() else next_check_at end,
    version=version+1,updated_at=now()
    where id=m.id returning * into m;
  insert into public.pm_audit(workspace_id,project_id,action,summary,actor_id,before_data,after_data)
    values(p_workspace_id,p_project_id,'permit_monitor','Updated permit monitoring settings',auth.uid(),before_value,to_jsonb(m));
  return to_jsonb(m);
end; $$;

create function public.pm_claim_permit_check(p_workspace_id uuid,p_project_id uuid,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.pm_permit_monitors; r public.pm_permit_runs;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'Supply a stable request key' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  select * into r from public.pm_permit_runs where workspace_id=p_workspace_id and request_key=p_request_key;
  if r.id is not null then
    if r.actor_id<>auth.uid() or r.project_id<>p_project_id then raise exception 'Request key belongs to another check' using errcode='PT409'; end if;
    return to_jsonb(r);
  end if;
  if not exists(select 1 from public.pm_projects where id=p_project_id and workspace_id=p_workspace_id and not is_demo
    and lower(btrim(status)) not in ('complete','completed','past job','archived','cancelled','canceled')) then raise exception 'Property is not eligible for monitoring' using errcode='23514'; end if;
  insert into public.pm_permit_monitors(workspace_id,project_id) values(p_workspace_id,p_project_id) on conflict(workspace_id,project_id) do nothing;
  select * into m from public.pm_permit_monitors where workspace_id=p_workspace_id and project_id=p_project_id for update;
  if not m.enabled then raise exception 'Permit monitoring is paused' using errcode='23514'; end if;
  if exists(select 1 from public.pm_permit_runs where workspace_id=p_workspace_id and project_id=p_project_id and status='running' and lease_expires_at>now()) then raise exception 'A permit check is already running' using errcode='PT409'; end if;
  if m.next_check_at>now() then raise exception 'This property is not due for a check yet' using errcode='PT409'; end if;
  update public.pm_permit_runs set status='interrupted',finished_at=now(),summary='The previous check did not finish before its lease expired.'
    where workspace_id=p_workspace_id and project_id=p_project_id and status='running';
  insert into public.pm_permit_runs(workspace_id,project_id,actor_id,request_key) values(p_workspace_id,p_project_id,auth.uid(),p_request_key) returning * into r;
  update public.pm_permit_monitors set last_attempt_at=now(),next_check_at=r.lease_expires_at,updated_at=now() where id=m.id;
  return to_jsonb(r);
end; $$;

create function public.pm_complete_permit_check(p_workspace_id uuid,p_run_id uuid,p_outcome text,p_summary text,p_source_url text,p_payload_hash text,p_updates jsonb default '[]')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pm_permit_runs; m public.pm_permit_monitors; item jsonb; prior public.pm_records; saved jsonb; results jsonb:='[]'; data_value jsonb;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  select * into r from public.pm_permit_runs where id=p_run_id and workspace_id=p_workspace_id for update;
  if r.id is null then raise exception 'Permit check not found' using errcode='P0002'; end if;
  if r.actor_id<>auth.uid() then raise exception 'This check belongs to another operator' using errcode='42501'; end if;
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Supply a valid payload hash' using errcode='23514'; end if;
  if r.status<>'running' then
    if r.payload_hash=p_payload_hash then return to_jsonb(r); end if;
    raise exception 'This check already ended. Read its saved result.' using errcode='PT409';
  end if;
  if r.lease_expires_at<=now() then raise exception 'This check expired. Claim a new check and reread the property.' using errcode='PT409'; end if;
  select * into m from public.pm_permit_monitors where workspace_id=p_workspace_id and project_id=r.project_id;
  if not m.enabled or not exists(select 1 from public.pm_projects where id=r.project_id and not is_demo and lower(btrim(status)) not in ('complete','completed','past job','archived','cancelled','canceled')) then raise exception 'Property monitoring was paused or completed' using errcode='PT409'; end if;
  if p_outcome is null or p_outcome not in ('success','no_permits','partial','blocked','error') or coalesce(btrim(p_summary),'')='' or length(p_summary)>4000 then raise exception 'Supply an outcome and concise check summary' using errcode='23514'; end if;
  if p_source_url is null or length(p_source_url)>2048 or (p_source_url<>'' and p_source_url !~ '^https://[^/@ ]+([/?#]|$)') then raise exception 'Use an HTTPS source URL without credentials' using errcode='23514'; end if;
  if p_outcome in ('success','no_permits','partial') and p_source_url='' then raise exception 'A successful observation needs a source URL' using errcode='23514'; end if;
  if p_updates is null or jsonb_typeof(p_updates)<>'array' or jsonb_array_length(p_updates)>200 then raise exception 'Submit at most 200 observed records' using errcode='23514'; end if;
  if p_outcome in ('blocked','error','no_permits') and jsonb_array_length(p_updates)>0 then raise exception 'This outcome cannot change permit records' using errcode='23514'; end if;
  if p_outcome='no_permits' and exists(select 1 from public.pm_records where project_id=r.project_id and kind='permit') then raise exception 'Known permits exist. Report a partial or blocked search instead of no permits.' using errcode='23514'; end if;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_updates)) then raise exception 'Submit each record only once' using errcode='23514'; end if;
  if p_outcome='success' then
    if jsonb_array_length(p_updates)=0 then raise exception 'Report no_permits for an empty verified search, or partial for incomplete observations' using errcode='23514'; end if;
    if exists(select 1 from public.pm_records known where known.project_id=r.project_id and known.kind='permit'
      and known.status not in ('Closed','Cancelled','Not required') and not exists(select 1 from jsonb_array_elements(p_updates) observed where observed->>'id'=known.id::text)) then
      raise exception 'A successful check must cover every open permit. Use partial for missing or protected records.' using errcode='23514';
    end if;
  end if;
  for item in select value from jsonb_array_elements(p_updates) loop
    if item->>'kind' not in ('permit','check') or item->>'kind' is null or nullif(item->>'project_id','')::uuid is distinct from r.project_id then raise exception 'Only this property permits and inspections can be observed' using errcode='23514'; end if;
    if nullif(item->>'id','') is null then raise exception 'Supply stable record IDs' using errcode='23514'; end if;
    select * into prior from public.pm_records where id=(item->>'id')::uuid;
    if prior.id is not null and (prior.workspace_id<>p_workspace_id or prior.project_id<>r.project_id) then raise exception 'Record belongs to another property' using errcode='23514'; end if;
    if prior.id is not null and nullif(item->>'version','') is null then raise exception 'Existing records need the reviewed version' using errcode='PT409'; end if;
    if prior.data->>'automation_paused'='true' then raise exception 'A manual correction protects this record. Human review is required.' using errcode='PT409'; end if;
    data_value:=coalesce(prior.data,'{}')||coalesce(item->'data','{}');
    if coalesce(data_value->>'automation_paused','false') is distinct from coalesce(prior.data->>'automation_paused','false') then raise exception 'Monitoring cannot change manual protection' using errcode='23514'; end if;
    if coalesce(data_value->>'source_url','') !~ '^https://[^/@ ]+([/?#]|$)' or coalesce(btrim(data_value->>'evidence'),'')='' then raise exception 'Each observation needs its source URL and evidence' using errcode='23514'; end if;
    if item->>'kind'='check' and nullif(data_value->>'permit_id','') is null then raise exception 'Observed inspections must link to a permit' using errcode='23514'; end if;
    if item->>'kind'='check' and prior.id is null and coalesce(btrim(data_value->>'external_key'),'')='' then raise exception 'New inspections need a stable source inspection identifier' using errcode='23514'; end if;
    if nullif(item->'data'->>'source_observed_at','') is null then raise exception 'Each observation needs its source observation timestamp' using errcode='23514'; end if;
    if nullif(data_value->>'source_observed_at','') is not null then
      if (data_value->>'source_observed_at')::timestamptz<r.started_at-interval '5 minutes' then raise exception 'Observation is older than this check. Fetch the source again.' using errcode='PT409'; end if;
      if (data_value->>'source_observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Observation time is in the future' using errcode='23514'; end if;
      if nullif(prior.data->>'source_observed_at','') is not null and (data_value->>'source_observed_at')::timestamptz<(prior.data->>'source_observed_at')::timestamptz then raise exception 'Observation is older than the saved source result' using errcode='PT409'; end if;
    end if;
    item:=jsonb_set(item,'{data}',data_value||jsonb_build_object('last_verified_at',now(),'last_permit_run_id',r.id));
    saved:=public.pm_save_record(p_workspace_id,item,nullif(item->>'version','')::integer);
    results:=results||jsonb_build_array(saved);
  end loop;
  update public.pm_permit_runs set status=p_outcome,summary=p_summary,source_url=p_source_url,finished_at=now(),payload_hash=p_payload_hash,result=jsonb_build_object('records',results)
    where id=r.id returning * into r;
  update public.pm_permit_monitors set last_outcome=p_outcome,last_summary=p_summary,
    last_success_at=case when p_outcome in ('success','no_permits') then now() else last_success_at end,
    next_check_at=date_trunc('hour',now())+interval '1 hour',failure_count=case when p_outcome in ('success','no_permits') then 0 else failure_count+1 end,
    updated_at=now()
    where id=m.id;
  return to_jsonb(r);
end; $$;

revoke all on function public.pm_configure_permit_monitor(uuid,uuid,integer,jsonb),public.pm_claim_permit_check(uuid,uuid,uuid),public.pm_complete_permit_check(uuid,uuid,text,text,text,text,jsonb) from public;
grant execute on function public.pm_configure_permit_monitor(uuid,uuid,integer,jsonb),public.pm_claim_permit_check(uuid,uuid,uuid),public.pm_complete_permit_check(uuid,uuid,text,text,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
