-- Cam field entry is name + phone. Invisible browser sessions never become
-- workspace accounts. Existing evidence and worker queues stay in this database.
create or replace function public.pm_join_open_workspace() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target uuid; member public.pm_members; added boolean := false;
begin
  if actor is null then raise exception 'Please sign in.' using errcode='42501'; end if;
  if exists(select 1 from auth.users where id=actor and is_anonymous=true) then
    raise exception 'Create a workspace account to join Rockwood.' using errcode='42501';
  end if;
  select workspace_id into target from public.pm_registration where singleton and enabled for share;
  if target is null then raise exception 'Account setup is not enabled yet. Please contact Rockwood.' using errcode='23514'; end if;
  insert into public.pm_members(workspace_id,user_id,role) values(target,actor,'manager')
    on conflict (workspace_id,user_id) do nothing returning * into member;
  added := found;
  if not added then select * into member from public.pm_members where workspace_id=target and user_id=actor; end if;
  if added then
    insert into public.pm_audit(workspace_id,action,summary,actor_id,after_data)
    values(target,'join','Joined Rockwood through self-service sign-up',actor,to_jsonb(member));
  end if;
  return to_jsonb(member);
end; $$;
revoke all on function public.pm_join_open_workspace() from public, anon;
grant execute on function public.pm_join_open_workspace() to authenticated;

create table public.pm_cam_registration (
  singleton boolean primary key default true check(singleton),
  workspace_id uuid not null references public.pm_workspaces(id),
  enabled boolean not null default false
);
alter table public.pm_cam_registration enable row level security;
revoke all on public.pm_cam_registration from public,anon,authenticated;
grant all on public.pm_cam_registration to service_role;
insert into public.pm_cam_registration(workspace_id,enabled)
select id,true from public.pm_workspaces where id='80c3b3e9-025c-45e1-81fd-bfdbd2f56be2';

create or replace function public.register_field_contact(contact_name text,contact_phone text)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'A browser session is required' using errcode='42501'; end if;
  if contact_name is null or length(trim(contact_name)) not between 2 and 100
    or contact_phone is null or contact_phone !~ '^\+?[0-9]{7,15}$' then
    raise exception 'Enter your name and phone number' using errcode='23514'; end if;
  select workspace_id into target from public.pm_cam_registration where singleton and enabled for share;
  if target is null then raise exception 'Cam entry is not enabled yet' using errcode='23514'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(target,actor,'contributor') on conflict do nothing;
  insert into public.field_contacts(user_id,workspace_id,name,phone) values(actor,target,trim(contact_name),contact_phone)
    on conflict(user_id) do update set workspace_id=excluded.workspace_id,name=excluded.name,phone=excluded.phone,updated_at=now();
end; $$;
revoke all on function public.register_field_contact(text,text) from public,anon;
grant execute on function public.register_field_contact(text,text) to authenticated;

create function private.cam_can_capture(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.pm_has_access(target,true) or exists(
    select 1 from public.workspace_members m join public.field_contacts c
      on c.user_id=m.user_id and c.workspace_id=m.workspace_id
    join public.pm_cam_registration r on r.workspace_id=m.workspace_id and r.enabled
    where m.workspace_id=target and m.user_id=auth.uid() and m.role='contributor');
$$;
revoke all on function private.cam_can_capture(uuid) from public,anon,authenticated;

-- Return only the fields needed to choose a property, never workspace records.
create function public.cam_property_choices(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.pm_has_access(target) and not private.cam_can_capture(target) then
    raise exception 'Enter your name and phone number to continue' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.address,
    'type',p.project_type,'stage',p.status,'areas',p.locations,'image','','number','') order by p.name,p.id)
    from public.pm_projects p where p.workspace_id=target and not p.is_demo
      and (p.status<>'Archived' or public.pm_has_access(target))),'[]'::jsonb);
end; $$;
revoke all on function public.cam_property_choices(uuid) from public,anon;
grant execute on function public.cam_property_choices(uuid) to authenticated;

-- Field visitors can recover their own visits and PDFs. Workspace members can
-- still review all evidence. Name/phone is attribution, not verified identity.
alter policy member_walkthroughs on public.walkthroughs using (
 exists(select 1 from public.workspace_members m where m.workspace_id=walkthroughs.workspace_id
 and m.user_id=auth.uid() and (m.role<>'contributor' or walkthroughs.created_by=m.user_id)));
alter policy member_projects on public.projects using (
 exists(select 1 from public.workspace_members m where m.workspace_id=projects.workspace_id
 and m.user_id=auth.uid() and (m.role<>'contributor' or (not projects.is_sample and projects.stage<>'Archived'))));
alter policy member_media_read on storage.objects using (
 bucket_id='walkthrough-media' and exists(select 1 from public.workspace_members m
 where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid()
 and (m.role<>'contributor' or (storage.foldername(name))[2]=m.user_id::text)));
alter policy member_delivery_status on public.report_deliveries using (
 exists(select 1 from public.workspace_members m where m.workspace_id=report_deliveries.workspace_id and m.user_id=auth.uid()
 and (m.role<>'contributor' or exists(select 1 from public.walkthroughs w
 where w.workspace_id=report_deliveries.workspace_id and w.id=report_deliveries.walkthrough_id and w.created_by=m.user_id))));
alter policy member_report_pdf on storage.objects using (
 bucket_id='walkthrough-reports' and exists(select 1 from public.workspace_members m
 where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid()
 and (m.role<>'contributor' or exists(select 1 from public.report_deliveries d where d.workspace_id=m.workspace_id and d.pdf_path=storage.objects.name))));
alter policy member_processing_status on public.processing_jobs using (
 exists(select 1 from public.workspace_members m where m.workspace_id=processing_jobs.workspace_id and m.user_id=auth.uid()
 and (m.role<>'contributor' or exists(select 1 from public.walkthroughs w
 where w.workspace_id=processing_jobs.workspace_id and w.id=processing_jobs.walkthrough_id and w.created_by=m.user_id))));

create or replace function private.validate_field_submission() returns trigger
language plpgsql security definer set search_path='' as $$
declare photo jsonb; path text; contact public.field_contacts; field_author boolean; prefix text;
begin
  select * into contact from public.field_contacts where user_id=new.created_by and workspace_id=new.workspace_id;
  select exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=new.created_by and role='contributor') into field_author;
  if field_author and contact.user_id is null then raise exception 'Contact details are required' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.payload ? 'participant' then
    new.payload:=jsonb_set(new.payload,'{participant}',old.payload->'participant');
  elsif contact.user_id is not null then
    new.payload:=jsonb_set(new.payload,'{participant}',jsonb_build_object('name',contact.name,'phone',contact.phone));
  end if;
  prefix:=new.workspace_id::text||'/'||new.created_by::text||'/'||new.id||'/';
  if new.payload->'report'->>'mode'='sample' then raise exception 'Sample reports cannot be saved to workspace properties' using errcode='23514'; end if;
  if jsonb_typeof(new.payload->'photos') is distinct from 'array'
    or jsonb_array_length(new.payload->'photos')>12 then raise exception 'Invalid photos' using errcode='23514'; end if;
  for photo in select value from jsonb_array_elements(new.payload->'photos') loop
    if photo->>'projectId' is distinct from new.project_id or photo->>'sessionId' is distinct from new.id then
      raise exception 'Photo belongs to another visit' using errcode='23514'; end if;
    foreach path in array array[photo->'original'->>'path',photo->'model'->>'path'] loop
      if not private.cam_valid_media_path(path,new.workspace_id,new.id) or (field_author and auth.uid()=new.created_by and left(path,length(prefix))<>prefix) then
        raise exception 'Invalid photo path' using errcode='23514'; end if;
    end loop;
  end loop;
  if new.payload->'audio' is not null then
    path:=new.payload->'audio'->>'path';
    if not private.cam_valid_media_path(path,new.workspace_id,new.id) or (field_author and auth.uid()=new.created_by and left(path,length(prefix))<>prefix) then
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

create or replace function public.cam_save_visit(p_workspace_id uuid,p_visit jsonb,p_expected_revision integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_visit public.walkthroughs; result public.walkthroughs; property public.pm_projects;
begin
  if not private.cam_can_capture(p_workspace_id) then raise exception 'You cannot record in this workspace' using errcode='42501'; end if;
  select * into property from public.pm_projects where workspace_id=p_workspace_id and id=(p_visit->>'project_id')::uuid for share;
  if not found or property.is_demo or property.status='Archived' then raise exception 'Choose an active workspace property' using errcode='23514'; end if;
  if coalesce(p_visit->>'id','') !~ '^[a-zA-Z0-9-]{1,100}$' or coalesce(p_visit->'payload'->>'status','') not in ('saved','interrupted') then
    raise exception 'Invalid saved visit' using errcode='23514'; end if;
  select * into current_visit from public.walkthroughs where workspace_id=p_workspace_id and id=p_visit->>'id' for update;
  if found then
    if not public.pm_has_access(p_workspace_id,true) and current_visit.created_by<>auth.uid() then
      raise exception 'You can only change your own walkthroughs' using errcode='42501'; end if;
    -- Exact replay after an uncertain response returns the saved record.
    if current_visit.project_id=p_visit->>'project_id' and (current_visit.payload-'participant')=((p_visit->'payload')-'participant')
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
create or replace function public.cam_archive_visit(p_workspace_id uuid,p_visit_id text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.walkthroughs;
begin
  if not private.cam_can_capture(p_workspace_id) then raise exception 'You cannot change this workspace' using errcode='42501'; end if;
  update public.walkthroughs set archived_at=now(),revision=revision+1
    where workspace_id=p_workspace_id and id=p_visit_id and revision=p_expected_revision and archived_at is null and (public.pm_has_access(p_workspace_id,true) or created_by=auth.uid()) returning * into result;
  if not found then raise exception 'This visit changed. Reopen it before archiving.' using errcode='PT409'; end if;
  return to_jsonb(result);
end; $$;
revoke all on function public.cam_save_visit(uuid,jsonb,integer),public.cam_archive_visit(uuid,text,integer) from public,anon;
grant execute on function public.cam_save_visit(uuid,jsonb,integer),public.cam_archive_visit(uuid,text,integer) to authenticated;
create or replace function public.consume_cam_ai_budget(p_workspace uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare workspace uuid; user_calls integer; total_calls integer; current_user_id uuid := (select auth.uid());
begin
 if not private.cam_can_capture(p_workspace) then return false; end if;
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
