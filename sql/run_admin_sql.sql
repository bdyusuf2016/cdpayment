create or replace function public.run_admin_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;

revoke all on function public.run_admin_sql(text) from public;
grant execute on function public.run_admin_sql(text) to service_role;
