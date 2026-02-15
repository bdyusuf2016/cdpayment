
-- Enable UUID extension for unique IDs
create extension if not exists "uuid-ossp";

-- 1. Clients Table (Stores AIN and Client Info)
create table public.clients (
  ain text primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  phone text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Duty Payments Table (Transaction History)
create table public.duty_payments (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  ain text references public.clients(ain) on delete set null,
  client_name text,
  phone text,
  be_year text,
  duty numeric default 0,
  received numeric default 0,
  status text check (status in ('Completed', 'Pending', 'Paid', 'New')),
  profit numeric default 0,
  payment_method text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Assessment Billing Table (Service Bills)
create table public.assessments (
  id uuid default uuid_generate_v4() primary key,
  owner_auth_id uuid references auth.users(id) default auth.uid(),
  date text not null,
  ain text references public.clients(ain) on delete set null,
  client_name text,
  phone text,
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

-- 4. Audit Logs Table (Activity Tracking)
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

-- 5. Staff Users Table (Permissions & Access)
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

-- 6. System Settings Table (Global Config)
create table public.system_settings (
  id integer primary key generated always as identity,
  agency_name text default 'Customs Duty Pro Ltd.',
  agency_address text default 'Dhaka, Bangladesh',
  default_rate numeric default 100,
  auto_invoice boolean default true,
  currency text default 'BDT',
  theme text default 'light',
  language text default 'en',
  payment_methods jsonb default '["Cash", "Bank", "bKash", "Nagad"]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Insert Default Settings (One row only)
insert into public.system_settings (agency_name) values ('Customs Duty Pro Ltd.');

-- Enable Row Level Security (RLS)
alter table public.clients enable row level security;
alter table public.duty_payments enable row level security;
alter table public.assessments enable row level security;
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

-- clients: owner can access own rows, admins can access all rows
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

-- duty_payments: owner can access own rows, admins can access all rows
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

-- assessments: owner can access own rows, admins can access all rows
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

-- audit_logs: users see own logs; admins can see/manage all
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
