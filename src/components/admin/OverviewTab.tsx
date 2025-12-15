import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, CreditCard, CheckCircle, AlertCircle } from "lucide-react";
import { differenceInDays, addDays } from "date-fns";

interface Stats {
  totalAccounts: number;
  totalCustomers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
}

const OverviewTab = () => {
  const [stats, setStats] = useState<Stats>({
    totalAccounts: 0,
    totalCustomers: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0
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

      customers?.forEach(customer => {
        const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
        const daysRemaining = differenceInDays(endDate, now);
        
        if (customer.is_active && daysRemaining > 0) {
          activeCount++;
        } else {
          expiredCount++;
        }
      });

      setStats({
        totalAccounts: accountsCount || 0,
        totalCustomers: customers?.length || 0,
        activeSubscriptions: activeCount,
        expiredSubscriptions: expiredCount
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
              <h3 className="font-medium text-foreground mb-1">Manual OTP Entry</h3>
              <p className="text-sm text-muted-foreground">
                Use the OTP management in Netflix Accounts to add verification codes
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
