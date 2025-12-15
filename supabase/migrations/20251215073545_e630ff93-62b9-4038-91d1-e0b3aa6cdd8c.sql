-- Add purchased_from column to customers table
ALTER TABLE public.customers 
ADD COLUMN purchased_from text;