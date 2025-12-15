-- =============================================
-- SECURITY FIX: Tighten RLS policies and remove unrestricted insert
-- =============================================

-- 1. Drop existing vulnerable policies
DROP POLICY IF EXISTS "Customers can view own record by access code" ON public.customers;
DROP POLICY IF EXISTS "Customers can view their assigned netflix account via access co" ON public.netflix_accounts;
DROP POLICY IF EXISTS "Customers can view OTP for their assigned account" ON public.otp_logs;
DROP POLICY IF EXISTS "Edge function can insert otp logs" ON public.otp_logs;

-- 2. Create improved PERMISSIVE policy for customers table
-- Only admins can view all customers (no anonymous access for enumeration)
CREATE POLICY "Customers can view own record by access code"
ON public.customers
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- 3. Create improved PERMISSIVE policy for netflix_accounts
-- Only admins can view netflix accounts directly (customers access via RPC)
CREATE POLICY "Customers can view their assigned netflix account via access co"
ON public.netflix_accounts
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- 4. Create improved PERMISSIVE policy for otp_logs
-- Only admins can view OTP logs directly (customers access via RPC)
CREATE POLICY "Customers can view OTP for their assigned account"
ON public.otp_logs
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- 5. NO public insert policy for otp_logs - only service role (Edge Functions) can insert
-- Edge functions use service_role key which bypasses RLS

-- 6. Create a secure RPC function for customers to get their own data
CREATE OR REPLACE FUNCTION public.get_customer_data_by_access_code(p_access_code text)
RETURNS TABLE(
  id uuid,
  name text,
  access_code text,
  purchase_date date,
  subscription_days integer,
  is_active boolean,
  profile_number integer,
  purchased_from text,
  netflix_email text,
  netflix_password text,
  netflix_account_id uuid,
  gmail_address text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate input: must be exactly 6 digits
  IF p_access_code IS NULL OR length(p_access_code) != 6 OR p_access_code !~ '^[0-9]{6}$' THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.access_code,
    c.purchase_date,
    c.subscription_days,
    c.is_active,
    c.profile_number,
    c.purchased_from,
    na.netflix_email,
    na.netflix_password,
    c.netflix_account_id,
    na.gmail_address
  FROM customers c
  LEFT JOIN netflix_accounts na ON c.netflix_account_id = na.id
  WHERE c.access_code = p_access_code AND c.is_active = true
  LIMIT 1;
END;
$$;

-- 7. Create secure RPC function for customers to get their OTP
CREATE OR REPLACE FUNCTION public.get_otp_by_access_code(p_access_code text)
RETURNS TABLE(
  otp_code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_netflix_account_id uuid;
BEGIN
  -- Validate input: must be exactly 6 digits
  IF p_access_code IS NULL OR length(p_access_code) != 6 OR p_access_code !~ '^[0-9]{6}$' THEN
    RETURN;
  END IF;
  
  -- Get the netflix_account_id for this access code
  SELECT c.netflix_account_id INTO v_netflix_account_id
  FROM customers c
  WHERE c.access_code = p_access_code AND c.is_active = true
  LIMIT 1;
  
  IF v_netflix_account_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return the most recent non-expired OTP for this account
  RETURN QUERY
  SELECT o.otp_code, o.expires_at
  FROM otp_logs o
  WHERE o.netflix_account_id = v_netflix_account_id
    AND o.expires_at > now()
  ORDER BY o.fetched_at DESC
  LIMIT 1;
END;
$$;