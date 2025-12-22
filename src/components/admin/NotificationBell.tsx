import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, addDays, parseISO } from "date-fns";

interface Customer {
  id: string;
  name: string;
  subscription_days: number;
  purchase_date: string;
  is_active: boolean;
}

interface Notification {
  id: string;
  type: "rotation" | "expiring";
  customerName: string;
  message: string;
  daysLeft: number;
}

interface NotificationBellProps {
  onCustomerClick?: (customerId: string) => void;
}

const NotificationBell = ({ onCustomerClick }: NotificationBellProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    const { data: customers, error } = await supabase
      .from("customers")
      .select("*")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching customers for notifications:", error);
      return;
    }

    const today = new Date();
    const newNotifications: Notification[] = [];

    customers?.forEach((customer: Customer) => {
      const purchaseDate = parseISO(customer.purchase_date);
      const expiryDate = addDays(purchaseDate, customer.subscription_days);
      const daysUntilExpiry = differenceInDays(expiryDate, today);

      // For 30+ day subscribers, check if they're within 7 days of their monthly rotation
      if (customer.subscription_days >= 30) {
        const daysSincePurchase = differenceInDays(today, purchaseDate);
        const daysInCurrentMonth = daysSincePurchase % 30;
        const daysUntilRotation = 30 - daysInCurrentMonth;

        if (daysUntilRotation <= 7 && daysUntilRotation > 0) {
          newNotifications.push({
            id: `rotation-${customer.id}`,
            type: "rotation",
            customerName: customer.name,
            message: `Account rotation needed in ${daysUntilRotation} day${daysUntilRotation !== 1 ? "s" : ""}`,
            daysLeft: daysUntilRotation,
          });
        }
      }

      // Check for subscriptions expiring soon (within 7 days)
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        newNotifications.push({
          id: `expiring-${customer.id}`,
          type: "expiring",
          customerName: customer.name,
          message: `Subscription expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}`,
          daysLeft: daysUntilExpiry,
        });
      }
    });

    // Sort by urgency (days left ascending)
    newNotifications.sort((a, b) => a.daysLeft - b.daysLeft);
    setNotifications(newNotifications);
  };

  const getNotificationColor = (daysLeft: number) => {
    if (daysLeft <= 2) return "bg-destructive text-destructive-foreground";
    if (daysLeft <= 5) return "bg-yellow-500 text-white";
    return "bg-blue-500 text-white";
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border">
          <h4 className="font-semibold text-sm">Notifications</h4>
          <p className="text-xs text-muted-foreground">
            {notifications.length} alert{notifications.length !== 1 ? "s" : ""} requiring attention
          </p>
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    const customerId = notification.id.split("-").slice(1).join("-");
                    onCustomerClick?.(customerId);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Badge
                      className={`${getNotificationColor(notification.daysLeft)} shrink-0 mt-0.5`}
                    >
                      {notification.type === "rotation" ? "Rotation" : "Expiring"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {notification.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        {notifications.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                fetchNotifications();
              }}
            >
              Refresh notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
