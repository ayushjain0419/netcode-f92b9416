// ============================================
// CUSTOMER DASHBOARD
// Displays customer's Netflix account details, subscription status,
// and household verification functionality
// ============================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Tv, 
  Mail, 
  Lock, 
  Calendar, 
  Clock, 
  Home, 
  LogOut, 
  Copy, 
  Eye, 
  EyeOff,
  RefreshCw,
  AlertCircle,
  User
} from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";

// ============================================
// INTERFACES
// ============================================

interface CustomerData {
  id: string;
  name: string;
  access_code: string;
  purchase_date: string;
  subscription_days: number;
  is_active: boolean;
  profile_number: number | null;
  purchased_from: string | null;
  netflix_accounts: {
    id: string;
    netflix_email: string;
    netflix_password: string;
    gmail_address: string | null;
  } | null;
}

// Inactivity timeout in minutes for customer sessions
const INACTIVITY_TIMEOUT_MINUTES = 15;

// ============================================
// COMPONENT
// ============================================

const CustomerDashboard = () => {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [isFetchingOtp, setIsFetchingOtp] = useState(false);
  const navigate = useNavigate();

  // ============================================
  // LOGOUT & INACTIVITY TIMEOUT
  // ============================================

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("customerAccessCode");
    navigate("/");
  }, [navigate]);

  // Auto-logout after inactivity
  useInactivityTimeout({
    timeoutMinutes: INACTIVITY_TIMEOUT_MINUTES,
    onTimeout: handleLogout,
    enabled: true,
  });

  // ============================================
  // DATA FETCHING & SUBSCRIPTION CHECK
  // ============================================

  useEffect(() => {
    const accessCode = sessionStorage.getItem("customerAccessCode");
    if (!accessCode) {
      navigate("/");
      return;
    }

    fetchCustomerData(accessCode);
  }, [navigate]);

  const fetchCustomerData = async (accessCode: string) => {
    try {
      // Use secure RPC function that validates access code server-side
      const { data, error } = await supabase.rpc("get_customer_data_by_access_code", {
        p_access_code: accessCode,
      });

      if (error) throw error;

      // RPC returns an array, get the first row
      const customerRow = Array.isArray(data) ? data[0] : data;

      if (!customerRow) {
        sessionStorage.removeItem("customerAccessCode");
        navigate("/");
        return;
      }

      // Transform the flat RPC response into the expected nested structure
      const customerData: CustomerData = {
        id: customerRow.id,
        name: customerRow.name,
        access_code: customerRow.access_code,
        purchase_date: customerRow.purchase_date,
        subscription_days: customerRow.subscription_days,
        is_active: customerRow.is_active,
        profile_number: customerRow.profile_number,
        purchased_from: customerRow.purchased_from,
        netflix_accounts: customerRow.netflix_account_id
          ? {
              id: customerRow.netflix_account_id,
              netflix_email: customerRow.netflix_email,
              netflix_password: customerRow.netflix_password,
              gmail_address: customerRow.gmail_address,
            }
          : null,
      };

      // Check if subscription is expired and auto-deactivate
      const endDate = addDays(new Date(customerData.purchase_date), customerData.subscription_days);
      const isExpiredCheck = differenceInDays(endDate, new Date()) <= 0;

      if (isExpiredCheck) {
        // Mark as expired for display (the server won't return this if deactivated)
        setCustomer({ ...customerData, is_active: false });
      } else {
        setCustomer(customerData);
      }
    } catch (error) {
      console.error("Error fetching customer data:", error);
      toast.error("Failed to load account details");
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const fetchHouseholdVerification = async () => {
    if (!customer?.netflix_accounts?.id) {
      toast.error("No Netflix account linked");
      return;
    }

    const gmailAddress = customer.netflix_accounts.gmail_address;
    
    if (!gmailAddress) {
      toast.info("No Gmail linked to this account. Contact your admin for the verification link.");
      return;
    }

    const storedAccessCode = sessionStorage.getItem("customerAccessCode");
    if (!storedAccessCode) {
      toast.error("Session expired. Please log in again.");
      navigate("/");
      return;
    }

    setIsFetchingOtp(true);
    setVerificationLink(null);
    setOtpCode(null);
    
    try {
      // Call external Supabase edge function
      const EXTERNAL_SUPABASE_URL = "https://sxievqswvpotqdpjreyd.supabase.co";
      const EXTERNAL_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4aWV2cXN3dnBvdHFkcGpyZXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NjMwNzIsImV4cCI6MjA4MjMzOTA3Mn0.F2sD3mMJHc-yaB2oica2Jq73mkN4jY7yyv8es59irzs";
      const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/fetch-netflix-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${EXTERNAL_ANON_KEY}`,
        },
        body: JSON.stringify({ access_code: storedAccessCode }),
      });

      const functionData = await response.json();

      if (!response.ok) {
        console.error("Edge function error:", functionData);
        toast.error("Could not fetch verification. Please try again.");
        return;
      }

      if (functionData?.success) {
        if (functionData.verification_link) {
          setVerificationLink(functionData.verification_link);
          toast.success("Verification link retrieved! Click the button to get your code.");
        } else if (functionData.otp_code) {
          setOtpCode(functionData.otp_code);
          toast.success("Verification code retrieved successfully");
        }
      } else {
        toast.info(functionData?.message || "No recent verification email found. Request a code from Netflix first.");
      }
    } catch (error) {
      console.error("Error fetching verification:", error);
      toast.error("Failed to fetch verification");
    } finally {
      setIsFetchingOtp(false);
    }
  };

  // ============================================
  // LOADING & EMPTY STATES
  // ============================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl">Loading...</div>
      </div>
    );
  }

  if (!customer) return null;

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
  const daysRemaining = differenceInDays(endDate, new Date());
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
  const isExpired = daysRemaining <= 0 || !customer.is_active;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full py-6 px-8 border-b border-border">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-primary" />
            <span className="font-display text-2xl tracking-wider text-foreground">NETCODE</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-sm hidden sm:block">
              Welcome, <span className="text-foreground font-medium">{customer.name}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Exit
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Status Banner - Expired Subscription */}
        {isExpired ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-destructive text-sm font-medium">
                Subscription Expired
              </p>
              <p className="text-destructive/80 text-xs">
                Your subscription has expired. Please contact your provider to renew.
              </p>
            </div>
          </div>
        ) : isExpiringSoon ? (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
            <p className="text-warning text-sm">
              Your subscription expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}. Contact your provider to renew.
            </p>
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Account Details Card */}
          <Card className="glass animate-slide-up">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide flex items-center gap-2">
                <Tv className="w-5 h-5 text-primary" />
                Account Details
              </CardTitle>
              <CardDescription>Your Netflix account credentials</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Show expired message if subscription expired */}
              {isExpired ? (
                <div className="text-muted-foreground text-sm p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium text-foreground mb-1">Access Restricted</p>
                  <p>Your subscription has expired. Netflix credentials are hidden until you renew.</p>
                </div>
              ) : customer.netflix_accounts ? (
                <>
                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Mail className="w-3 h-3" />
                      Netflix Email
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-input px-3 py-2 rounded-md text-sm font-mono">
                        {customer.netflix_accounts.netflix_email}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(customer.netflix_accounts!.netflix_email, "Email")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Lock className="w-3 h-3" />
                      Netflix Password
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-input px-3 py-2 rounded-md text-sm font-mono">
                        {showPassword ? customer.netflix_accounts.netflix_password : "••••••••••"}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(customer.netflix_accounts!.netflix_password, "Password")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Profile Number */}
                  {customer.profile_number && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <User className="w-3 h-3" />
                        Profile Number
                      </label>
                      <div className="bg-input px-3 py-2 rounded-md text-sm font-medium">
                        Profile {customer.profile_number}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No Netflix account assigned yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Subscription Details Card */}
          <Card className="glass animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Subscription Status
              </CardTitle>
              <CardDescription>Your subscription timeline</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Purchased From */}
              {customer.purchased_from && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Purchased From
                  </label>
                  <p className="text-foreground font-medium">
                    {customer.purchased_from}
                  </p>
                </div>
              )}

              {/* Purchase Date */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Purchase Date
                </label>
                <p className="text-foreground font-medium">
                  {format(new Date(customer.purchase_date), "MMMM d, yyyy")}
                </p>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Subscription End Date
                </label>
                <p className="text-foreground font-medium">
                  {format(endDate, "MMMM d, yyyy")}
                </p>
              </div>

              {/* Days Remaining */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Days Remaining
                </label>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  isExpired 
                    ? "bg-destructive/10 text-destructive" 
                    : isExpiringSoon 
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                }`}>
                  {isExpired ? "Expired" : `${daysRemaining} days`}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Household Verification Card - Only show if not expired */}
        {!isExpired && (
          <Card className="glass animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide flex items-center gap-2">
                <Home className="w-5 h-5 text-primary" />
                Household Verification
              </CardTitle>
              <CardDescription>
                Use only if Netflix asks for household verification when logging in
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  If Netflix prompts you to verify your household, click the button below to get your verification link. You'll be redirected to Netflix to get your temporary access code.
                </p>
                
                <div className="flex flex-col gap-4">
                  <Button 
                    variant="netflix" 
                    onClick={fetchHouseholdVerification}
                    disabled={isFetchingOtp || !customer.netflix_accounts}
                  >
                    {isFetchingOtp ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <Home className="w-4 h-4" />
                        Get Verification Link
                      </>
                    )}
                  </Button>

                  {verificationLink && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Click the button below to open Netflix and get your temporary access code:
                      </p>
                      <Button
                        variant="default"
                        className="w-full sm:w-auto"
                        onClick={() => window.open(verificationLink, "_blank")}
                      >
                        <Tv className="w-4 h-4 mr-2" />
                        Open Netflix & Get Code
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Link expires in 15 minutes
                      </p>
                    </div>
                  )}

                  {otpCode && (
                    <div className="flex items-center gap-2">
                      <code className="bg-primary/10 border border-primary/30 text-primary px-4 py-2 rounded-lg text-2xl font-mono tracking-widest">
                        {otpCode}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(otpCode, "OTP code")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Note: You must first request a verification from Netflix by trying to log in. The link expires after 15 minutes.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default CustomerDashboard;
