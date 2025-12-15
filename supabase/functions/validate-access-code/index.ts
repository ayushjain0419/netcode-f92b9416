// ============================================
// VALIDATE ACCESS CODE WITH RATE LIMITING
// Rate-limited wrapper for customer access code validation
// ============================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory rate limiting store
// In production with multiple instances, use Redis or similar
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();

// Rate limiting configuration
const MAX_ATTEMPTS = 5; // Maximum 5 attempts per window
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds

// Cleanup old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  for (const [key, value] of rateLimits.entries()) {
    if (now > value.resetAt) {
      rateLimits.delete(key);
    }
  }
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(clientIP: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const limit = rateLimits.get(clientIP);

  if (!limit) {
    rateLimits.set(clientIP, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  if (now > limit.resetAt) {
    rateLimits.set(clientIP, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  const remaining = MAX_ATTEMPTS - limit.attempts;
  const resetIn = limit.resetAt - now;

  if (limit.attempts >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetIn };
  }

  limit.attempts++;
  rateLimits.set(clientIP, limit);
  return { allowed: true, remaining: remaining - 1, resetIn };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cleanup old rate limit entries
  cleanupOldEntries();

  const clientIP = getClientIP(req);

  try {
    // Check rate limit before processing
    const rateCheck = checkRateLimit(clientIP);
    
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil(rateCheck.resetIn / 1000);
      console.warn(`Rate limited access code attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many attempts. Please try again later.",
          retry_after: retryAfterSeconds
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds)
          } 
        }
      );
    }

    const body = await req.json();
    const accessCode = body.access_code;

    // Validate access code format (6 digits)
    if (!accessCode || typeof accessCode !== "string" || !/^\d{6}$/.test(accessCode)) {
      return new Response(
        JSON.stringify({ error: "Valid 6-digit access code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Access code validation attempt from IP: ${clientIP}, remaining attempts: ${rateCheck.remaining}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the secure RPC function
    const { data, error } = await supabase.rpc("get_customer_data_by_access_code", {
      p_access_code: accessCode,
    });

    if (error) {
      console.error("Error validating access code:", error);
      return new Response(
        JSON.stringify({ error: "Failed to validate access code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerData = Array.isArray(data) ? data[0] : data;

    if (!customerData) {
      // Don't reveal whether code exists or is inactive - generic error
      return new Response(
        JSON.stringify({ error: "Invalid or inactive access code" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Successful validation - return customer data
    console.log(`Successful access code validation for customer: ${customerData.id} from IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        customer: customerData,
        remaining_attempts: rateCheck.remaining
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error(`Error in validate-access-code from IP ${clientIP}:`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
