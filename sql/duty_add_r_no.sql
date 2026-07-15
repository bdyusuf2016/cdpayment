-- Add optional R No field to duty payments for completion dialog support
alter table public.duty_payments
  add column if not exists r_no text;
