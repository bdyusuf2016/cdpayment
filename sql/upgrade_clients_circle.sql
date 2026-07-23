-- Migration script to add circle column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS circle text;
