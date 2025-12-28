-- Make netflix_email nullable since phone_number can be used instead
ALTER TABLE public.netflix_accounts 
ALTER COLUMN netflix_email DROP NOT NULL;