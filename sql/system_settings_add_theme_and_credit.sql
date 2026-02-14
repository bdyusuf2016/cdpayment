alter table public.system_settings
  add column if not exists theme_template text default 'soft',
  add column if not exists developer_credit_name text default '',
  add column if not exists developer_credit_url text default '',
  add column if not exists show_developer_credit boolean default false;
