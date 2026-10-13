-- Use explicit HTTP conflict status, not retryable serialization failures.
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
