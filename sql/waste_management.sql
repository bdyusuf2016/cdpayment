create extension if not exists "uuid-ossp";

create table if not exists public.waste_companies (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  phone text,
  address text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.waste_records (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  company_id uuid references public.waste_companies(id) on delete restrict,
  company_name text not null,
  car_type text default 'Wastage & Garbage' check (car_type in ('Wastage & Garbage', 'Garbage Only', 'Wastage Only')),
  garbage_trips integer default 0,
  wastage_trips integer default 0,
  total_trips integer default 0,
  rate_per_trip numeric default 0,
  amount numeric default 0,
  received numeric default 0,
  due numeric default 0,
  payment_method text,
  notes text,
  status text check (status in ('Paid', 'Partial', 'Unpaid')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.waste_records
  add column if not exists car_type text default 'Wastage & Garbage';

alter table public.waste_companies enable row level security;
alter table public.waste_records enable row level security;

drop policy if exists "Waste companies owner or admin select" on public.waste_companies;
create policy "Waste companies owner or admin select"
  on public.waste_companies
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

drop policy if exists "Waste companies owner or admin insert" on public.waste_companies;
create policy "Waste companies owner or admin insert"
  on public.waste_companies
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

drop policy if exists "Waste companies owner or admin update" on public.waste_companies;
create policy "Waste companies owner or admin update"
  on public.waste_companies
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  );

drop policy if exists "Waste companies owner or admin delete" on public.waste_companies;
create policy "Waste companies owner or admin delete"
  on public.waste_companies
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

drop policy if exists "Waste records owner or admin select" on public.waste_records;
create policy "Waste records owner or admin select"
  on public.waste_records
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

drop policy if exists "Waste records owner or admin insert" on public.waste_records;
create policy "Waste records owner or admin insert"
  on public.waste_records
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

drop policy if exists "Waste records owner or admin update" on public.waste_records;
create policy "Waste records owner or admin update"
  on public.waste_records
  for update
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  )
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_edit')
  );

drop policy if exists "Waste records owner or admin delete" on public.waste_records;
create policy "Waste records owner or admin delete"
  on public.waste_records
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );
