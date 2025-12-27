// ============================================
// EXCEL BACKUP HOOK
// Export customers and Netflix accounts data to Excel
// ============================================

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format, addDays } from "date-fns";

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
  selling_price: number | null;
  created_at: string;
  netflix_accounts: {
    netflix_email: string;
    netflix_password: string;
  } | null;
}

interface NetflixAccount {
  id: string;
  netflix_email: string;
  netflix_password: string;
  gmail_address: string | null;
  account_created_date: string | null;
  payment_account: string | null;
  created_at: string;
}

export const useExcelBackup = () => {
  const [isExporting, setIsExporting] = useState(false);

  const exportToExcel = async () => {
    setIsExporting(true);

    try {
      // Fetch all customers with their Netflix accounts
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("*, netflix_accounts(netflix_email, netflix_password)")
        .order("created_at", { ascending: false });

      if (customersError) throw customersError;

      // Fetch all Netflix accounts
      const { data: accounts, error: accountsError } = await supabase
        .from("netflix_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (accountsError) throw accountsError;

      // Transform customers data for Excel
      const customersData = (customers || []).map((customer: Customer) => {
        const endDate = addDays(new Date(customer.purchase_date), customer.subscription_days);
        const daysRemaining = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          "Customer Name": customer.name,
          "Access Code": customer.access_code,
          "Netflix Email": customer.netflix_accounts?.netflix_email || "Not Assigned",
          "Netflix Password": customer.netflix_accounts?.netflix_password || "N/A",
          "Profile Number": customer.profile_number || "N/A",
          "Purchase Date": customer.purchase_date,
          "Subscription Days": customer.subscription_days,
          "End Date": format(endDate, "yyyy-MM-dd"),
          "Days Remaining": daysRemaining,
          "Status": !customer.is_active ? "Inactive" : (daysRemaining <= 0 ? "Expired" : "Active"),
          "Purchased From": customer.purchased_from || "N/A",
          "Selling Price": customer.selling_price || "N/A",
          "Created At": format(new Date(customer.created_at), "yyyy-MM-dd HH:mm"),
        };
      });

      // Transform Netflix accounts data for Excel
      const accountsData = (accounts || []).map((account: NetflixAccount) => ({
        "Netflix Email": account.netflix_email,
        "Netflix Password": account.netflix_password,
        "Linked Gmail": account.gmail_address || "N/A",
        "Account Created Date": account.account_created_date || "N/A",
        "Payment Account": account.payment_account || "N/A",
        "Added On": format(new Date(account.created_at), "yyyy-MM-dd HH:mm"),
      }));

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new();

      // Add Customers sheet
      const customersSheet = XLSX.utils.json_to_sheet(customersData);
      
      // Set column widths for customers sheet
      customersSheet["!cols"] = [
        { wch: 20 }, // Customer Name
        { wch: 12 }, // Access Code
        { wch: 30 }, // Netflix Email
        { wch: 18 }, // Netflix Password
        { wch: 14 }, // Profile Number
        { wch: 14 }, // Purchase Date
        { wch: 16 }, // Subscription Days
        { wch: 14 }, // End Date
        { wch: 14 }, // Days Remaining
        { wch: 10 }, // Status
        { wch: 18 }, // Purchased From
        { wch: 12 }, // Selling Price
        { wch: 18 }, // Created At
      ];
      
      XLSX.utils.book_append_sheet(workbook, customersSheet, "Customers");

      // Add Netflix Accounts sheet
      const accountsSheet = XLSX.utils.json_to_sheet(accountsData);
      
      // Set column widths for accounts sheet
      accountsSheet["!cols"] = [
        { wch: 30 }, // Netflix Email
        { wch: 18 }, // Netflix Password
        { wch: 30 }, // Linked Gmail
        { wch: 20 }, // Account Created Date
        { wch: 20 }, // Payment Account
        { wch: 18 }, // Added On
      ];
      
      XLSX.utils.book_append_sheet(workbook, accountsSheet, "Netflix Accounts");

      // Generate filename with timestamp
      const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm");
      const filename = `netcode_backup_${timestamp}.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);

      toast.success(`Backup downloaded: ${filename}`);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Failed to export backup");
    } finally {
      setIsExporting(false);
    }
  };

  return { exportToExcel, isExporting };
};
