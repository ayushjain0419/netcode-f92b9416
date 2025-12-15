import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Mail, Key, Eye, EyeOff } from "lucide-react";

interface NetflixAccount {
  id: string;
  netflix_email: string;
  netflix_password: string;
  gmail_address: string | null;
  created_at: string;
}

const NetflixAccountsTab = () => {
  const [accounts, setAccounts] = useState<NetflixAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<NetflixAccount | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  
  const [formData, setFormData] = useState({
    netflix_email: "",
    netflix_password: "",
    gmail_address: ""
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("netflix_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Failed to load Netflix accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.netflix_email || !formData.netflix_password) {
      toast.error("Email and password are required");
      return;
    }

    try {
      if (editingAccount) {
        const { error } = await supabase
          .from("netflix_accounts")
          .update({
            netflix_email: formData.netflix_email,
            netflix_password: formData.netflix_password,
            gmail_address: formData.gmail_address || null
          })
          .eq("id", editingAccount.id);

        if (error) throw error;
        toast.success("Account updated successfully");
      } else {
        const { error } = await supabase
          .from("netflix_accounts")
          .insert({
            netflix_email: formData.netflix_email,
            netflix_password: formData.netflix_password,
            gmail_address: formData.gmail_address || null
          });

        if (error) throw error;
        toast.success("Account created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      console.error("Error saving account:", error);
      toast.error(error.message || "Failed to save account");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    try {
      const { error } = await supabase
        .from("netflix_accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Account deleted successfully");
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    }
  };

  const resetForm = () => {
    setFormData({ netflix_email: "", netflix_password: "", gmail_address: "" });
    setEditingAccount(null);
  };

  const openEditDialog = (account: NetflixAccount) => {
    setEditingAccount(account);
    setFormData({
      netflix_email: account.netflix_email,
      netflix_password: account.netflix_password,
      gmail_address: account.gmail_address || ""
    });
    setIsDialogOpen(true);
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-display text-3xl tracking-wide text-foreground">Netflix Accounts</h2>
          <p className="text-muted-foreground mt-1">Manage streaming account credentials</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="netflix">
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl tracking-wide">
                {editingAccount ? "Edit Account" : "Add Netflix Account"}
              </DialogTitle>
              <DialogDescription>
                {editingAccount ? "Update the account details below" : "Enter the Netflix account credentials"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="netflix_email">Netflix Email</Label>
                <Input
                  id="netflix_email"
                  type="email"
                  placeholder="netflix@example.com"
                  value={formData.netflix_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, netflix_email: e.target.value }))}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflix_password">Netflix Password</Label>
                <Input
                  id="netflix_password"
                  type="text"
                  placeholder="Enter password"
                  value={formData.netflix_password}
                  onChange={(e) => setFormData(prev => ({ ...prev, netflix_password: e.target.value }))}
                  className="bg-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gmail_address">Linked Gmail (Optional)</Label>
                <Input
                  id="gmail_address"
                  type="email"
                  placeholder="linked@gmail.com"
                  value={formData.gmail_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, gmail_address: e.target.value }))}
                  className="bg-input"
                />
                <p className="text-xs text-muted-foreground">
                  Gmail used for Netflix verification emails
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="netflix">
                  {editingAccount ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No Netflix accounts yet. Click "Add Account" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Netflix Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Linked Gmail</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id} className="border-border">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        {account.netflix_email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {showPasswords[account.id] ? account.netflix_password : "••••••••"}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => togglePasswordVisibility(account.id)}
                        >
                          {showPasswords[account.id] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.gmail_address || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(account)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(account.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NetflixAccountsTab;
