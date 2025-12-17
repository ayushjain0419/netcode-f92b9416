// ============================================
// AUTO-COPY CUSTOMER MESSAGE DIALOG
// Shows formatted message for WhatsApp after customer creation
// ============================================

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

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

interface CustomerMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CustomerMessageData | null;
}

// Generate the formatted WhatsApp message
const generateMessage = (data: CustomerMessageData): string => {
  return `🎬 NETCODE – Netflix Access

Your Netflix is active ✅

🔗 Visit: https://netcode-net.vercel.app/
🔐 Enter the Access Code: "${data.accessCode}"
📄 View all account details & updates anytime

🏠 If Netflix asks for Household Verification, use the Household link on the website.

✅ This system ensures smooth & guaranteed access throughout your subscription.

⚠ Important Rules
🚫 Don't change profile name or PIN
🚫 Don't exceed screen limit
🚫 No other changes allowed
🚫 Use on one device only

❗ Rule violation = No refund / replacement

Enjoy streaming 🍿
– NETCODE`;
};

const CustomerMessageDialog = ({
  open,
  onOpenChange,
  data,
}: CustomerMessageDialogProps) => {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const message = generateMessage(data);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Message copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy message");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-wide">
            Customer Created Successfully
          </DialogTitle>
          <DialogDescription>
            Copy this message and send it to the customer via WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap break-words">
          {message}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="netflix" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerMessageDialog;
