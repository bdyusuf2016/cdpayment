-- Backfill AIN add permission for existing non-admin User-role staff accounts.
-- Run this once in Supabase SQL editor if User role can open AIN Database but cannot save.

update public.staff_users
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('ain_add', true)
where role = 'User'
  and coalesce((permissions ->> 'ain_view')::boolean, false) = true
  and coalesce((permissions ->> 'ain_add')::boolean, false) = false;
