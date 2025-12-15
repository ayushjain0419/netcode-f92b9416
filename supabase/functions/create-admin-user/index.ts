import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = getClientIP(req);

  try {
    // Security: Check rate limit before any processing
    if (isRateLimited(clientIP)) {
      console.warn(`Rate limited admin creation attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate setup key is configured
    if (!SETUP_KEY) {
      console.error("ADMIN_SETUP_KEY environment variable not configured");
      return new Response(
        JSON.stringify({ error: "Admin setup not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, name, setupKey } = await req.json();

    // Security: Audit log all admin creation attempts
    console.log(`Admin creation attempt - IP: ${clientIP}, Email: ${email || "not provided"}`);

    // Validate setup key for security
    if (!setupKey || setupKey !== SETUP_KEY) {
      console.warn(`Invalid setup key attempt from IP: ${clientIP}`);
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
      console.error(`Error creating admin user for ${email}:`, createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add to admin_users table
    const { error: insertError } = await supabaseAdmin
      .from("admin_users")
      .insert({ id: userData.user.id, email: userData.user.email });

    if (insertError) {
      console.error(`Error adding admin record for ${email}:`, insertError);
      // Clean up - delete the auth user if admin insert fails
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create admin record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully created admin user: ${email} from IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ success: true, user: { id: userData.user.id, email: userData.user.email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`Unexpected error from IP ${clientIP}:`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
