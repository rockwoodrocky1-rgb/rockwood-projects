-- Install the existing Cam evidence/processing schema in the Projects database.
-- This is a new database installation; it does not replay or move the legacy Cam database.


-- Imported from Cam 20261012180049_rockwood_shared_walkthroughs.sql
-- Client-owned testing workspace. No anonymous access to project records or media.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members(user_id);
create table private.workspace_invitations (
  workspace_id uuid not null references public.workspaces(id),
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (workspace_id, email)
);
create table public.projects (
  workspace_id uuid not null references public.workspaces(id),
  id text not null,
  name text not null,
  type text not null,
  stage text not null,
  areas text[] not null default '{}',
  image text not null,
  number text not null,
  is_sample boolean not null default false,
  primary key (workspace_id, id)
);
create table public.walkthroughs (
  workspace_id uuid not null references public.workspaces(id),
  id text not null check (length(id) between 1 and 100),
  project_id text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  started_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 500000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id)
);
create index walkthroughs_recent on public.walkthroughs(workspace_id, started_at desc) where archived_at is null;
create index walkthroughs_project on public.walkthroughs(workspace_id, project_id);
create index walkthroughs_creator on public.walkthroughs(created_by);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.walkthroughs enable row level security;
alter table private.workspace_invitations enable row level security;
revoke all on public.workspaces, public.workspace_members, public.projects, public.walkthroughs from anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.projects, public.walkthroughs to authenticated;
grant insert (workspace_id, id, project_id, started_at, payload) on public.walkthroughs to authenticated;
grant update (payload, revision, archived_at) on public.walkthroughs to authenticated;
create policy own_membership on public.workspace_members for select to authenticated using (user_id = (select auth.uid()));
create policy member_workspace on public.workspaces for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = (select auth.uid()))
);
create policy member_projects on public.projects for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = projects.workspace_id and m.user_id = (select auth.uid()))
);
create policy member_walkthroughs on public.walkthroughs for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = walkthroughs.workspace_id and m.user_id = (select auth.uid()))
);
create policy create_walkthrough on public.walkthroughs for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.workspace_members m where m.workspace_id = walkthroughs.workspace_id
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  )
);
create policy edit_walkthrough on public.walkthroughs for update to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = walkthroughs.workspace_id
    and m.user_id = (select auth.uid()) and (m.role = 'owner' or (m.role = 'editor' and created_by = m.user_id)))
) with check (
  exists (select 1 from public.workspace_members m where m.workspace_id = walkthroughs.workspace_id
    and m.user_id = (select auth.uid()) and (m.role = 'owner' or (m.role = 'editor' and created_by = m.user_id)))
);

-- Keep ownership immutable and reject lost updates even from direct API clients.
create function private.validate_walkthrough_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id <> old.workspace_id or new.id <> old.id or new.created_by <> old.created_by
    or new.project_id <> old.project_id or new.started_at <> old.started_at then
    raise exception 'Walkthrough ownership cannot change';
  end if;
  if new.revision <> old.revision + 1 then raise exception 'Walkthrough revision conflict'; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.validate_walkthrough_update() from public, anon, authenticated;
create trigger validate_walkthrough_update before update on public.walkthroughs for each row execute function private.validate_walkthrough_update();

-- The definer helper is narrowly limited to claiming a pre-approved invitation for
-- the CURRENT, verified Auth user. Never trusts browser-supplied user metadata.
create function private.claim_workspace_access() returns void language plpgsql security definer set search_path = '' as $$
declare verified_email text;
begin
  select lower(email) into verified_email from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null and is_anonymous = false;
  if verified_email is null then raise exception 'A verified account is required'; end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    select workspace_id, (select auth.uid()), role from private.workspace_invitations where email = verified_email
    on conflict do nothing;
  delete from private.workspace_invitations where email = verified_email;
end;
$$;
revoke all on function private.claim_workspace_access() from public, anon;
grant execute on function private.claim_workspace_access() to authenticated;
create function public.claim_workspace_access() returns void language sql security invoker set search_path = '' as $$
  select private.claim_workspace_access();
$$;
revoke all on function public.claim_workspace_access() from public, anon;
grant execute on function public.claim_workspace_access() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walkthrough-media', 'walkthrough-media', false, 15000000,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'video/mp4']);
create policy member_media_read on storage.objects for select to authenticated using (
  bucket_id = 'walkthrough-media' and exists (
    select 1 from public.workspace_members m where m.workspace_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
  )
);
create policy member_media_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'walkthrough-media' and (storage.foldername(name))[2] = (select auth.uid())::text and exists (
    select 1 from public.workspace_members m where m.workspace_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  )
);
-- Media is immutable. Archiving hides visits without permanently deleting their files.



-- Imported from Cam 20261012182342_restrict_auto_rls_helper.sql
-- The dashboard's automatic-RLS event trigger must not be a public RPC.
-- The database owner retains execute privilege for its DDL event trigger.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;


-- Imported from Cam 20261012184005_report_delivery_workflow.sql
-- The outbox is committed in the SAME transaction as the report. Closing a
-- browser cannot lose a delivery. Only the trusted worker can mutate jobs.
create table public.report_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  walkthrough_id text not null,
  report_id text not null check (length(report_id) between 1 and 100),
  revision integer not null,
  snapshot jsonb not null,
  project_name text not null,
  is_sample_project boolean not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','needs_attention','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  send_started_at timestamptz,
  email_envelope jsonb,
  pdf_path text,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(workspace_id, report_id),
  foreign key(workspace_id, walkthrough_id) references public.walkthroughs(workspace_id,id)
);
create index report_deliveries_due on public.report_deliveries(next_attempt_at) where status in ('queued','processing');
create index report_deliveries_walkthrough on public.report_deliveries(workspace_id,walkthrough_id);
alter table public.report_deliveries enable row level security;
revoke all on public.report_deliveries from public, anon, authenticated;
grant select(id,workspace_id,walkthrough_id,report_id,revision,status,pdf_path,last_error,created_at,sent_at) on public.report_deliveries to authenticated;
grant all on public.report_deliveries to service_role;
create policy member_delivery_status on public.report_deliveries for select to authenticated using (
 exists(select 1 from public.workspace_members m where m.workspace_id = report_deliveries.workspace_id and m.user_id = (select auth.uid()))
);

create function private.queue_report_delivery() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.archived_at is null and new.payload->'report'->>'mode' in ('manual','live')
   and length(new.payload->'report'->>'id') between 1 and 100 then
  insert into public.report_deliveries(workspace_id,walkthrough_id,report_id,revision,snapshot,project_name,is_sample_project)
  select new.workspace_id,new.id,new.payload->'report'->>'id',new.revision,to_jsonb(new),p.name,p.is_sample
  from public.projects p where p.workspace_id=new.workspace_id and p.id=new.project_id
  on conflict(workspace_id,report_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function private.queue_report_delivery() from public,anon,authenticated;
create trigger report_delivery_outbox after insert or update on public.walkthroughs
for each row execute function private.queue_report_delivery();

-- One job per invocation, with a lease and SKIP LOCKED for concurrent workers.
-- Never replay an uncertain send after the provider's 24-hour deduplication window.
create function public.claim_report_delivery(job_id uuid default null)
returns setof public.report_deliveries language plpgsql set search_path = '' as $$
declare selected_id uuid;
begin
 update public.report_deliveries set status='needs_attention',last_error='Email confirmation needs an administrator review. Automatic resending is paused.'
 where status in ('queued','processing') and send_started_at < now()-interval '23 hours'
 and (lease_until is null or lease_until < now());
 select d.id into selected_id from public.report_deliveries d
 where (job_id is null or d.id=job_id) and d.next_attempt_at<=now()
 and (d.status='queued' or (d.status='processing' and d.lease_until<now()))
 order by d.created_at for update skip locked limit 1;
 if selected_id is null then return; end if;
 return query update public.report_deliveries set status='processing',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where id=selected_id returning *;
end;
$$;
revoke all on function public.claim_report_delivery(uuid) from public,anon,authenticated;
grant execute on function public.claim_report_delivery(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('walkthrough-reports','walkthrough-reports',false,10000000,array['application/pdf']);
create policy member_report_pdf on storage.objects for select to authenticated using (
 bucket_id='walkthrough-reports' and exists(
  select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())
 )
);
-- No client insert/update/delete grants on the PDF bucket. Worker uses a server-only key.


-- Imported from Cam 20261012190440_report_worker_read_access.sql
-- The project's explicit API grants also restrict service_role. The worker only
-- needs to check whether a queued visit was archived before sending it.
grant select (workspace_id, id, archived_at) on public.walkthroughs to service_role;


-- Imported from Cam 20261012194009_field_contacts_and_english_reports.sql
-- Name/phone entry and English reports. Apply with the subsequent shared-property access migration.
-- Anonymous Auth sessions are invisible to field users: name + phone are self-reported
-- contact details, never proof of identity and never a cross-device lookup key.
alter table public.workspace_members drop constraint workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('owner','editor','viewer','contributor'));
create table public.field_contacts (
  user_id uuid primary key references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(trim(name)) between 2 and 100),
  phone text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  updated_at timestamptz not null default now()
);
alter table public.field_contacts enable row level security;
revoke all on public.field_contacts from public, anon, authenticated;
grant select on public.field_contacts to authenticated;
create policy own_contact on public.field_contacts for select to authenticated using (user_id = (select auth.uid()));
create function public.register_field_contact(contact_name text, contact_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare workspace uuid; current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'A browser session is required'; end if;
  if length(trim(contact_name)) not between 2 and 100 or contact_phone !~ '^\+?[0-9]{7,15}$' then raise exception 'Invalid contact details'; end if;
  select id into strict workspace from public.workspaces where slug='rockwood-development';
  insert into public.workspace_members(workspace_id,user_id,role) values(workspace,current_user_id,'contributor') on conflict do nothing;
  insert into public.field_contacts(user_id,workspace_id,name,phone) values(current_user_id,workspace,trim(contact_name),contact_phone)
    on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,updated_at=now();
end;
$$;
revoke all on function public.register_field_contact(text,text) from public, anon;
grant execute on function public.register_field_contact(text,text) to authenticated;

-- Existing company roles retain their existing permissions. Field contributors can
-- see shared project choices, but only their own visits, evidence and delivery state.
alter policy member_walkthroughs on public.walkthroughs using (
 exists(select 1 from public.workspace_members m where m.workspace_id=walkthroughs.workspace_id and m.user_id=(select auth.uid())
 and (m.role<>'contributor' or walkthroughs.created_by=m.user_id))
);
alter policy create_walkthrough on public.walkthroughs with check (
 created_by=(select auth.uid()) and exists(select 1 from public.workspace_members m where m.workspace_id=walkthroughs.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','editor','contributor'))
);
alter policy edit_walkthrough on public.walkthroughs using (
 exists(select 1 from public.workspace_members m where m.workspace_id=walkthroughs.workspace_id and m.user_id=(select auth.uid()) and (m.role='owner' or (m.role in ('editor','contributor') and created_by=m.user_id)))
) with check (
 exists(select 1 from public.workspace_members m where m.workspace_id=walkthroughs.workspace_id and m.user_id=(select auth.uid()) and (m.role='owner' or (m.role in ('editor','contributor') and created_by=m.user_id)))
);
alter policy member_media_read on storage.objects using (
 bucket_id='walkthrough-media' and exists(select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())
 and (m.role<>'contributor' or (storage.foldername(name))[2]=m.user_id::text))
);
alter policy member_media_upload on storage.objects with check (
 bucket_id='walkthrough-media' and (storage.foldername(name))[2]=(select auth.uid())::text and exists(select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.role in ('owner','editor','contributor'))
);
alter policy member_delivery_status on public.report_deliveries using (
 exists(select 1 from public.workspace_members m where m.workspace_id=report_deliveries.workspace_id and m.user_id=(select auth.uid()) and
 (m.role<>'contributor' or exists(select 1 from public.walkthroughs w where w.workspace_id=report_deliveries.workspace_id and w.id=report_deliveries.walkthrough_id and w.created_by=m.user_id)))
);
alter policy member_report_pdf on storage.objects using (
 bucket_id='walkthrough-reports' and exists(select 1 from public.workspace_members m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and
 (m.role<>'contributor' or exists(select 1 from public.report_deliveries d where d.workspace_id=m.workspace_id and d.pdf_path=storage.objects.name)))
);

-- Freeze the self-reported contact from its server-side row, not a forged payload.
-- Members cannot mutate evidence paths to cause the PDF worker to read other visits.
create function private.validate_field_submission() returns trigger language plpgsql security definer set search_path = '' as $$
declare contact public.field_contacts; contributor boolean; photo jsonb; path text; prefix text;
begin
 select * into contact from public.field_contacts where user_id=new.created_by and workspace_id=new.workspace_id;
 if contact.user_id is not null then
   if TG_OP='UPDATE' and old.payload ? 'participant' then
     new.payload := jsonb_set(new.payload,'{participant}',old.payload->'participant');
   else
     new.payload := jsonb_set(new.payload,'{participant}',jsonb_build_object('name',contact.name,'phone',contact.phone));
   end if;
 end if;
 select exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=new.created_by and role='contributor') into contributor;
 if contributor then
   if contact.user_id is null then raise exception 'Contact details are required'; end if;
   prefix := new.workspace_id::text || '/' || new.created_by::text || '/' || new.id || '/';
   for photo in select value from jsonb_array_elements(coalesce(new.payload->'photos','[]'::jsonb)) loop
     foreach path in array array[photo->'original'->>'path',photo->'model'->>'path'] loop
       if path is null or left(path,length(prefix))<>prefix or position('..' in path)>0 then raise exception 'Invalid photo path'; end if;
     end loop;
   end loop;
   if new.payload->'audio' is not null then
     path := new.payload->'audio'->>'path';
     if path is null or left(path,length(prefix))<>prefix or position('..' in path)>0 then raise exception 'Invalid audio path'; end if;
   end if;
 end if;
 if new.payload->>'language'='es' and new.payload->'report' is not null and new.payload->'report'->>'mode'<>'sample'
 and (new.payload->'report'->>'outputLanguage') is distinct from 'en' then raise exception 'Prepare the English report before delivery'; end if;
 return new;
end;
$$;
revoke all on function private.validate_field_submission() from public,anon,authenticated;
create trigger validate_field_submission before insert or update on public.walkthroughs for each row execute function private.validate_field_submission();

-- The read-only email-link endpoint reads exactly one authorized visit. Its server
-- key stays out of the browser; object buckets and the Data API remain private.
grant select on public.walkthroughs, public.projects to service_role;

-- One atomic daily budget for this testing workspace and a per-session budget.
-- This bounds paid requests even when field entry requires no verification.
create table private.ai_daily_usage (
  workspace_id uuid not null references public.workspaces(id),
  usage_date date not null,
  subject text not null,
  calls integer not null default 0,
  primary key(workspace_id,usage_date,subject)
);
alter table private.ai_daily_usage enable row level security;
revoke all on private.ai_daily_usage from public,anon,authenticated;
create function public.consume_field_ai_budget() returns boolean language plpgsql security definer set search_path = '' as $$
declare workspace uuid; user_calls integer; total_calls integer; current_user_id uuid := (select auth.uid());
begin
 select workspace_id into workspace from public.workspace_members where user_id=current_user_id and role in ('owner','editor','contributor') limit 1;
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
revoke all on function public.consume_field_ai_budget() from public,anon;
grant execute on function public.consume_field_ai_budget() to authenticated;


-- Imported from Cam 20261012202423_shared_property_report_access.sql
-- Owner-approved internal workflow: everyone who enters name + phone can read
-- all property visits in the Rockwood workspace. No verified identity is implied.
-- Keep existing ownership rules for writes and keep both Storage buckets private.
alter policy member_walkthroughs on public.walkthroughs using (
  exists(select 1 from public.workspace_members m
    where m.workspace_id=walkthroughs.workspace_id and m.user_id=(select auth.uid()))
);
alter policy member_media_read on storage.objects using (
  bucket_id='walkthrough-media' and exists(select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()))
);
alter policy member_delivery_status on public.report_deliveries using (
  exists(select 1 from public.workspace_members m
    where m.workspace_id=report_deliveries.workspace_id and m.user_id=(select auth.uid()))
);
alter policy member_report_pdf on storage.objects using (
  bucket_id='walkthrough-reports' and exists(select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()))
);


-- Imported from Cam 20261014151500_durable_report_processing.sql
-- Durable processing uses the canonical saved visit, never a browser-supplied
-- snapshot or a stored browser JWT. AWS workers receive only the job UUID.
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  walkthrough_id text not null,
  source_revision integer not null check (source_revision > 0),
  requested_by uuid not null references auth.users(id),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed','conflict','cancelled')),
  phase text not null default 'queued'
    check (phase in ('queued','transcribing','reporting','complete')),
  transcribe_generation integer not null default 0 check (transcribe_generation >= 0),
  transcribe_failed boolean not null default false,
  transcribe_job_name text,
  audio_key text,
  transcript jsonb,
  report jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  poll_count integer not null default 0 check (poll_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  next_attempt_at timestamptz not null default now(),
  deadline_at timestamptz not null default (now() + interval '60 minutes'),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(workspace_id, walkthrough_id, source_revision),
  foreign key(workspace_id,walkthrough_id)
    references public.walkthroughs(workspace_id,id)
);
create index processing_jobs_due on public.processing_jobs(next_attempt_at)
  where status in ('queued','processing');
alter table public.processing_jobs enable row level security;
revoke all on public.processing_jobs from public,anon,authenticated;
grant select(id,workspace_id,walkthrough_id,source_revision,status,phase,
  transcript,report,last_error,created_at,updated_at,completed_at)
  on public.processing_jobs to authenticated;
grant all on public.processing_jobs to service_role;
create policy member_processing_status on public.processing_jobs for select
  to authenticated using (
    exists(select 1 from public.workspace_members m
      where m.workspace_id=processing_jobs.workspace_id
      and m.user_id=(select auth.uid()))
  );

create function private.preserve_processing_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.walkthrough_id is distinct from old.walkthrough_id
    or new.source_revision is distinct from old.source_revision
    or new.requested_by is distinct from old.requested_by
    or new.snapshot is distinct from old.snapshot
    or new.created_at is distinct from old.created_at then
    raise exception 'Processing input is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.preserve_processing_snapshot() from public,anon,authenticated;
create trigger preserve_processing_snapshot before update on public.processing_jobs
  for each row execute function private.preserve_processing_snapshot();

create function public.enqueue_report_processing(
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
      if not public.consume_field_ai_budget() then raise exception 'The daily processing limit has been reached'; end if;
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
  if not public.consume_field_ai_budget() then raise exception 'The daily processing limit has been reached'; end if;
  insert into public.processing_jobs(workspace_id,walkthrough_id,source_revision,requested_by,snapshot)
    values(target_workspace,target_visit,visit.revision,current_user_id,to_jsonb(visit))
    returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.enqueue_report_processing(uuid,text,boolean) from public,anon;
grant execute on function public.enqueue_report_processing(uuid,text,boolean) to authenticated;

create function public.claim_report_processing(job_id uuid default null)
returns setof public.processing_jobs language plpgsql set search_path = '' as $$
declare selected_id uuid;
begin
  select j.id into selected_id from public.processing_jobs j
    where (job_id is null or j.id=job_id) and j.next_attempt_at<=now()
    and (j.status='queued' or (j.status='processing' and j.lease_until<now()))
    order by j.next_attempt_at,j.created_at for update skip locked limit 1;
  if selected_id is null then return; end if;
  return query update public.processing_jobs set status='processing',attempts=attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    where id=selected_id returning *;
end;
$$;
revoke all on function public.claim_report_processing(uuid) from public,anon,authenticated;
grant execute on function public.claim_report_processing(uuid) to service_role;

-- The worker has no broad UPDATE grant on walkthroughs. This function commits
-- only generated transcript/report fields after checking a live exclusive lease
-- and the exact source revision. Existing ownership/media safeguards still run.
create function public.complete_report_processing(
  job_id uuid, worker_lease uuid, transcript_value jsonb, report_value jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  job public.processing_jobs;
  visit public.walkthroughs;
  final_report jsonb;
  final_payload jsonb;
begin
  -- Match enqueue's visit-then-job lock order to avoid concurrent enqueue/finalize deadlocks.
  select * into job from public.processing_jobs j where j.id=job_id;
  if not found then raise exception 'Processing job not found'; end if;
  select * into visit from public.walkthroughs w
    where w.workspace_id=job.workspace_id and w.id=job.walkthrough_id for update;
  select * into job from public.processing_jobs j where j.id=job_id for update;
  if job.status='completed' then return 'completed'; end if;
  if job.status<>'processing' or worker_lease is null or job.lease_token is null
    or job.lease_token is distinct from worker_lease
    or job.lease_until is null or job.lease_until<=now() then
    raise exception 'Processing lease expired or changed';
  end if;
  if report_value is null or jsonb_typeof(report_value)<>'object'
    or coalesce(trim(report_value->>'summary'),'')=''
    or jsonb_typeof(report_value->'observations') is distinct from 'array'
    or jsonb_typeof(report_value->'actionItems') is distinct from 'array'
    or jsonb_typeof(report_value->'captions') is distinct from 'array' then
    raise exception 'A validated English report is required';
  end if;
  if transcript_value is not null and (
    jsonb_typeof(transcript_value) is distinct from 'object'
    or jsonb_typeof(transcript_value->'text') is distinct from 'string'
    or jsonb_typeof(transcript_value->'segments') is distinct from 'array'
    or coalesce(transcript_value->>'source','') not in ('audio','manual')) then
    raise exception 'A validated source transcript is required';
  end if;
  final_report := report_value || jsonb_build_object(
    'id',job.id::text,'projectId',visit.project_id,'sessionId',visit.id,
    'generatedAt',now(),'mode','live','outputLanguage','en','reviewStatus','draft');
  if visit.archived_at is not null then
    update public.processing_jobs set status='cancelled',transcript=transcript_value,
      report=final_report,last_error='This visit was archived. Generated work is retained.',
      lease_token=null,lease_until=null,completed_at=now() where id=job.id;
    return 'cancelled';
  end if;
  if visit.revision<>job.source_revision then
    update public.processing_jobs set status='conflict',transcript=transcript_value,
      report=final_report,last_error='This visit changed during processing. Generated work is retained for review.',
      lease_token=null,lease_until=null,completed_at=now() where id=job.id;
    return 'conflict';
  end if;
  final_payload := (visit.payload-'error') || jsonb_build_object('report',final_report);
  if transcript_value is not null then
    final_payload := final_payload || jsonb_build_object('transcript',transcript_value);
  end if;
  update public.walkthroughs set payload=final_payload,revision=revision+1
    where workspace_id=job.workspace_id and id=job.walkthrough_id;
  update public.processing_jobs set status='completed',phase='complete',
    transcript=transcript_value,report=final_report,last_error=null,
    lease_token=null,lease_until=null,completed_at=now() where id=job.id;
  return 'completed';
end;
$$;
revoke all on function public.complete_report_processing(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_report_processing(uuid,uuid,jsonb,jsonb) to service_role;


-- Imported from Cam 20261014163813_prioritize_pending_report_pdfs.sql
-- Make new PDFs available before retrying older, already-rendered email jobs.
-- Eligibility, expired-send protection and exclusive leases remain unchanged.
create or replace function public.claim_report_delivery(job_id uuid default null)
returns setof public.report_deliveries language plpgsql set search_path = '' as $$
declare selected_id uuid;
begin
 update public.report_deliveries set status='needs_attention',last_error='Email confirmation needs an administrator review. Automatic resending is paused.'
 where status in ('queued','processing') and send_started_at < now()-interval '23 hours'
 and (lease_until is null or lease_until < now());
 select d.id into selected_id from public.report_deliveries d
 where (job_id is null or d.id=job_id) and d.next_attempt_at<=now()
 and (d.status='queued' or (d.status='processing' and d.lease_until<now()))
 order by (d.pdf_path is null) desc,d.created_at,d.id for update skip locked limit 1;
 if selected_id is null then return; end if;
 return query update public.report_deliveries set status='processing',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where id=selected_id returning *;
end;
$$;
revoke all on function public.claim_report_delivery(uuid) from public,anon,authenticated;
grant execute on function public.claim_report_delivery(uuid) to service_role;
