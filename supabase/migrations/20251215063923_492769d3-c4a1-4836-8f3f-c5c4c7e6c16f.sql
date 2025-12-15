-- Add profile_number column to customers table (1-5 for Netflix profiles)
ALTER TABLE public.customers 
ADD COLUMN profile_number integer DEFAULT NULL;

-- Add check constraint for valid profile numbers (1-5)
ALTER TABLE public.customers 
ADD CONSTRAINT valid_profile_number CHECK (profile_number IS NULL OR (profile_number >= 1 AND profile_number <= 5));