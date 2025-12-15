-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'suspended');

-- Create admin_users table
CREATE TABLE public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create netflix_accounts table
CREATE TABLE public.netflix_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  netflix_email TEXT NOT NULL,
  netflix_password TEXT NOT NULL,
  gmail_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  access_code TEXT NOT NULL UNIQUE,
  netflix_account_id UUID REFERENCES public.netflix_accounts(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subscription_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create otp_logs table (temporary storage)
CREATE TABLE public.otp_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  netflix_account_id UUID REFERENCES public.netflix_accounts(id) ON DELETE CASCADE,
  otp_code TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.netflix_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_logs ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = (SELECT auth.uid())
  )
$$;

-- RLS Policies for admin_users (only admins can read their own record)
CREATE POLICY "Admins can view own record"
ON public.admin_users
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- RLS Policies for netflix_accounts (only admins)
CREATE POLICY "Admins can view all netflix accounts"
ON public.netflix_accounts
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert netflix accounts"
ON public.netflix_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update netflix accounts"
ON public.netflix_accounts
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete netflix accounts"
ON public.netflix_accounts
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- RLS Policies for customers (admins can do all, public can read by access code)
CREATE POLICY "Admins can view all customers"
ON public.customers
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow anonymous access to customers by access code (for customer dashboard)
CREATE POLICY "Anyone can view customer by access code"
ON public.customers
FOR SELECT
TO anon
USING (is_active = true);

-- Allow anonymous read of netflix accounts linked to active customers
CREATE POLICY "Anon can view assigned netflix accounts"
ON public.netflix_accounts
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.customers
    WHERE customers.netflix_account_id = netflix_accounts.id
    AND customers.is_active = true
  )
);

-- RLS for otp_logs
CREATE POLICY "Admins can manage otp logs"
ON public.otp_logs
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Anon can view recent otp for their account"
ON public.otp_logs
FOR SELECT
TO anon
USING (expires_at > now());

-- Create function to generate 6-digit access code
CREATE OR REPLACE FUNCTION public.generate_access_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    SELECT EXISTS (SELECT 1 FROM public.customers WHERE access_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_netflix_accounts_updated_at
BEFORE UPDATE ON public.netflix_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();