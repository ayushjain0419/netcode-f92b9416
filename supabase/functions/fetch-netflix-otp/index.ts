import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://netcode.lovable.app",
  "https://tlfrnykndmgiwurclnlg.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith(".lovable.app")
  );
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

interface FetchOtpRequest {
  access_code: string;
}

// In-memory rate limiting for OTP fetch attempts
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();
const MAX_OTP_ATTEMPTS = 10; // Max 10 OTP fetches per 15 minutes per IP
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(clientIP: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(clientIP);

  if (!limit) {
    rateLimits.set(clientIP, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (now > limit.resetAt) {
    rateLimits.set(clientIP, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (limit.attempts >= MAX_OTP_ATTEMPTS) {
    return true;
  }

  limit.attempts++;
  rateLimits.set(clientIP, limit);
  return false;
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
    console.error("[INTERNAL] Failed to refresh access token:", error);
    throw new Error("Email service unavailable");
  }

  const data = await response.json();
  return data.access_token;
}

interface EmailResult {
  verification_link: string | null;
  otp_code: string | null;
}

// Search for Netflix emails and extract the verification link or OTP
async function fetchNetflixVerification(accessToken: string, gmailAddress: string): Promise<EmailResult> {
  console.log(`[INTERNAL] Searching for Netflix verification emails in ${gmailAddress}`);

  // Search for recent Netflix emails about household/verification/temporary access
  const searchQuery = encodeURIComponent(
    "from:info@account.netflix.com (temporary access OR household OR verification) newer_than:1h"
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
    console.error("[INTERNAL] Gmail search failed:", error);
    throw new Error("Email search failed");
  }

  const searchData = await searchResponse.json();
  const messages = searchData.messages || [];

  console.log(`[INTERNAL] Found ${messages.length} potential Netflix emails`);

  if (messages.length === 0) {
    return { verification_link: null, otp_code: null };
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
    console.error("[INTERNAL] Failed to fetch message content");
    return { verification_link: null, otp_code: null };
  }

  const messageData = await messageResponse.json();

  // Extract message body (prefer HTML for link extraction)
  let htmlBody = "";
  let textBody = "";
  
  if (messageData.payload?.body?.data) {
    const decoded = atob(messageData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    textBody = decoded;
    htmlBody = decoded;
  } else if (messageData.payload?.parts) {
    for (const part of messageData.payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        htmlBody = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      } else if (part.mimeType === "text/plain" && part.body?.data) {
        textBody = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      }
      // Check nested parts (multipart/alternative)
      if (part.parts) {
        for (const subpart of part.parts) {
          if (subpart.mimeType === "text/html" && subpart.body?.data) {
            htmlBody = atob(subpart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          } else if (subpart.mimeType === "text/plain" && subpart.body?.data) {
            textBody = atob(subpart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
        }
      }
    }
  }

  console.log("[INTERNAL] Searching for verification link in email...");

  // Look for Netflix verification/household/temporary access links
  const linkPatterns = [
    /https:\/\/www\.netflix\.com\/account\/travel\/verify[^\s"'<>]+/gi,
    /https:\/\/www\.netflix\.com\/account\/household[^\s"'<>]+/gi,
    /https:\/\/www\.netflix\.com[^\s"'<>]*(?:verify|code|access)[^\s"'<>]*/gi,
  ];

  const bodyToSearch = htmlBody || textBody;
  
  for (const pattern of linkPatterns) {
    const matches = bodyToSearch.match(pattern);
    if (matches && matches.length > 0) {
      let link = matches[0].replace(/[&]amp;/g, "&");
      link = link.replace(/&[a-z]+;$/i, "");
      console.log("[INTERNAL] Found verification link");
      return { verification_link: link, otp_code: null };
    }
  }

  // Fallback: look for any Netflix link with "code" or "verify" in it
  const genericNetflixLink = bodyToSearch.match(/https:\/\/[^\s"'<>]*netflix\.com[^\s"'<>]*/gi);
  if (genericNetflixLink) {
    for (const link of genericNetflixLink) {
      if (link.includes("travel") || link.includes("verify") || link.includes("code") || link.includes("access")) {
        const cleanLink = link.replace(/[&]amp;/g, "&").replace(/&[a-z]+;$/i, "");
        console.log("[INTERNAL] Found Netflix verification link");
        return { verification_link: cleanLink, otp_code: null };
      }
    }
  }

  // Also try to extract OTP code as fallback
  console.log("[INTERNAL] No link found, searching for OTP code...");
  const otpPatterns = [
    /(?:code|verification|verify)[:\s]*(\d{4,6})/i,
    /(\d{4,6})\s*(?:is your|verification|code)/i,
  ];

  const searchBody = textBody || htmlBody;
  for (const pattern of otpPatterns) {
    const match = searchBody.match(pattern);
    if (match) {
      const code = match[1] || match[0];
      if (/^\d{4,6}$/.test(code)) {
        console.log("[INTERNAL] Found OTP code");
        return { verification_link: null, otp_code: code };
      }
    }
  }

  console.log("[INTERNAL] No verification link or OTP found in email");
  return { verification_link: null, otp_code: null };
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = getClientIP(req);

  // Check rate limit before processing
  if (isRateLimited(clientIP)) {
    console.warn(`[SECURITY] Rate limited OTP fetch attempt from IP: ${clientIP}`);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { access_code }: FetchOtpRequest = await req.json();

    // Validate access code format (6 digits)
    if (!access_code || !/^\d{6}$/.test(access_code)) {
      return new Response(
        JSON.stringify({ error: "Valid 6-digit access code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[INTERNAL] Validating access code and fetching customer data...`);

    // Validate access code and get customer/netflix account data using secure RPC
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: customerData, error: customerError } = await supabase.rpc(
      "get_customer_data_by_access_code",
      { p_access_code: access_code }
    );

    if (customerError) {
      console.error("[INTERNAL] Error validating access code:", customerError);
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = Array.isArray(customerData) ? customerData[0] : customerData;

    if (!customer) {
      console.log("[INTERNAL] Invalid or inactive access code");
      return new Response(
        JSON.stringify({ error: "Invalid or inactive access code" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gmail_address = customer.gmail_address;
    const netflix_account_id = customer.netflix_account_id;

    if (!gmail_address) {
      return new Response(
        JSON.stringify({ error: "No Gmail address linked to this account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[INTERNAL] Fetching verification for account`);

    // Get fresh access token
    const accessToken = await getAccessToken();

    // Fetch verification link or OTP from Gmail
    const result = await fetchNetflixVerification(accessToken, gmail_address);

    if (!result.verification_link && !result.otp_code) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No recent verification email found. Please request a new code from Netflix first." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete old entries for this account
    await supabase
      .from("otp_logs")
      .delete()
      .eq("netflix_account_id", netflix_account_id);

    // Store the link or code
    const { error: insertError } = await supabase
      .from("otp_logs")
      .insert({
        netflix_account_id,
        otp_code: result.verification_link || result.otp_code || "",
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error("[INTERNAL] Error storing verification:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        verification_link: result.verification_link,
        otp_code: result.otp_code,
        message: result.verification_link 
          ? "Verification link retrieved successfully" 
          : "Verification code retrieved successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[INTERNAL] Error in fetch-netflix-otp function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch verification. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
