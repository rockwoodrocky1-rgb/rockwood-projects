-- Owner-selected policy: any authenticated account may join Rockwood as manager.
-- Configuration is operator-only. This does not make records anonymously readable.
create table public.pm_registration (
  singleton boolean primary key default true check (singleton),
  workspace_id uuid not null references public.pm_workspaces(id),
  enabled boolean not null default false
);
alter table public.pm_registration enable row level security;
revoke all on public.pm_registration from public, anon, authenticated;
grant all on public.pm_registration to service_role;

-- Explicit production target; other environments remain closed until configured.
insert into public.pm_registration(workspace_id, enabled)
select id, true from public.pm_workspaces where id = '80c3b3e9-025c-45e1-81fd-bfdbd2f56be2';

create function public.pm_join_open_workspace() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid := auth.uid(); target uuid; member public.pm_members; added boolean := false;
begin
  if actor is null then raise exception 'Please sign in.' using errcode='42501'; end if;
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
