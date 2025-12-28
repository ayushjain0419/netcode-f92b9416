-- Add optional phone_number column to netflix_accounts table
ALTER TABLE public.netflix_accounts 
ADD COLUMN phone_number text;