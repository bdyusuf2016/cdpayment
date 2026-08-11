
-- Enable UUID extension for unique IDs
create extension if not exists "uuid-ossp";

-- 1. Clients Table (Stores AIN and Client Info)
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  phone text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (owner_auth_id, ain)
);

-- 2. Duty Payments Table (Transaction History)
create table public.duty_payments (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  ain text,
  client_name text,
  phone text,
  be_year text,
  duty numeric default 0,
  received numeric default 0,
  status text check (status in ('Completed', 'Pending', 'Paid', 'New')),
  profit numeric default 0,
  payment_method text,
  r_no text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Assessment Billing Table (Service Bills)
create table public.assessments (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  ain text,
  client_name text,
  phone text,
  comments text,
  nos_of_be integer default 0,
  rate numeric default 0,
  amount numeric default 0,
  discount numeric default 0,
  net numeric default 0,
  received numeric default 0,
  status text check (status in ('Completed', 'Pending', 'Paid', 'New')),
  profit numeric default 0,
  payment_method text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Daily Clearance Tracker Table
create table public.clearance_records (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  total_clearance integer default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Waste Companies Table
create table public.waste_companies (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  phone text,
  address text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. Waste Records Table
create table public.waste_records (
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

-- 7. Audit Logs Table (Activity Tracking)
create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  timestamp text,
  user_name text,
  action text,
  module text,
  details text,
  type text check (type in ('info', 'warning', 'danger', 'success')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 8. Staff Users Table (Permissions & Access)
create table public.staff_users (
  id uuid default uuid_generate_v4() primary key, -- Matches auth.users id if possible
  auth_id uuid references auth.users(id), -- Link to Supabase Auth
  name text not null,
  role text default 'Staff',
  permissions jsonb default '{}'::jsonb,
  last_active text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9. System Settings Table (Global Config)
create table public.system_settings (
  id integer primary key generated always as identity,
  agency_name text default 'Customs Duty Pro Ltd.',
  agency_address text default 'Dhaka, Bangladesh',
  default_rate numeric default 100,
  auto_invoice boolean default true,
  currency text default 'BDT',
  theme text default 'light',
  language text default 'en',
  admin_global_data_access boolean default true,
  payment_methods jsonb default '["Cash", "Bank", "bKash", "Nagad"]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Insert Default Settings (One row only)
insert into public.system_settings (agency_name) values ('Customs Duty Pro Ltd.');

-- Enable Row Level Security (RLS)
alter table public.clients enable row level security;
alter table public.duty_payments enable row level security;
alter table public.assessments enable row level security;
alter table public.clearance_records enable row level security;
alter table public.waste_companies enable row level security;
alter table public.waste_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.staff_users enable row level security;
alter table public.system_settings enable row level security;

-- Helper: check whether current authenticated user is an active admin
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

create or replace function public.has_current_user_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_current_user_admin()
    or exists (
      select 1
      from public.staff_users su
      where su.auth_id = auth.uid()
        and coalesce(su.active, false) = true
        and coalesce((su.permissions ->> permission_key)::boolean, false) = true
    );
$$;

grant execute on function public.has_current_user_permission(text) to authenticated;

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

create or replace function public.has_current_user_bill_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.has_current_user_permission('bill_add')
    or public.has_current_user_permission('bill_edit')
    or public.has_current_user_permission('bill_delete')
    or public.has_current_user_permission('bill_bulk_pay')
    or public.has_current_user_permission('bill_export')
    or public.has_current_user_permission('bill_wa_share')
    or public.has_current_user_permission('invoice_print');
$$;

grant execute on function public.has_current_user_bill_access() to authenticated;

-- clients: owner can access own rows, admins can access all rows
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

-- duty_payments: owner can access own rows, admins can access all rows
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

-- assessments: owner can access own rows, admins can access all rows
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

-- clearance_records: owner can access own rows, admins can access all rows
create policy "Clearance owner or admin select"
  on public.clearance_records
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

create policy "Clearance owner or admin insert"
  on public.clearance_records
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

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

create policy "Clearance owner or admin delete"
  on public.clearance_records
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

-- waste_companies: owner can access own rows, admins can access all rows
create policy "Waste companies owner or admin select"
  on public.waste_companies
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

create policy "Waste companies owner or admin insert"
  on public.waste_companies
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

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

create policy "Waste companies owner or admin delete"
  on public.waste_companies
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

-- waste_records: owner can access own rows, admins can access all rows
create policy "Waste records owner or admin select"
  on public.waste_records
  for select
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_bill_access()
  );

create policy "Waste records owner or admin insert"
  on public.waste_records
  for insert
  with check (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_add')
  );

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

create policy "Waste records owner or admin delete"
  on public.waste_records
  for delete
  using (
    (owner_auth_id = auth.uid() or public.can_current_user_access_all_business_data())
    and public.has_current_user_permission('bill_delete')
  );

-- audit_logs: users see own logs; admins can see/manage all
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

-- Keep system settings shared
create policy "Enable all access for system_settings" on public.system_settings for all using (true);

-- staff_users: regular users can only read/update own profile; admins can manage all
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

-- Trigger: Automatically create staff_user when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.staff_users (auth_id, name, role, permissions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Staff'),
    'Staff',
    '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 10. Vendors Table (Stores Vendor Info)
create table if not exists public.vendors (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  vendor_name text not null,
  owner_name text,
  phone text,
  bin_no text,
  e_tin_no text,
  address text,
  notes text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.vendors enable row level security;

create policy "Vendors owner or admin select"
  on public.vendors for select
  using (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  );

create policy "Vendors owner or admin all"
  on public.vendors for all
  using (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  )
  with check (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  );

-- 11. AIN Tax Records Table (Stores AIN Tax Due / Arrears)
create table if not exists public.ain_tax_records (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  year text,
  ain_name text,
  ain_no text,
  ref text,
  reg_no text,
  date text,
  type text,
  total_tax numeric default 0,
  payment_status text default 'Unpaid' check (payment_status in ('Paid', 'Unpaid')),
  payment_date text,
  payment_method text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.ain_tax_records enable row level security;

drop policy if exists "AIN Tax Records owner or admin select" on public.ain_tax_records;
drop policy if exists "AIN Tax Records owner or admin all" on public.ain_tax_records;

create policy "AIN Tax Records owner or admin select"
  on public.ain_tax_records for select
  using (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  );

create policy "AIN Tax Records owner or admin all"
  on public.ain_tax_records for all
  using (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  )
  with check (
    owner_auth_id = auth.uid()
    or public.can_current_user_access_all_business_data()
  );

