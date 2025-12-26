-- Add selling_price column to customers table
ALTER TABLE public.customers 
ADD COLUMN selling_price numeric(10,2) DEFAULT 0;