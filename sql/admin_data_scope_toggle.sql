-- Adds a system setting that controls whether Admin users can view all business data
-- or only their own rows. Run this once in Supabase SQL Editor.

alter table public.system_settings
  add column if not exists admin_global_data_access boolean default true;

update public.system_settings
set admin_global_data_access = coalesce(admin_global_data_access, true)
where admin_global_data_access is null;

create or replace function public.can_current_user_access_all_business_data()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_current_user_admin()
    and coalesce(
      (select ss.admin_global_data_access
       from public.system_settings ss
       order by ss.id asc
       limit 1),
      true
    );
$$;

grant execute on function public.can_current_user_access_all_business_data() to authenticated;

drop policy if exists "Clients owner or admin select" on public.clients;
drop policy if exists "Clients owner or admin insert" on public.clients;
drop policy if exists "Clients owner or admin update" on public.clients;
drop policy if exists "Clients owner or admin delete" on public.clients;

drop policy if exists "Duty owner or admin select" on public.duty_payments;
drop policy if exists "Duty owner or admin insert" on public.duty_payments;
drop policy if exists "Duty owner or admin update" on public.duty_payments;
drop policy if exists "Duty owner or admin delete" on public.duty_payments;

drop policy if exists "Assessments owner or admin select" on public.assessments;
drop policy if exists "Assessments owner or admin insert" on public.assessments;
drop policy if exists "Assessments owner or admin update" on public.assessments;
drop policy if exists "Assessments owner or admin delete" on public.assessments;

drop policy if exists "Audit logs owner or admin select" on public.audit_logs;
drop policy if exists "Audit logs owner or admin insert" on public.audit_logs;
drop policy if exists "Audit logs owner or admin update" on public.audit_logs;
drop policy if exists "Audit logs owner or admin delete" on public.audit_logs;

create policy "Clients owner or admin select"
  on public.clients
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('ain_view')
  );

create policy "Clients owner or admin insert"
  on public.clients
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('ain_add')
  );

create policy "Clients owner or admin update"
  on public.clients
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('ain_add')
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('ain_add')
  );

create policy "Clients owner or admin delete"
  on public.clients
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('ain_delete')
  );

create policy "Duty owner or admin select"
  on public.duty_payments
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

create policy "Duty owner or admin insert"
  on public.duty_payments
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

create policy "Duty owner or admin update"
  on public.duty_payments
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and (
      public.has_current_user_permission('bill_edit')
      or public.has_current_user_permission('bill_bulk_pay')
    )
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and (
      public.has_current_user_permission('bill_edit')
      or public.has_current_user_permission('bill_bulk_pay')
    )
  );

create policy "Duty owner or admin delete"
  on public.duty_payments
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

create policy "Assessments owner or admin select"
  on public.assessments
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

create policy "Assessments owner or admin insert"
  on public.assessments
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

create policy "Assessments owner or admin update"
  on public.assessments
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and (
      public.has_current_user_permission('bill_edit')
      or public.has_current_user_permission('bill_bulk_pay')
    )
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and (
      public.has_current_user_permission('bill_edit')
      or public.has_current_user_permission('bill_bulk_pay')
    )
  );

create policy "Assessments owner or admin delete"
  on public.assessments
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

create policy "Audit logs owner or admin select"
  on public.audit_logs
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('view_logs')
  );

create policy "Audit logs owner or admin insert"
  on public.audit_logs
  for insert
  with check (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data());

create policy "Audit logs owner or admin update"
  on public.audit_logs
  for update
  using (public.can_current_user_access_all_business_data())
  with check (public.can_current_user_access_all_business_data());

create policy "Audit logs owner or admin delete"
  on public.audit_logs
  for delete
  using (public.can_current_user_access_all_business_data());
