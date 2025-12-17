import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Tv, Key, ArrowRight } from "lucide-react";

const Index = () => {
  const [accessCode, setAccessCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (accessCode.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);
    
    try {
      // Call Lovable Cloud edge function directly (separate from external Supabase database)
      const LOVABLE_CLOUD_URL = "https://tlfrnykndmgiwurclnlg.supabase.co";
      const response = await fetch(`${LOVABLE_CLOUD_URL}/functions/v1/validate-access-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZnJueWtuZG1naXd1cmNsbmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NTI4ODYsImV4cCI6MjA4MTMyODg4Nn0.DUhGhKayjys-uvedGZl98kK58s8HpBQe2lTgSbc0-oI`,
        },
        body: JSON.stringify({ access_code: accessCode }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      if (data?.error) {
        if (data.retry_after) {
          toast.error(`Too many attempts. Please try again in ${Math.ceil(data.retry_after / 60)} minutes.`);
        } else {
          toast.error(data.error);
        }
        return;
      }

      if (!data?.success || !data?.customer) {
        toast.error("Invalid or inactive access code");
        return;
      }

      // Store code in session
      sessionStorage.setItem("customerAccessCode", accessCode);
      navigate("/dashboard");
    } catch (error) {
      console.error("Error validating code:", error);
      toast.error("Failed to validate access code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAccessCode(value);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full py-6 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-primary" />
            <span className="font-display text-2xl tracking-wider text-foreground">NETCODE</span>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => navigate("/admin/login")}
            className="text-muted-foreground hover:text-foreground"
          >
            <Shield className="w-4 h-4 mr-2" />
            Admin
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 animate-slide-up">
            <div className="space-y-4">
              <h1 className="font-display text-5xl md:text-7xl tracking-wide text-foreground leading-tight">
                ACCESS YOUR
                <br />
                <span className="text-gradient">STREAMING</span>
                <br />
                ACCOUNT
              </h1>
              <p className="text-muted-foreground text-lg max-w-md">
                Enter your 6-digit access code to view your subscription details and manage household verification.
              </p>
            </div>

            {/* Features */}
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm">Instant Access</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm">Secure & Private</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <span className="text-sm">OTP Support</span>
              </div>
            </div>
          </div>

          {/* Right Content - Access Code Form */}
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md glass animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-pulse-glow">
                  <Key className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="font-display text-3xl tracking-wide">Enter Access Code</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Your 6-digit code was provided by your subscription manager
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCodeSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="• • • • • •"
                      value={accessCode}
                      onChange={handleCodeChange}
                      className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-input border-border focus:border-primary focus:ring-primary"
                      maxLength={6}
                    />
                    <p className="text-xs text-center text-muted-foreground">
                      {accessCode.length}/6 digits
                    </p>
                  </div>

                  <Button 
                    type="submit" 
                    variant="netflix" 
                    size="lg" 
                    className="w-full"
                    disabled={accessCode.length !== 6 || isLoading}
                  >
                    {isLoading ? (
                      <span className="animate-pulse">Verifying...</span>
                    ) : (
                      <>
                        Access Dashboard
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-xs text-center text-muted-foreground">
                    Don't have a code? Contact your subscription provider.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
};

export default Index;
