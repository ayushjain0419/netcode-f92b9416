import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://netcode.lovable.app",
  "https://tlfrnykndmgiwurclnlg.lovable.app",
  "https://netcode-net.vercel.app",
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

// Setup key from environment variable - must be configured in Lovable Cloud secrets
const SETUP_KEY = Deno.env.get("ADMIN_SETUP_KEY");

// In-memory rate limiting for admin creation attempts
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();
const MAX_ATTEMPTS = 3; // Maximum 3 attempts per hour per IP
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

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

  if (limit.attempts >= MAX_ATTEMPTS) {
    return true;
  }

  limit.attempts++;
  rateLimits.set(clientIP, limit);
  return false;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = getClientIP(req);

  try {
    // Security: Check rate limit before any processing
    if (isRateLimited(clientIP)) {
      console.warn(`[SECURITY] Rate limited admin creation attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate setup key is configured
    if (!SETUP_KEY) {
      console.error("[INTERNAL] ADMIN_SETUP_KEY environment variable not configured");
      return new Response(
        JSON.stringify({ error: "Admin setup not available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, name, setupKey } = await req.json();

    // Security: Audit log all admin creation attempts (no sensitive data in logs)
    console.log(`[SECURITY] Admin creation attempt - IP: ${clientIP}`);

    // Validate setup key for security
    if (!setupKey || setupKey !== SETUP_KEY) {
      console.warn(`[SECURITY] Invalid setup key attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Invalid setup key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create the user in auth.users
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createError) {
      console.error(`[INTERNAL] Error creating admin user:`, createError);
      
      // Map known errors to safe user messages
      let userMessage = "Failed to create admin account";
      if (createError.message.includes("already") || createError.message.includes("exists")) {
        userMessage = "Email already registered";
      } else if (createError.message.includes("password")) {
        userMessage = "Password does not meet requirements";
      } else if (createError.message.includes("email")) {
        userMessage = "Invalid email address";
      }
      
      return new Response(
        JSON.stringify({ error: userMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add to admin_users table
    const { error: insertError } = await supabaseAdmin
      .from("admin_users")
      .insert({ id: userData.user.id, email: userData.user.email });

    if (insertError) {
      console.error(`[INTERNAL] Error adding admin record:`, insertError);
      // Clean up - delete the auth user if admin insert fails
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to complete admin setup" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SECURITY] Successfully created admin user from IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ success: true, user: { id: userData.user.id, email: userData.user.email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[INTERNAL] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
