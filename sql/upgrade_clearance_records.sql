-- Migration script to upgrade clearance_records table to Assessment Record
ALTER TABLE public.clearance_records 
ADD COLUMN IF NOT EXISTS sl_no text,
ADD COLUMN IF NOT EXISTS client_name text,
ADD COLUMN IF NOT EXISTS assessable_value numeric default 0,
ADD COLUMN IF NOT EXISTS cd numeric default 0,
ADD COLUMN IF NOT EXISTS rd numeric default 0,
ADD COLUMN IF NOT EXISTS vat numeric default 0,
ADD COLUMN IF NOT EXISTS ait numeric default 0,
ADD COLUMN IF NOT EXISTS atv_at numeric default 0,
ADD COLUMN IF NOT EXISTS duty_tax numeric default 0,
ADD COLUMN IF NOT EXISTS trnx_id text,
ADD COLUMN IF NOT EXISTS payment_date text,
ADD COLUMN IF NOT EXISTS payment_status text default 'Unpaid',
ADD COLUMN IF NOT EXISTS circle text,
ADD COLUMN IF NOT EXISTS in_word text;
