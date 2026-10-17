-- Additive: the database now checks data.other_contractor_ids, the further subs on a job (PR #4).
-- pm_validate_links is recreated unchanged except for the one marked block below.
-- The pm_record_links trigger keeps using it; existing rows are not rewritten.
begin;
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
  -- Further subs on a job are equal. Each must be a contact in this workspace, from any project, at most 20.
  if new.data ? 'other_contractor_ids' and new.data->'other_contractor_ids'<>'null'::jsonb then
    if jsonb_typeof(new.data->'other_contractor_ids')<>'array' then raise exception 'other_contractor_ids must be an array' using errcode='23514'; end if;
    if jsonb_array_length(new.data->'other_contractor_ids')>20 then raise exception 'Add at most 20 other subs to one job' using errcode='23514'; end if;
    for v in select jsonb_array_elements_text(new.data->'other_contractor_ids') loop
      if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid related record identifier' using errcode='23514'; end if;
      select * into related from public.pm_records r where r.id=v::uuid;
      if related.id is null or related.workspace_id<>new.workspace_id or related.kind<>'contact' then
        raise exception 'Choose a contact in this workspace for each sub' using errcode='23514';
      end if;
    end loop;
  end if;
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
commit;
