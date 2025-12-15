import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Copy, RefreshCw, User } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";

interface NetflixAccount {
  id: string;
  netflix_email: string;
}

interface Customer {
  id: string;
  name: string;
  access_code: string;
  netflix_account_id: string | null;
  purchase_date: string;
  subscription_days: number;
  is_active: boolean;
  netflix_accounts: NetflixAccount | null;
}

const CustomersTab = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<NetflixAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    netflix_account_id: "",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    subscription_days: "30",
    is_active: true
  });

  useEffect(() => {
    fetchCustomers();
    fetchAccounts();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*, netflix_accounts(id, netflix_email)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("netflix_accounts")
        .select("id, netflix_email");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const generateAccessCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Customer name is required");
      return;
    }

    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from("customers")
          .update({
            name: formData.name,
            netflix_account_id: formData.netflix_account_id || null,
            purchase_date: formData.purchase_date,
            subscription_days: parseInt(formData.subscription_days),
            is_active: formData.is_active
          })
          .eq("id", editingCustomer.id);

        if (error) throw error;
        toast.success("Customer updated successfully");
      } else {
        const accessCode = generateAccessCode();
        
        const { error } = await supabase
          .from("customers")
          .insert({
            name: formData.name,
            access_code: accessCode,
            netflix_account_id: formData.netflix_account_id || null,
            purchase_date: formData.purchase_date,
            subscription_days: parseInt(formData.subscription_days),
            is_active: formData.is_active
          });

        if (error) throw error;
        toast.success(`Customer created! Access code: ${accessCode}`);
      }

      setIsDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch (error: any) {
      console.error("Error saving customer:", error);
      toast.error(error.message || "Failed to save customer");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Customer deleted successfully");
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("Failed to delete customer");
    }
  };

  const regenerateCode = async (customerId: string) => {
    const newCode = generateAccessCode();
    
    try {
      const { error } = await supabase
        .from("customers")
        .update({ access_code: newCode })
        .eq("id", customerId);

      if (error) throw error;
      toast.success(`New access code: ${newCode}`);
      fetchCustomers();
    } catch (error) {
      console.error("Error regenerating code:", error);
      toast.error("Failed to regenerate code");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Access code copied to clipboard");
  };

  const resetForm = () => {
    setFormData({
      name: "",
      netflix_account_id: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      subscription_days: "30",
      is_active: true
    });
    setEditingCustomer(null);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      netflix_account_id: customer.netflix_account_id || "",
      purchase_date: customer.purchase_date,
      subscription_days: customer.subscription_days.toString(),
      is_active: customer.is_active
    });
    setIsDialogOpen(true);
  };

  const getStatus = (customer: Customer) => {
    const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
    const daysRemaining = differenceInDays(endDate, new Date());
    
    if (!customer.is_active) {
      return { label: "Inactive", variant: "secondary" as const };
    }
    if (daysRemaining <= 0) {
      return { label: "Expired", variant: "destructive" as const };
    }
    if (daysRemaining <= 7) {
      return { label: `${daysRemaining}d left`, variant: "outline" as const };
    }
    return { label: "Active", variant: "default" as const };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-display text-3xl tracking-wide text-foreground">Customers</h2>
          <p className="text-muted-foreground mt-1">Manage customer access and subscriptions</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="netflix">
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl tracking-wide">
                {editingCustomer ? "Edit Customer" : "Add Customer"}
              </DialogTitle>
              <DialogDescription>
                {editingCustomer ? "Update customer details" : "Create a new customer with access code"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Customer Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="netflix_account">Assign Netflix Account</Label>
                <Select
                  value={formData.netflix_account_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, netflix_account_id: value }))}
                >
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.netflix_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchase_date">Purchase Date</Label>
                  <Input
                    id="purchase_date"
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_date: e.target.value }))}
                    className="bg-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_days">Duration (days)</Label>
                  <Input
                    id="subscription_days"
                    type="number"
                    min="1"
                    value={formData.subscription_days}
                    onChange={(e) => setFormData(prev => ({ ...prev, subscription_days: e.target.value }))}
                    className="bg-input"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-border"
                />
                <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="netflix">
                  {editingCustomer ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No customers yet. Click "Add Customer" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Customer</TableHead>
                    <TableHead>Access Code</TableHead>
                    <TableHead>Netflix Account</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => {
                    const status = getStatus(customer);
                    const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
                    
                    return (
                      <TableRow key={customer.id} className="border-border">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {customer.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-primary/10 text-primary px-2 py-1 rounded font-mono">
                              {customer.access_code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyCode(customer.access_code)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => regenerateCode(customer.id)}
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {customer.netflix_accounts?.netflix_email || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(endDate, "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(customer)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(customer.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomersTab;
