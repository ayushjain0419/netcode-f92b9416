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
}

interface CustomerMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CustomerMessageData | null;
}

// Generate the formatted WhatsApp message
const generateMessage = (data: CustomerMessageData): string => {
  const profileText = data.profileNumber ? `${data.profileNumber}` : "N/A";
  const validityText = `${data.subscriptionDays} Days`;
  const issueDate = format(new Date(data.purchaseDate), "dd MMM yyyy");
  
  return `𝐍𝐄𝐓𝐅𝐋𝐈𝐗 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 𝐀𝐂𝐂𝐎𝐔𝐍𝐓

📧 : ID : ${data.netflixEmail}
🔐 : Password : ${data.netflixPassword}
👨🏻‍💻 | Profile : ${profileText}
📍 | PIN : None
🛍️ | Plan - Premium
🍿 | Allowed streams - 1
⏳ | Validity - ${validityText}
📅 | Issue Date - ${issueDate}

How to login:
https://drive.google.com/drive/folders/1Yz-94GkWzU_-kN5UzUxWhs5cQ9Jn5bMd

Website: netcode.site

NOTE:
• DO NOT change profile name or PIN
• DO NOT exceed screen limit
• NO other changes allowed
• Violation = No refund / replacement

LOGIN & SEND SCREENSHOT

---
Access Code: ${data.accessCode}`;
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
