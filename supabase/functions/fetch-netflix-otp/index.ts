import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FetchOtpRequest {
  gmail_address: string;
  netflix_account_id: string;
}

// Get new access token using refresh token
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail API credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to refresh access token:", error);
    throw new Error("Failed to authenticate with Gmail API");
  }

  const data = await response.json();
  return data.access_token;
}

// Search for Netflix emails and extract OTP
async function fetchNetflixOtp(accessToken: string, gmailAddress: string): Promise<string | null> {
  console.log(`Searching for Netflix OTP emails in ${gmailAddress}`);

  // Search for recent Netflix emails about household/verification
  const searchQuery = encodeURIComponent(
    "from:info@account.netflix.com (household OR verification OR code) newer_than:1h"
  );

  const searchResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=5`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchResponse.ok) {
    const error = await searchResponse.text();
    console.error("Gmail search failed:", error);
    throw new Error("Failed to search Gmail");
  }

  const searchData = await searchResponse.json();
  const messages = searchData.messages || [];

  console.log(`Found ${messages.length} potential Netflix emails`);

  if (messages.length === 0) {
    return null;
  }

  // Get the most recent message
  const messageId = messages[0].id;
  const messageResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!messageResponse.ok) {
    console.error("Failed to fetch message content");
    return null;
  }

  const messageData = await messageResponse.json();

  // Extract message body
  let body = "";
  
  if (messageData.payload?.body?.data) {
    body = atob(messageData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  } else if (messageData.payload?.parts) {
    for (const part of messageData.payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body += atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      } else if (part.mimeType === "text/html" && part.body?.data) {
        body += atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      }
    }
  }

  console.log("Searching for OTP in email body...");

  // Look for verification codes in the email
  // Netflix typically sends 4-6 digit codes
  const otpPatterns = [
    /(?:code|verification|verify|household)[:\s]*(\d{4,6})/i,
    /(\d{4,6})\s*(?:is your|verification|code)/i,
    /\b(\d{4,6})\b/g,
  ];

  for (const pattern of otpPatterns) {
    const match = body.match(pattern);
    if (match) {
      const code = match[1] || match[0];
      // Validate it looks like an OTP (4-6 digits)
      if (/^\d{4,6}$/.test(code)) {
        console.log("Found OTP code:", code);
        return code;
      }
    }
  }

  console.log("No OTP found in email body");
  return null;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gmail_address, netflix_account_id }: FetchOtpRequest = await req.json();

    if (!gmail_address || !netflix_account_id) {
      return new Response(
        JSON.stringify({ error: "Gmail address and Netflix account ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching OTP for Netflix account ${netflix_account_id} from ${gmail_address}`);

    // Get fresh access token
    const accessToken = await getAccessToken();

    // Fetch OTP from Gmail
    const otpCode = await fetchNetflixOtp(accessToken, gmail_address);

    if (!otpCode) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No recent verification code found. Please check if Netflix sent an email." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store OTP in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete old OTPs for this account
    await supabase
      .from("otp_logs")
      .delete()
      .eq("netflix_account_id", netflix_account_id);

    // Insert new OTP
    const { error: insertError } = await supabase
      .from("otp_logs")
      .insert({
        netflix_account_id,
        otp_code: otpCode,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        otp_code: otpCode,
        message: "Verification code retrieved successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in fetch-netflix-otp function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch OTP" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
