-- Add new columns to netflix_accounts table
ALTER TABLE public.netflix_accounts 
ADD COLUMN account_created_date date,
ADD COLUMN payment_account text;