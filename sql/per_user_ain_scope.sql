-- Allow each authenticated user to maintain their own private AIN list.
-- This removes the old global-unique AIN rule and makes AIN unique per owner_auth_id.
--
-- Recommended order for older databases:
-- 1. Run sql/backfill_owner_auth_id.sql if you still have legacy rows with null owner_auth_id.
-- 2. Run this script.
-- 3. Re-login and test with a User account.

create extension if not exists "uuid-ossp";

alter table public.clients add column if not exists id uuid default uuid_generate_v4();

update public.clients
set id = uuid_generate_v4()
where id is null;

alter table public.clients
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'clients'
      and constraint_name = 'clients_pkey'
  ) then
    alter table public.clients drop constraint clients_pkey;
  end if;
end $$;

alter table public.clients
  add constraint clients_pkey primary key (id);

alter table public.clients
  drop constraint if exists clients_owner_auth_id_ain_key;

alter table public.clients
  add constraint clients_owner_auth_id_ain_key unique (owner_auth_id, ain);

alter table public.duty_payments
  drop constraint if exists duty_payments_ain_fkey;

alter table public.assessments
  drop constraint if exists assessments_ain_fkey;

alter table public.duty_payments
  drop constraint if exists duty_payments_owner_auth_id_ain_fkey;

alter table public.assessments
  drop constraint if exists assessments_owner_auth_id_ain_fkey;

alter table public.duty_payments
  add constraint duty_payments_owner_auth_id_ain_fkey
  foreign key (owner_auth_id, ain)
  references public.clients (owner_auth_id, ain)
  on delete set null;

alter table public.assessments
  add constraint assessments_owner_auth_id_ain_fkey
  foreign key (owner_auth_id, ain)
  references public.clients (owner_auth_id, ain)
  on delete set null;
