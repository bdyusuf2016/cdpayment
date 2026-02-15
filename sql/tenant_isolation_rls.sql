-- Multi-tenant isolation migration:
-- Prevent one user from seeing another user's data, except Admins.

alter table public.clients add column if not exists owner_auth_id uuid references auth.users(id);
alter table public.duty_payments add column if not exists owner_auth_id uuid references auth.users(id);
alter table public.assessments add column if not exists owner_auth_id uuid references auth.users(id);
alter table public.audit_logs add column if not exists owner_auth_id uuid references auth.users(id);

alter table public.clients alter column owner_auth_id set default auth.uid();
alter table public.duty_payments alter column owner_auth_id set default auth.uid();
alter table public.assessments alter column owner_auth_id set default auth.uid();
alter table public.audit_logs alter column owner_auth_id set default auth.uid();

alter table public.clients enable row level security;
alter table public.duty_payments enable row level security;
alter table public.assessments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.staff_users enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users su
    where su.auth_id = auth.uid()
      and su.role = 'Admin'
      and coalesce(su.active, false) = true
  );
$$;

grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "Enable all access for clients" on public.clients;
drop policy if exists "Enable all access for duty_payments" on public.duty_payments;
drop policy if exists "Enable all access for assessments" on public.assessments;
drop policy if exists "Enable all access for audit_logs" on public.audit_logs;
drop policy if exists "Enable all access for staff_users" on public.staff_users;

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

drop policy if exists "Staff users can view own profile or admins can view all" on public.staff_users;
drop policy if exists "Staff users can update own profile or admins can update all" on public.staff_users;
drop policy if exists "Only admins can create staff profiles" on public.staff_users;
drop policy if exists "Only admins can delete staff profiles" on public.staff_users;

create policy "Clients owner or admin select"
  on public.clients
  for select
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Clients owner or admin insert"
  on public.clients
  for insert
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Clients owner or admin update"
  on public.clients
  for update
  using (owner_auth_id = auth.uid() or public.is_current_user_admin())
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Clients owner or admin delete"
  on public.clients
  for delete
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Duty owner or admin select"
  on public.duty_payments
  for select
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Duty owner or admin insert"
  on public.duty_payments
  for insert
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Duty owner or admin update"
  on public.duty_payments
  for update
  using (owner_auth_id = auth.uid() or public.is_current_user_admin())
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Duty owner or admin delete"
  on public.duty_payments
  for delete
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Assessments owner or admin select"
  on public.assessments
  for select
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Assessments owner or admin insert"
  on public.assessments
  for insert
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Assessments owner or admin update"
  on public.assessments
  for update
  using (owner_auth_id = auth.uid() or public.is_current_user_admin())
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Assessments owner or admin delete"
  on public.assessments
  for delete
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Audit logs owner or admin select"
  on public.audit_logs
  for select
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Audit logs owner or admin insert"
  on public.audit_logs
  for insert
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Audit logs owner or admin update"
  on public.audit_logs
  for update
  using (owner_auth_id = auth.uid() or public.is_current_user_admin())
  with check (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Audit logs owner or admin delete"
  on public.audit_logs
  for delete
  using (owner_auth_id = auth.uid() or public.is_current_user_admin());

create policy "Staff users can view own profile or admins can view all"
  on public.staff_users
  for select
  using (
    auth_id = auth.uid()
    or public.is_current_user_admin()
  );

create policy "Staff users can update own profile or admins can update all"
  on public.staff_users
  for update
  using (
    auth_id = auth.uid()
    or public.is_current_user_admin()
  )
  with check (
    auth_id = auth.uid()
    or public.is_current_user_admin()
  );

create policy "Only admins can create staff profiles"
  on public.staff_users
  for insert
  with check (public.is_current_user_admin());

create policy "Only admins can delete staff profiles"
  on public.staff_users
  for delete
  using (public.is_current_user_admin());
