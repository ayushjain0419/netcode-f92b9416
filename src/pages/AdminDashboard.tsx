import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Session } from "@supabase/supabase-js";
import { 
  Tv, 
  LogOut, 
  Users, 
  CreditCard, 
  Settings,
  ShieldCheck,
  Download,
} from "lucide-react";
import NetflixAccountsTab from "@/components/admin/NetflixAccountsTab";
import CustomersTab from "@/components/admin/CustomersTab";
import OverviewTab from "@/components/admin/OverviewTab";
import NotificationBell from "@/components/admin/NotificationBell";
import AdminManagementTab from "@/components/admin/AdminManagementTab";
import { useExcelBackup } from "@/hooks/useExcelBackup";

const AdminDashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [durationFilter, setDurationFilter] = useState<number | null>(null);
  const { exportToExcel, isExporting } = useExcelBackup();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate("/admin/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      
      if (!session) {
        navigate("/admin/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/admin/login");
  };

  const handleDurationClick = (days: number) => {
    setDurationFilter(days);
    setActiveTab("customers");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full py-4 px-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-primary" />
            <div>
              <span className="font-display text-xl tracking-wider text-foreground block">NETCODE</span>
              <span className="text-xs text-muted-foreground">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user.email}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToExcel}
              disabled={isExporting}
              className="hidden sm:flex"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting..." : "Backup"}
            </Button>
            <NotificationBell 
              onCustomerClick={() => {
                setActiveTab("customers");
              }} 
            />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); if (val !== "customers") setDurationFilter(null); }} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="accounts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="w-4 h-4 mr-2" />
              Netflix Accounts
            </TabsTrigger>
            <TabsTrigger value="customers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="w-4 h-4 mr-2" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="admins" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Admins
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="animate-fade-in">
            <OverviewTab onDurationClick={handleDurationClick} />
          </TabsContent>

          <TabsContent value="accounts" className="animate-fade-in">
            <NetflixAccountsTab />
          </TabsContent>

          <TabsContent value="customers" className="animate-fade-in">
            <CustomersTab durationFilter={durationFilter} onClearDurationFilter={() => setDurationFilter(null)} />
          </TabsContent>

          <TabsContent value="admins" className="animate-fade-in">
            <AdminManagementTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
