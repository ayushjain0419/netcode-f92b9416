// ============================================
// CUSTOMERS TAB - Admin Panel
// Manages customer list with search, filters, and CRUD operations
// ============================================

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Copy, RefreshCw, User, Users, Clock, XCircle, CheckSquare } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import CustomerFilters from "./CustomerFilters";
import CustomerMessageDialog from "./CustomerMessageDialog";

// ============================================
// INTERFACES
// ============================================

interface NetflixAccount {
  id: string;
  netflix_email: string;
  netflix_password: string;
}

interface Customer {
  id: string;
  name: string;
  access_code: string;
  netflix_account_id: string | null;
  purchase_date: string;
  subscription_days: number;
  is_active: boolean;
  profile_number: number | null;
  purchased_from: string | null;
  netflix_accounts: NetflixAccount | null;
}

interface CustomerMessageData {
  customerName: string;
  netflixEmail: string;
  netflixPassword: string;
  profileNumber: number | null;
  subscriptionDays: number;
  purchaseDate: string;
  accessCode: string;
  purchasedFrom: string | null;
}

interface CustomersTabProps {
  durationFilter?: number | null;
  onClearDurationFilter?: () => void;
}

// ============================================
// COMPONENT
// ============================================

const CustomersTab = ({ durationFilter, onClearDurationFilter }: CustomersTabProps) => {
  // State for customers and accounts
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<NetflixAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Bulk selection state
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"extend" | "deactivate" | "reassign" | null>(null);
  const [bulkExtendDays, setBulkExtendDays] = useState("30");
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");

  // Auto-copy message dialog state
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState<CustomerMessageData | null>(null);
  
  // Form data with profile_number and purchased_from fields
  const [formData, setFormData] = useState({
    name: "",
    netflix_account_id: "",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    subscription_days: "30",
    is_active: true,
    profile_number: "", // 1-5 or empty
    purchased_from: "",
    custom_access_code: "" // Optional custom access code
  });

  useEffect(() => {
    fetchCustomers();
    fetchAccounts();
  }, []);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*, netflix_accounts(id, netflix_email, netflix_password)")
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
        .select("id, netflix_email, netflix_password");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const generateAccessCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Get customer status based on dates and is_active flag
  const getStatus = (customer: Customer) => {
    const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
    const daysRemaining = differenceInDays(endDate, new Date());
    
    if (!customer.is_active) {
      return { label: "Inactive", variant: "secondary" as const, status: "inactive" };
    }
    if (daysRemaining <= 0) {
      return { label: "Expired", variant: "destructive" as const, status: "expired" };
    }
    if (daysRemaining <= 7) {
      return { label: `${daysRemaining}d left`, variant: "outline" as const, status: "active" };
    }
    return { label: "Active", variant: "default" as const, status: "active" };
  };

  // ============================================
  // FILTERING LOGIC
  // ============================================

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Search filter - check name, netflix email, and access code
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        searchTerm === "" ||
        customer.name.toLowerCase().includes(searchLower) ||
        (customer.netflix_accounts?.netflix_email?.toLowerCase().includes(searchLower) ?? false) ||
        customer.access_code.includes(searchTerm);

      // Status filter
      const status = getStatus(customer);
      const matchesStatus = 
        statusFilter === "all" || status.status === statusFilter;

      // Profile filter
      const matchesProfile = 
        profileFilter === "all" ||
        (profileFilter === "none" && customer.profile_number === null) ||
        (customer.profile_number?.toString() === profileFilter);

      // Duration filter (from Overview tab click)
      const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
      const daysRemaining = differenceInDays(endDate, new Date());
      const matchesDuration = 
        !durationFilter || 
        (customer.is_active && daysRemaining > 0 && customer.subscription_days >= durationFilter);

      return matchesSearch && matchesStatus && matchesProfile && matchesDuration;
    });
  }, [customers, searchTerm, statusFilter, profileFilter, durationFilter]);

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Customer name is required");
      return;
    }

    try {
      if (editingCustomer) {
        // Update existing customer
        const { error } = await supabase
          .from("customers")
          .update({
            name: formData.name,
            netflix_account_id: formData.netflix_account_id || null,
            purchase_date: formData.purchase_date,
            subscription_days: parseInt(formData.subscription_days),
            is_active: formData.is_active,
            profile_number: formData.profile_number ? parseInt(formData.profile_number) : null,
            purchased_from: formData.purchased_from || null
          })
          .eq("id", editingCustomer.id);

        if (error) throw error;
        toast.success("Customer updated successfully");
        setIsDialogOpen(false);
      } else {
        // Create new customer - use custom code if provided, otherwise generate
        const accessCode = formData.custom_access_code.trim() || generateAccessCode();
        const selectedAccount = accounts.find(a => a.id === formData.netflix_account_id);
        
        const { error } = await supabase
          .from("customers")
          .insert({
            name: formData.name,
            access_code: accessCode,
            netflix_account_id: formData.netflix_account_id || null,
            purchase_date: formData.purchase_date,
            subscription_days: parseInt(formData.subscription_days),
            is_active: formData.is_active,
            profile_number: formData.profile_number ? parseInt(formData.profile_number) : null,
            purchased_from: formData.purchased_from || null
          });

        if (error) throw error;
        
        // Prepare data for message dialog
        setNewCustomerData({
          customerName: formData.name,
          netflixEmail: selectedAccount?.netflix_email || "N/A",
          netflixPassword: selectedAccount?.netflix_password || "N/A",
          profileNumber: formData.profile_number ? parseInt(formData.profile_number) : null,
          subscriptionDays: parseInt(formData.subscription_days),
          purchaseDate: formData.purchase_date,
          accessCode: accessCode,
          purchasedFrom: formData.purchased_from || null
        });
        
        setIsDialogOpen(false);
        setMessageDialogOpen(true); // Show auto-copy message dialog
        toast.success(`Customer created! Access code: ${accessCode}`);
      }

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

  // ============================================
  // BULK ACTIONS
  // ============================================

  const toggleSelectAll = () => {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleSelectCustomer = (id: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCustomers(newSelected);
  };

  const openBulkDialog = (action: "extend" | "deactivate" | "reassign") => {
    setBulkAction(action);
    setBulkDialogOpen(true);
  };

  const handleBulkAction = async () => {
    if (selectedCustomers.size === 0) {
      toast.error("No customers selected");
      return;
    }

    setIsBulkProcessing(true);
    const selectedIds = Array.from(selectedCustomers);

    try {
      if (bulkAction === "extend") {
        // Extend subscription for selected customers
        for (const id of selectedIds) {
          const customer = customers.find(c => c.id === id);
          if (customer) {
            const newDays = customer.subscription_days + parseInt(bulkExtendDays);
            await supabase
              .from("customers")
              .update({ subscription_days: newDays })
              .eq("id", id);
          }
        }
        toast.success(`Extended subscription for ${selectedIds.length} customers by ${bulkExtendDays} days`);
      } else if (bulkAction === "deactivate") {
        // Deactivate selected customers
        const { error } = await supabase
          .from("customers")
          .update({ is_active: false })
          .in("id", selectedIds);
        
        if (error) throw error;
        toast.success(`Deactivated ${selectedIds.length} customers`);
      } else if (bulkAction === "reassign") {
        // Reassign Netflix account
        if (!bulkAccountId) {
          toast.error("Please select a Netflix account");
          setIsBulkProcessing(false);
          return;
        }
        const { error } = await supabase
          .from("customers")
          .update({ netflix_account_id: bulkAccountId === "none" ? null : bulkAccountId })
          .in("id", selectedIds);
        
        if (error) throw error;
        const accountEmail = accounts.find(a => a.id === bulkAccountId)?.netflix_email || "None";
        toast.success(`Reassigned ${selectedIds.length} customers to ${accountEmail}`);
      }

      setBulkDialogOpen(false);
      setSelectedCustomers(new Set());
      setBulkExtendDays("30");
      setBulkAccountId("");
      fetchCustomers();
    } catch (error: any) {
      console.error("Bulk action error:", error);
      toast.error(error.message || "Bulk action failed");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // ============================================
  // FORM HELPERS
  // ============================================

  const resetForm = () => {
    setFormData({
      name: "",
      netflix_account_id: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      subscription_days: "30",
      is_active: true,
      profile_number: "",
      purchased_from: "",
      custom_access_code: ""
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
      is_active: customer.is_active,
      profile_number: customer.profile_number?.toString() || "",
      purchased_from: customer.purchased_from || "",
      custom_access_code: "" // Not editable when editing
    });
    setIsDialogOpen(true);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
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
              {/* Customer Name */}
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
              
              {/* Netflix Account Selection */}
              <div className="space-y-2">
                <Label htmlFor="netflix_account">Assign Netflix Account</Label>
                <Select
                  value={formData.netflix_account_id || "none"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, netflix_account_id: value === "none" ? "" : value }))}
                >
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.netflix_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Profile Number Selection (1-5) */}
              <div className="space-y-2">
                <Label htmlFor="profile_number">Profile Number</Label>
                <Select
                  value={formData.profile_number || "none"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, profile_number: value === "none" ? "" : value }))}
                >
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Select profile number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="1">Profile 1</SelectItem>
                    <SelectItem value="2">Profile 2</SelectItem>
                    <SelectItem value="3">Profile 3</SelectItem>
                    <SelectItem value="4">Profile 4</SelectItem>
                    <SelectItem value="5">Profile 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date and Duration */}
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

              {/* Purchased From */}
              <div className="space-y-2">
                <Label htmlFor="purchased_from">Purchased From (Reseller)</Label>
                <Input
                  id="purchased_from"
                  placeholder="e.g., Reseller name or Direct"
                  value={formData.purchased_from}
                  onChange={(e) => setFormData(prev => ({ ...prev, purchased_from: e.target.value }))}
                  className="bg-input"
                />
              </div>

              {/* Custom Access Code - only show when creating new customer */}
              {!editingCustomer && (
                <div className="space-y-2">
                  <Label htmlFor="custom_access_code">Access Code (Optional)</Label>
                  <Input
                    id="custom_access_code"
                    placeholder="Leave blank for auto-generated code"
                    value={formData.custom_access_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, custom_access_code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    maxLength={6}
                    className="bg-input"
                  />
                  <p className="text-xs text-muted-foreground">Enter a 6-digit code or leave blank to auto-generate</p>
                </div>
              )}

              {/* Active Checkbox */}
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

      {/* Duration Filter Banner */}
      {durationFilter && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-foreground">
                Showing customers with <strong>{durationFilter}+ days</strong> subscription
              </span>
              <Button variant="ghost" size="sm" onClick={onClearDurationFilter}>
                <XCircle className="w-4 h-4 mr-2" />
                Clear Filter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <CustomerFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        profileFilter={profileFilter}
        onProfileFilterChange={setProfileFilter}
      />

      {/* Bulk Actions Toolbar */}
      {selectedCustomers.size > 0 && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">
                  {selectedCustomers.size} customer{selectedCustomers.size > 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => openBulkDialog("extend")}>
                  <Clock className="w-4 h-4 mr-2" />
                  Extend Subscription
                </Button>
                <Button variant="outline" size="sm" onClick={() => openBulkDialog("reassign")}>
                  <Users className="w-4 h-4 mr-2" />
                  Reassign Account
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => openBulkDialog("deactivate")}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Deactivate
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCustomers(new Set())}>
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Action Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-wide">
              {bulkAction === "extend" && "Extend Subscriptions"}
              {bulkAction === "deactivate" && "Deactivate Customers"}
              {bulkAction === "reassign" && "Reassign Netflix Account"}
            </DialogTitle>
            <DialogDescription>
              This action will affect {selectedCustomers.size} customer{selectedCustomers.size > 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          
          {bulkAction === "extend" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Add Days to Subscription</Label>
                <Select value={bulkExtendDays} onValueChange={setBulkExtendDays}>
                  <SelectTrigger className="bg-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">365 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {bulkAction === "reassign" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Netflix Account</Label>
                <Select value={bulkAccountId} onValueChange={setBulkAccountId}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Remove Assignment</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.netflix_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                Use this to change the Netflix account for customers after monthly rotation.
              </p>
            </div>
          )}
          
          {bulkAction === "deactivate" && (
            <p className="text-muted-foreground">
              Are you sure you want to deactivate {selectedCustomers.size} customer{selectedCustomers.size > 1 ? "s" : ""}? 
              They will no longer have access to their accounts.
            </p>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDialogOpen(false)} disabled={isBulkProcessing}>
              Cancel
            </Button>
            <Button 
              variant={bulkAction === "deactivate" ? "destructive" : "netflix"} 
              onClick={handleBulkAction}
              disabled={isBulkProcessing}
            >
              {isBulkProcessing ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customers Table */}
      <Card className="glass">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {customers.length === 0 
                ? 'No customers yet. Click "Add Customer" to create one.'
                : "No customers match your search criteria."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Access Code</TableHead>
                    <TableHead>Netflix Account</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Reseller</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => {
                    const status = getStatus(customer);
                    const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
                    
                    return (
                      <TableRow key={customer.id} className={`border-border ${selectedCustomers.has(customer.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCustomers.has(customer.id)}
                            onCheckedChange={() => toggleSelectCustomer(customer.id)}
                          />
                        </TableCell>
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
                        <TableCell>
                          {customer.profile_number ? (
                            <Badge variant="outline">P{customer.profile_number}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {customer.purchased_from || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(endDate, "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const daysLeft = differenceInDays(endDate, new Date());
                            if (daysLeft < 0) return <span className="text-destructive font-medium">Expired</span>;
                            if (daysLeft === 0) return <span className="text-destructive font-medium">Today</span>;
                            if (daysLeft <= 7) return <span className="text-yellow-500 font-medium">{daysLeft} days</span>;
                            return <span className="text-green-500 font-medium">{daysLeft} days</span>;
                          })()}
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

      {/* Auto-copy Message Dialog */}
      <CustomerMessageDialog
        open={messageDialogOpen}
        onOpenChange={setMessageDialogOpen}
        data={newCustomerData}
      />
    </div>
  );
};

export default CustomersTab;
