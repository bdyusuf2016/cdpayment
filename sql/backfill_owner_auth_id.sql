-- Backfill owner_auth_id for legacy rows after enabling tenant isolation RLS.
-- Steps:
-- 1) Replace FALLBACK_OWNER_AUTH_ID with a real auth.users.id (typically a super admin).
-- 2) Run this script once.

-- ====== Fallback owner UUID ======
-- Set to an admin auth.users.id. Currently set to:
-- 26c0175a-6fd4-45ba-a2ac-24e3e6444e88

-- Use the same fallback owner value in this CTE.
with params as (
  select '26c0175a-6fd4-45ba-a2ac-24e3e6444e88'::uuid as fallback_owner_auth_id
),
email_map as (
  select id as auth_id, lower(email) as email
  from auth.users
  where email is not null
)
-- 1) Backfill audit logs by matching user_name to auth.users.email
update public.audit_logs l
set owner_auth_id = m.auth_id
from email_map m
where l.owner_auth_id is null
  and lower(coalesce(l.user_name, '')) = m.email;

-- 2) Backfill payments/assessments from related client owner (if already set)
update public.duty_payments d
set owner_auth_id = c.owner_auth_id
from public.clients c
where d.owner_auth_id is null
  and d.ain = c.ain
  and c.owner_auth_id is not null;

update public.assessments a
set owner_auth_id = c.owner_auth_id
from public.clients c
where a.owner_auth_id is null
  and a.ain = c.ain
  and c.owner_auth_id is not null;

-- 3) Infer client owner from related duty/assessment rows
with inferred_owner as (
  select
    x.ain,
    (array_agg(x.owner_auth_id order by x.owner_auth_id))[1] as owner_auth_id
  from (
    select ain, owner_auth_id
    from public.duty_payments
    where owner_auth_id is not null
    union all
    select ain, owner_auth_id
    from public.assessments
    where owner_auth_id is not null
  ) x
  group by x.ain
)
update public.clients c
set owner_auth_id = i.owner_auth_id
from inferred_owner i
where c.owner_auth_id is null
  and c.ain = i.ain;

-- 4) Final fallback: assign remaining null owners to fallback owner
with params as (
  select '26c0175a-6fd4-45ba-a2ac-24e3e6444e88'::uuid as fallback_owner_auth_id
)
update public.clients
set owner_auth_id = (select fallback_owner_auth_id from params)
where owner_auth_id is null;

with params as (
  select '26c0175a-6fd4-45ba-a2ac-24e3e6444e88'::uuid as fallback_owner_auth_id
)
update public.duty_payments
set owner_auth_id = (select fallback_owner_auth_id from params)
where owner_auth_id is null;

with params as (
  select '26c0175a-6fd4-45ba-a2ac-24e3e6444e88'::uuid as fallback_owner_auth_id
)
update public.assessments
set owner_auth_id = (select fallback_owner_auth_id from params)
where owner_auth_id is null;

with params as (
  select '26c0175a-6fd4-45ba-a2ac-24e3e6444e88'::uuid as fallback_owner_auth_id
)
update public.audit_logs
set owner_auth_id = (select fallback_owner_auth_id from params)
where owner_auth_id is null;


