create extension if not exists "uuid-ossp";

create table if not exists public.clearance_records (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  total_clearance integer default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.clearance_records enable row level security;

drop policy if exists "Clearance owner or admin select" on public.clearance_records;
create policy "Clearance owner or admin select"
  on public.clearance_records
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

drop policy if exists "Clearance owner or admin insert" on public.clearance_records;
create policy "Clearance owner or admin insert"
  on public.clearance_records
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

drop policy if exists "Clearance owner or admin update" on public.clearance_records;
create policy "Clearance owner or admin update"
  on public.clearance_records
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  );

drop policy if exists "Clearance owner or admin delete" on public.clearance_records;
create policy "Clearance owner or admin delete"
  on public.clearance_records
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );
