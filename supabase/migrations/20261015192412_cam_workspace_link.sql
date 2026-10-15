-- Projects owns identities, roles and properties. Cam retains its evidence and
-- background-job schema, with the same canonical workspace/project IDs.
revoke execute on function public.register_field_contact(text,text) from authenticated;
revoke execute on function public.claim_workspace_access() from authenticated;
revoke execute on function private.claim_workspace_access() from authenticated;
revoke insert,update on public.walkthroughs from authenticated;

create function private.cam_sync_workspace() returns trigger language plpgsql
security definer set search_path='' as $$ begin
  insert into public.workspaces(id,slug,name) values(new.id,'projects-'||new.id,new.name)
  on conflict(id) do update set name=excluded.name;
  return new;
end; $$;
create trigger cam_sync_workspace after insert or update on public.pm_workspaces
for each row execute function private.cam_sync_workspace();
insert into public.workspaces(id,slug,name) select id,'projects-'||id,name from public.pm_workspaces;

create function private.cam_sync_member() returns trigger language plpgsql
security definer set search_path='' as $$ begin
  if tg_op='DELETE' then
    delete from public.workspace_members where workspace_id=old.workspace_id and user_id=old.user_id;
    return old;
  end if;
  if tg_op='UPDATE' and (old.workspace_id<>new.workspace_id or old.user_id<>new.user_id) then
    delete from public.workspace_members where workspace_id=old.workspace_id and user_id=old.user_id;
  end if;
  insert into public.workspace_members(workspace_id,user_id,role)
    values(new.workspace_id,new.user_id,case when new.role='reader' then 'viewer' else 'owner' end)
    on conflict(workspace_id,user_id) do update set role=excluded.role;
  return new;
end; $$;
create trigger cam_sync_member after insert or update or delete on public.pm_members
for each row execute function private.cam_sync_member();
insert into public.workspace_members(workspace_id,user_id,role)
select workspace_id,user_id,case when role='reader' then 'viewer' else 'owner' end from public.pm_members;

create function private.cam_sync_project() returns trigger language plpgsql
security definer set search_path='' as $$ begin
  insert into public.projects(workspace_id,id,name,type,stage,areas,image,number,is_sample)
  values(new.workspace_id,new.id::text,new.name,new.project_type,new.status,array(select jsonb_array_elements_text(new.locations)),'','',new.is_demo)
  on conflict(workspace_id,id) do update set name=excluded.name,type=excluded.type,
    stage=excluded.stage,areas=excluded.areas,is_sample=excluded.is_sample;
  return new;
end; $$;
create trigger cam_sync_project after insert or update on public.pm_projects
for each row execute function private.cam_sync_project();
insert into public.projects(workspace_id,id,name,type,stage,areas,image,number,is_sample)
select workspace_id,id::text,name,project_type,status,array(select jsonb_array_elements_text(locations)),'','',is_demo from public.pm_projects;

-- A durable property inbox: one row per source visit, refreshed with each saved
-- revision. Future Rocky work can read these IDs without inferring task changes.
create table public.pm_cam_visits (
  workspace_id uuid not null references public.pm_workspaces(id),
  visit_id text not null,
  project_id uuid not null,
  created_by uuid not null references auth.users(id),
  captured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  revision integer not null,
  status text not null check(status in ('received','ready_for_review','reviewed','archived')),
  summary text not null default '',
  photo_count integer not null,
  has_audio boolean not null,
  primary key(workspace_id,visit_id),
  foreign key(project_id,workspace_id) references public.pm_projects(id,workspace_id),
  foreign key(workspace_id,visit_id) references public.walkthroughs(workspace_id,id)
);
create index pm_cam_visits_property on public.pm_cam_visits(workspace_id,project_id,captured_at desc);
alter table public.pm_cam_visits enable row level security;
revoke all on public.pm_cam_visits from public,anon,authenticated;
grant select on public.pm_cam_visits to authenticated;
create policy pm_cam_visits_read on public.pm_cam_visits for select to authenticated
using(public.pm_has_access(workspace_id));

create function private.cam_publish_visit() returns trigger language plpgsql
security definer set search_path='' as $$
declare next_status text; previous public.pm_cam_visits; saved public.pm_cam_visits;
begin
  next_status := case when new.archived_at is not null then 'archived'
    when new.payload->'report'->>'reviewStatus'='reviewed' then 'reviewed'
    when new.payload->'report' is not null then 'ready_for_review' else 'received' end;
  select * into previous from public.pm_cam_visits where workspace_id=new.workspace_id and visit_id=new.id;
  insert into public.pm_cam_visits(workspace_id,visit_id,project_id,created_by,captured_at,revision,status,summary,photo_count,has_audio)
  values(new.workspace_id,new.id,new.project_id::uuid,new.created_by,new.started_at,new.revision,next_status,
    coalesce(new.payload->'report'->>'summary',''),jsonb_array_length(coalesce(new.payload->'photos','[]')),
    coalesce((new.payload->'audio'->>'size')::bigint,0)>0)
  on conflict(workspace_id,visit_id) do update set revision=excluded.revision,status=excluded.status,
    summary=excluded.summary,photo_count=excluded.photo_count,has_audio=excluded.has_audio,updated_at=now()
  returning * into saved;
  insert into public.pm_audit(workspace_id,project_id,action,summary,actor_id,before_data,after_data)
  values(new.workspace_id,new.project_id::uuid,'cam_visit',
    case when tg_op='INSERT' then 'Cam visit received' when next_status='archived' then 'Cam visit archived'
      when next_status='reviewed' then 'Cam report reviewed' when next_status='ready_for_review' then 'Cam report ready for review'
      else 'Cam visit updated' end,auth.uid(),to_jsonb(previous),to_jsonb(saved));
  return new;
end; $$;
create trigger cam_publish_visit after insert or update on public.walkthroughs
for each row execute function private.cam_publish_visit();

-- Every evidence object must exist in this workspace and visit. A manager may
-- add media to another member's visit using the manager's own upload folder.
create function private.cam_valid_media_path(path text, workspace uuid, visit text)
returns boolean language sql stable security definer set search_path='' as $$
 select path is not null and split_part(path,'/',1)=workspace::text
   and split_part(path,'/',3)=visit and cardinality(string_to_array(path,'/'))=4
   and position('..' in path)=0 and exists(select 1 from storage.objects
     where bucket_id='walkthrough-media' and name=path);
$$;
revoke all on function private.cam_valid_media_path(text,uuid,text) from public,anon,authenticated;

-- Validate every evidence path, including manager submissions and worker results.
create or replace function private.validate_field_submission() returns trigger
language plpgsql security definer set search_path='' as $$
declare photo jsonb; path text;
begin
  if new.payload->'report'->>'mode'='sample' then raise exception 'Sample reports cannot be saved to workspace properties' using errcode='23514'; end if;
  if jsonb_typeof(new.payload->'photos') is distinct from 'array'
    or jsonb_array_length(new.payload->'photos')>12 then raise exception 'Invalid photos' using errcode='23514'; end if;
  for photo in select value from jsonb_array_elements(new.payload->'photos') loop
    if photo->>'projectId' is distinct from new.project_id or photo->>'sessionId' is distinct from new.id then
      raise exception 'Photo belongs to another visit' using errcode='23514'; end if;
    foreach path in array array[photo->'original'->>'path',photo->'model'->>'path'] loop
      if not private.cam_valid_media_path(path,new.workspace_id,new.id) then
        raise exception 'Invalid photo path' using errcode='23514'; end if;
    end loop;
  end loop;
  if new.payload->'audio' is not null then
    path:=new.payload->'audio'->>'path';
    if not private.cam_valid_media_path(path,new.workspace_id,new.id) then
      raise exception 'Invalid audio path' using errcode='23514'; end if;
  end if;
  if new.payload->'report' is not null and (
    new.payload->'report'->>'projectId' is distinct from new.project_id or
    new.payload->'report'->>'sessionId' is distinct from new.id) then
    raise exception 'Report belongs to another visit' using errcode='23514'; end if;
  if new.payload->>'language'='es' and new.payload->'report' is not null
    and new.payload->'report'->>'outputLanguage' is distinct from 'en' then
    raise exception 'Prepare the English report before delivery' using errcode='23514'; end if;
  return new;
end; $$;

create function public.cam_save_visit(p_workspace_id uuid,p_visit jsonb,p_expected_revision integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_visit public.walkthroughs; result public.walkthroughs; property public.pm_projects;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot record in this workspace' using errcode='42501'; end if;
  select * into property from public.pm_projects where workspace_id=p_workspace_id and id=(p_visit->>'project_id')::uuid for share;
  if not found or property.is_demo or property.status='Archived' then raise exception 'Choose an active workspace property' using errcode='23514'; end if;
  if coalesce(p_visit->>'id','') !~ '^[a-zA-Z0-9-]{1,100}$' or coalesce(p_visit->'payload'->>'status','') not in ('saved','interrupted') then
    raise exception 'Invalid saved visit' using errcode='23514'; end if;
  select * into current_visit from public.walkthroughs where workspace_id=p_workspace_id and id=p_visit->>'id' for update;
  if found then
    -- Exact replay after an uncertain response returns the saved record.
    if current_visit.project_id=p_visit->>'project_id' and current_visit.payload=p_visit->'payload'
      and current_visit.started_at=(p_visit->>'started_at')::timestamptz and current_visit.archived_at is null then return to_jsonb(current_visit); end if;
    if current_visit.revision<>p_expected_revision or current_visit.archived_at is not null then
      raise exception 'This visit changed. Reopen it before saving.' using errcode='PT409'; end if;
    if current_visit.project_id<>p_visit->>'project_id' or current_visit.started_at<>(p_visit->>'started_at')::timestamptz then
      raise exception 'Visit identity cannot change' using errcode='23514'; end if;
    update public.walkthroughs set payload=p_visit->'payload',revision=revision+1
      where workspace_id=p_workspace_id and id=current_visit.id returning * into result;
  else
    if p_expected_revision<>0 then raise exception 'Saved visit not found' using errcode='PT409'; end if;
    insert into public.walkthroughs(workspace_id,id,project_id,created_by,started_at,payload)
    values(p_workspace_id,p_visit->>'id',property.id::text,auth.uid(),(p_visit->>'started_at')::timestamptz,p_visit->'payload') returning * into result;
  end if;
  return to_jsonb(result);
end; $$;
create function public.cam_archive_visit(p_workspace_id uuid,p_visit_id text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.walkthroughs;
begin
  if not public.pm_has_access(p_workspace_id,true) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  update public.walkthroughs set archived_at=now(),revision=revision+1
    where workspace_id=p_workspace_id and id=p_visit_id and revision=p_expected_revision and archived_at is null returning * into result;
  if not found then raise exception 'This visit changed. Reopen it before archiving.' using errcode='PT409'; end if;
  return to_jsonb(result);
end; $$;
revoke all on function public.cam_save_visit(uuid,jsonb,integer),public.cam_archive_visit(uuid,text,integer) from public,anon;
grant execute on function public.cam_save_visit(uuid,jsonb,integer),public.cam_archive_visit(uuid,text,integer) to authenticated;
revoke all on function private.cam_sync_workspace(),private.cam_sync_member(),private.cam_sync_project(),private.cam_publish_visit() from public,anon,authenticated;

-- Charge the selected workspace, including users who belong to more than one.
create function public.consume_cam_ai_budget(p_workspace uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare workspace uuid; user_calls integer; total_calls integer; current_user_id uuid := (select auth.uid());
begin
 if not public.pm_has_access(p_workspace,true) then return false; end if;
 workspace := p_workspace;
 if workspace is null then return false; end if;
 insert into private.ai_daily_usage values(workspace,current_date,'workspace',0) on conflict do nothing;
 select calls into total_calls from private.ai_daily_usage where workspace_id=workspace and usage_date=current_date and subject='workspace' for update;
 insert into private.ai_daily_usage values(workspace,current_date,current_user_id::text,0) on conflict do nothing;
 select calls into user_calls from private.ai_daily_usage where workspace_id=workspace and usage_date=current_date and subject=current_user_id::text for update;
 if total_calls>=100 or user_calls>=20 then return false; end if;
 update private.ai_daily_usage set calls=calls+1 where workspace_id=workspace and usage_date=current_date and subject in ('workspace',current_user_id::text);
 return true;
end;
$$;
revoke all on function public.consume_cam_ai_budget(uuid) from public,anon;
grant execute on function public.consume_cam_ai_budget(uuid) to authenticated;
create or replace function public.enqueue_report_processing(
  workspace_id uuid, walkthrough_id text, retry_failed boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_workspace uuid := workspace_id;
  target_visit text := walkthrough_id;
  current_user_id uuid := (select auth.uid());
  visit public.walkthroughs;
  membership_role text;
  existing public.processing_jobs;
  created_id uuid;
  retry_transcription boolean;
begin
  if current_user_id is null then raise exception 'A browser session is required'; end if;
  select * into visit from public.walkthroughs w
    where w.workspace_id=target_workspace and w.id=target_visit for update;
  if not found then raise exception 'This visit is not available for processing'; end if;
  select m.role into membership_role from public.workspace_members m
    where m.workspace_id=target_workspace and m.user_id=current_user_id;
  if membership_role is null or not (membership_role='owner' or
    (membership_role in ('editor','contributor') and visit.created_by=current_user_id)) then
    raise exception 'Only the visit author or company owner can process this visit';
  end if;
  if visit.archived_at is not null or coalesce(visit.payload->>'status','') not in ('saved','interrupted') then
    raise exception 'Save this visit before processing';
  end if;
  if coalesce(visit.payload->'audio'->>'path','')='' and
    coalesce(trim(visit.payload->'transcript'->>'text'),'')='' and
    coalesce(trim(visit.payload->>'notes'),'')='' and
    jsonb_array_length(coalesce(visit.payload->'photos','[]'::jsonb))=0 then
    raise exception 'Add a recording, notes, or photos before processing';
  end if;
  -- A retry of a lost enqueue response can arrive after completion has advanced
  -- the visit revision. Return that completed job until a human edits the visit.
  select * into existing from public.processing_jobs j
    where j.workspace_id=target_workspace and j.walkthrough_id=target_visit
    and j.status='completed' and j.source_revision+1=visit.revision
    and j.id::text=visit.payload->'report'->>'id';
  if found then return existing.id; end if;
  select * into existing from public.processing_jobs j
    where j.workspace_id=target_workspace and j.walkthrough_id=target_visit
    and j.source_revision=visit.revision for update;
  if found then
    -- Repeated taps and request retries neither charge another budget unit nor
    -- restart a provider job. Only an explicit retry can reopen a failed job.
    if retry_failed and existing.status='failed' then
      if not public.consume_cam_ai_budget(target_workspace) then raise exception 'The daily processing limit has been reached'; end if;
      -- Only a confirmed terminal provider failure permits a new paid job.
      -- Polling/network outages must keep the existing provider identity.
      retry_transcription := existing.phase='transcribing'
        and existing.transcript is null and existing.transcribe_failed;
      update public.processing_jobs set status='queued',phase='queued',
        attempts=0,poll_count=0,failure_count=0,next_attempt_at=now(),
        deadline_at=now()+interval '60 minutes',lease_token=null,lease_until=null,
        last_error=null,completed_at=null,
        transcribe_generation=transcribe_generation + case when retry_transcription then 1 else 0 end,
        transcribe_job_name=case when retry_transcription then null else transcribe_job_name end,
        audio_key=case when retry_transcription then null else audio_key end,
        transcribe_failed=case when retry_transcription then false else transcribe_failed end
        where id=existing.id;
    end if;
    return existing.id;
  end if;
  if not public.consume_cam_ai_budget(target_workspace) then raise exception 'The daily processing limit has been reached'; end if;
  insert into public.processing_jobs(workspace_id,walkthrough_id,source_revision,requested_by,snapshot)
    values(target_workspace,target_visit,visit.revision,current_user_id,to_jsonb(visit))
    returning id into created_id;
  return created_id;
end;
$$;
revoke execute on function public.consume_field_ai_budget() from authenticated;
