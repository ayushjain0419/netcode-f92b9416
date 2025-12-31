import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, CreditCard, CheckCircle, AlertCircle, Calendar, RotateCw, Clock, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, addDays, format } from "date-fns";

interface Stats {
  totalAccounts: number;
  totalCustomers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
}

interface DurationStats {
  days30Plus: number;
  days60Plus: number;
  days90Plus: number;
  days180Plus: number;
  days365Plus: number;
}

interface RotationCustomer {
  name: string;
  daysLeft: number;
  subscriptionDays: number;
}

interface OverviewTabProps {
  onDurationClick?: (days: number) => void;
}

const OverviewTab = ({ onDurationClick }: OverviewTabProps) => {
  const [stats, setStats] = useState<Stats>({
    totalAccounts: 0,
    totalCustomers: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0
  });
  const [durationStats, setDurationStats] = useState<DurationStats>({
    days30Plus: 0,
    days60Plus: 0,
    days90Plus: 0,
    days180Plus: 0,
    days365Plus: 0
  });
  const [rotationCustomers, setRotationCustomers] = useState<RotationCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const runDeactivation = async () => {
    setIsDeactivating(true);
    try {
      // Get all active customers
      const { data: customers, error: fetchError } = await supabase
        .from("customers")
        .select("id, name, purchase_date, subscription_days")
        .eq("is_active", true);

      if (fetchError) throw fetchError;

      // Filter expired customers
      const now = new Date();
      const expiredCustomers = (customers || []).filter((customer) => {
        const purchaseDate = new Date(customer.purchase_date);
        const endDate = new Date(purchaseDate);
        endDate.setDate(endDate.getDate() + customer.subscription_days);
        return endDate <= now;
      });

      if (expiredCustomers.length === 0) {
        toast.info("No expired subscriptions found");
        return;
      }

      // Deactivate expired customers and free up their slots
      const idsToDeactivate = expiredCustomers.map((c) => c.id);
      const { error: updateError } = await supabase
        .from("customers")
        .update({ is_active: false, netflix_account_id: null, profile_number: null })
        .in("id", idsToDeactivate);

      if (updateError) throw updateError;

      toast.success(`Deactivated ${expiredCustomers.length} expired subscription(s)`);
      fetchStats(); // Refresh stats
    } catch (error) {
      console.error("Error running deactivation:", error);
      toast.error("Failed to run deactivation");
    } finally {
      setIsDeactivating(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch Netflix accounts count
      const { count: accountsCount } = await supabase
        .from("netflix_accounts")
        .select("*", { count: "exact", head: true });

      // Fetch all customers with subscription info
      const { data: customers } = await supabase
        .from("customers")
        .select("name, purchase_date, subscription_days, is_active");

      const now = new Date();
      let activeCount = 0;
      let expiredCount = 0;
      
      // Duration-based counts
      let days30Plus = 0;
      let days60Plus = 0;
      let days90Plus = 0;
      let days180Plus = 0;
      let days365Plus = 0;
      
      // Rotation tracking - customers with 30+ day plans approaching renewal
      const needsRotation: RotationCustomer[] = [];

      customers?.forEach(customer => {
        const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
        const daysRemaining = differenceInDays(endDate, now);
        
        if (customer.is_active && daysRemaining > 0) {
          activeCount++;
        } else {
          expiredCount++;
        }
        
        // Count by subscription duration (active customers only)
        if (customer.is_active && daysRemaining > 0) {
          if (customer.subscription_days >= 30) days30Plus++;
          if (customer.subscription_days >= 60) days60Plus++;
          if (customer.subscription_days >= 90) days90Plus++;
          if (customer.subscription_days >= 180) days180Plus++;
          if (customer.subscription_days >= 365) days365Plus++;
          
          // Check if 30+ day subscriber needs rotation (within 7 days of monthly cycle)
          // Monthly rotation happens every 30 days from purchase
          if (customer.subscription_days >= 30) {
            const daysSincePurchase = differenceInDays(now, new Date(customer.purchase_date));
            const daysIntoCurrentMonth = daysSincePurchase % 30;
            const daysUntilNextRotation = 30 - daysIntoCurrentMonth;
            
            if (daysUntilNextRotation <= 7 && daysRemaining > 0) {
              needsRotation.push({
                name: customer.name,
                daysLeft: daysUntilNextRotation,
                subscriptionDays: customer.subscription_days
              });
            }
          }
        }
      });

      // Sort by days until rotation
      needsRotation.sort((a, b) => a.daysLeft - b.daysLeft);

      setStats({
        totalAccounts: accountsCount || 0,
        totalCustomers: customers?.length || 0,
        activeSubscriptions: activeCount,
        expiredSubscriptions: expiredCount
      });
      
      setDurationStats({
        days30Plus,
        days60Plus,
        days90Plus,
        days180Plus,
        days365Plus
      });
      
      setRotationCustomers(needsRotation);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    {
      title: "Netflix Accounts",
      value: stats.totalAccounts,
      icon: CreditCard,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      title: "Active Subscriptions",
      value: stats.activeSubscriptions,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      title: "Expired/Inactive",
      value: stats.expiredSubscriptions,
      icon: AlertCircle,
      color: "text-warning",
      bgColor: "bg-warning/10"
    }
  ];

  const durationCards = [
    { title: "30+ Days", value: durationStats.days30Plus, description: "Monthly subscribers", days: 30 },
    { title: "60+ Days", value: durationStats.days60Plus, description: "2-month plans", days: 60 },
    { title: "90+ Days", value: durationStats.days90Plus, description: "Quarterly plans", days: 90 },
    { title: "180+ Days", value: durationStats.days180Plus, description: "Half-yearly plans", days: 180 },
    { title: "365+ Days", value: durationStats.days365Plus, description: "Annual subscribers", days: 365 }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-wide text-foreground">Dashboard Overview</h2>
        <p className="text-muted-foreground mt-1">Monitor your subscription management at a glance</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={stat.title} className="glass animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {isLoading ? "..." : stat.value}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account Rotation Alert */}
      {rotationCustomers.length > 0 && (
        <Card className="glass border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="font-display text-xl tracking-wide flex items-center gap-2 text-warning">
              <RotateCw className="w-5 h-5" />
              Account Rotation Needed ({rotationCustomers.length})
            </CardTitle>
            <CardDescription>
              30+ day subscribers approaching their monthly account rotation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rotationCustomers.slice(0, 6).map((customer, index) => (
                <div 
                  key={index}
                  className="bg-background/50 rounded-lg p-3 border border-border/50 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{customer.subscriptionDays} day plan</p>
                  </div>
                  <div className="flex items-center gap-1 text-warning">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {customer.daysLeft === 0 ? "Today" : `${customer.daysLeft}d`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {rotationCustomers.length > 6 && (
              <p className="text-sm text-muted-foreground mt-3 text-center">
                +{rotationCustomers.length - 6} more customers need rotation
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription Duration Stats */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-wide flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Subscription Duration Breakdown
          </CardTitle>
          <CardDescription>Active customers grouped by subscription length (click to filter)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {durationCards.map((item, index) => (
              <div 
                key={item.title} 
                className="bg-muted/30 rounded-lg p-4 border border-border/50 text-center animate-slide-up cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-all"
                style={{ animationDelay: `${index * 0.1}s` }}
                onClick={() => onDurationClick?.(item.days)}
              >
                <p className="text-3xl font-bold text-primary">{isLoading ? "..." : item.value}</p>
                <p className="font-medium text-foreground mt-1">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-wide">Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <h3 className="font-medium text-foreground mb-1">Add Netflix Account</h3>
              <p className="text-sm text-muted-foreground">
                Go to "Netflix Accounts" tab to add a new streaming account
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <h3 className="font-medium text-foreground mb-1">Create Customer</h3>
              <p className="text-sm text-muted-foreground">
                Go to "Customers" tab to add a new customer with access code
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <h3 className="font-medium text-foreground mb-1">Run Deactivation</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Manually deactivate all expired subscriptions and free up their slots
              </p>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={runDeactivation}
                disabled={isDeactivating}
              >
                {isDeactivating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Run Deactivation
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
