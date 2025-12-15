import { useEffect, useState } from "react";
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
  AlertCircle
} from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";

interface CustomerData {
  id: string;
  name: string;
  access_code: string;
  purchase_date: string;
  subscription_days: number;
  netflix_accounts: {
    id: string;
    netflix_email: string;
    netflix_password: string;
    gmail_address: string | null;
  } | null;
}

const CustomerDashboard = () => {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [isFetchingOtp, setIsFetchingOtp] = useState(false);
  const navigate = useNavigate();

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
      const { data, error } = await supabase
        .from("customers")
        .select("*, netflix_accounts(*)")
        .eq("access_code", accessCode)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        sessionStorage.removeItem("customerAccessCode");
        navigate("/");
        return;
      }

      setCustomer(data);
    } catch (error) {
      console.error("Error fetching customer data:", error);
      toast.error("Failed to load account details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("customerAccessCode");
    navigate("/");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const fetchHouseholdOtp = async () => {
    if (!customer?.netflix_accounts?.id) {
      toast.error("No Netflix account linked");
      return;
    }

    const gmailAddress = customer.netflix_accounts.gmail_address;
    
    if (!gmailAddress) {
      // If no Gmail linked, check for cached OTP only
      try {
        const { data: otpData } = await supabase
          .from("otp_logs")
          .select("otp_code")
          .eq("netflix_account_id", customer.netflix_accounts.id)
          .gt("expires_at", new Date().toISOString())
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (otpData) {
          setOtpCode(otpData.otp_code);
          toast.success("Household code retrieved successfully");
        } else {
          toast.info("No Gmail linked to this account. Contact your admin for the verification code.");
        }
      } catch (error) {
        console.error("Error checking cached OTP:", error);
        toast.error("Failed to fetch household code");
      }
      return;
    }

    setIsFetchingOtp(true);
    
    try {
      // First, try to fetch fresh OTP from Gmail via edge function
      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "fetch-netflix-otp",
        {
          body: {
            gmail_address: gmailAddress,
            netflix_account_id: customer.netflix_accounts.id,
          },
        }
      );

      if (functionError) {
        console.error("Edge function error:", functionError);
        // Fall back to cached OTP
        const { data: otpData } = await supabase
          .from("otp_logs")
          .select("otp_code")
          .eq("netflix_account_id", customer.netflix_accounts.id)
          .gt("expires_at", new Date().toISOString())
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (otpData) {
          setOtpCode(otpData.otp_code);
          toast.success("Household code retrieved from cache");
        } else {
          toast.error("Could not fetch verification code. Please try again.");
        }
        return;
      }

      if (functionData?.success && functionData?.otp_code) {
        setOtpCode(functionData.otp_code);
        toast.success("Household code retrieved successfully");
      } else {
        toast.info(functionData?.message || "No recent verification code found in email.");
        setOtpCode(null);
      }
    } catch (error) {
      console.error("Error fetching OTP:", error);
      toast.error("Failed to fetch household code");
    } finally {
      setIsFetchingOtp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl">Loading...</div>
      </div>
    );
  }

  if (!customer) return null;

  const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
  const daysRemaining = differenceInDays(endDate, new Date());
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
  const isExpired = daysRemaining <= 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full py-6 px-8 border-b border-border">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-primary" />
            <span className="font-display text-2xl tracking-wider text-foreground">STREAMFLOW</span>
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
        {/* Status Banner */}
        {isExpired ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-destructive text-sm">
              Your subscription has expired. Please contact your provider to renew.
            </p>
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
              {customer.netflix_accounts ? (
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

        {/* Household Verification Card */}
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
                If Netflix prompts you to verify your household, click the button below to retrieve the latest verification code. This code is fetched from the account's linked email.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <Button 
                  variant="netflix" 
                  onClick={fetchHouseholdOtp}
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
                      Get Household Code
                    </>
                  )}
                </Button>

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
              Note: Verification codes expire after 10 minutes. If the code doesn't work, click the button again to fetch a new one.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CustomerDashboard;
