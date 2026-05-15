-- Add a dedicated receive_date column so Duty Payment can keep
-- original Date and Payment Receive Date separately.

alter table public.duty_payments
  add column if not exists receive_date text;

-- Backfill existing paid rows where old implementation overwrote date with payment date.
update public.duty_payments
set receive_date = coalesce(receive_date, date)
where coalesce(status, '') = 'Paid'
  and coalesce(receive_date, '') = '';
