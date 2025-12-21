import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, CreditCard, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import { differenceInDays, addDays } from "date-fns";

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

const OverviewTab = () => {
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
  const [isLoading, setIsLoading] = useState(true);

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
        .select("purchase_date, subscription_days, is_active");

      const now = new Date();
      let activeCount = 0;
      let expiredCount = 0;
      
      // Duration-based counts
      let days30Plus = 0;
      let days60Plus = 0;
      let days90Plus = 0;
      let days180Plus = 0;
      let days365Plus = 0;

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
        }
      });

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
    { title: "30+ Days", value: durationStats.days30Plus, description: "Monthly subscribers" },
    { title: "60+ Days", value: durationStats.days60Plus, description: "2-month plans" },
    { title: "90+ Days", value: durationStats.days90Plus, description: "Quarterly plans" },
    { title: "180+ Days", value: durationStats.days180Plus, description: "Half-yearly plans" },
    { title: "365+ Days", value: durationStats.days365Plus, description: "Annual subscribers" }
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

      {/* Subscription Duration Stats */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-wide flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Subscription Duration Breakdown
          </CardTitle>
          <CardDescription>Active customers grouped by subscription length</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {durationCards.map((item, index) => (
              <div 
                key={item.title} 
                className="bg-muted/30 rounded-lg p-4 border border-border/50 text-center animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
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
              <h3 className="font-medium text-foreground mb-1">Bulk Actions</h3>
              <p className="text-sm text-muted-foreground">
                Use "Customers" tab to bulk update accounts, extend subscriptions, or deactivate
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
