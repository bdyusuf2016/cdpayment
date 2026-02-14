
-- Enable UUID extension for unique IDs
create extension if not exists "uuid-ossp";

-- 1. Clients Table (Stores AIN and Client Info)
create table public.clients (
  ain text primary key,
  name text not null,
  phone text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Duty Payments Table (Transaction History)
create table public.duty_payments (
  id uuid default uuid_generate_v4() primary key,
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

-- Create Open Access Policies (Change these for production!)
create policy "Enable all access for clients" on public.clients for all using (true);
create policy "Enable all access for duty_payments" on public.duty_payments for all using (true);
create policy "Enable all access for assessments" on public.assessments for all using (true);
create policy "Enable all access for audit_logs" on public.audit_logs for all using (true);
create policy "Enable all access for staff_users" on public.staff_users for all using (true);
create policy "Enable all access for system_settings" on public.system_settings for all using (true);

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
