-- Tighten staff_users access so one user cannot read another user's profile data.
-- Run this against an existing database.

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

drop policy if exists "Enable all access for staff_users" on public.staff_users;
drop policy if exists "Staff users can view own profile or admins can view all" on public.staff_users;
drop policy if exists "Staff users can update own profile or admins can update all" on public.staff_users;
drop policy if exists "Only admins can create staff profiles" on public.staff_users;
drop policy if exists "Only admins can delete staff profiles" on public.staff_users;

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
