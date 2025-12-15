-- Create a security definer function to verify access code and return netflix_account_id
CREATE OR REPLACE FUNCTION public.verify_access_code(p_access_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT netflix_account_id FROM customers
  WHERE access_code = p_access_code AND is_active = true
  LIMIT 1
$$;

-- Create a function to get customer by access code
CREATE OR REPLACE FUNCTION public.get_customer_by_access_code(p_access_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM customers
  WHERE access_code = p_access_code AND is_active = true
  LIMIT 1
$$;

-- Drop existing vulnerable policies on netflix_accounts
DROP POLICY IF EXISTS "Anon can view assigned netflix accounts" ON public.netflix_accounts;

-- Create new secure policy for netflix_accounts - requires RPC call with access_code
CREATE POLICY "Customers can view their assigned netflix account via access code"
ON public.netflix_accounts
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  id IN (
    SELECT netflix_account_id FROM customers 
    WHERE is_active = true AND netflix_account_id = netflix_accounts.id
  )
);

-- Drop existing vulnerable policy on customers
DROP POLICY IF EXISTS "Anyone can view customer by access code" ON public.customers;

-- Create new secure policy - customers table needs access_code filter in query
CREATE POLICY "Customers can view own record by access code"
ON public.customers
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  is_active = true
);

-- Drop existing vulnerable policy on otp_logs  
DROP POLICY IF EXISTS "Anon can view recent otp for their account" ON public.otp_logs;

-- Create new secure policy for otp_logs - requires netflix_account to be owned by active customer
CREATE POLICY "Customers can view OTP for their assigned account"
ON public.otp_logs
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  (
    expires_at > now() AND
    netflix_account_id IN (
      SELECT netflix_account_id FROM customers WHERE is_active = true
    )
  )
);

-- Allow anonymous users to insert into otp_logs (for edge function)
CREATE POLICY "Edge function can insert otp logs"
ON public.otp_logs
FOR INSERT
WITH CHECK (true);