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

// Setup key from environment variable
const SETUP_KEY = Deno.env.get("ADMIN_SETUP_KEY");

// In-memory rate limiting
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

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
    // Check rate limit
    if (isRateLimited(clientIP)) {
      console.warn(`[SECURITY] Rate limited admin deletion attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate setup key is configured
    if (!SETUP_KEY) {
      console.error("[INTERNAL] ADMIN_SETUP_KEY environment variable not configured");
      return new Response(
        JSON.stringify({ error: "Admin management not available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { adminId, setupKey } = await req.json();

    console.log(`[SECURITY] Admin deletion attempt - IP: ${clientIP}`);

    // Validate setup key
    if (!setupKey || setupKey !== SETUP_KEY) {
      console.warn(`[SECURITY] Invalid setup key for deletion attempt from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Invalid setup key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!adminId) {
      return new Response(
        JSON.stringify({ error: "Admin ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(adminId)) {
      return new Response(
        JSON.stringify({ error: "Invalid admin ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check how many admins exist (prevent deleting last admin)
    const { data: adminCount, error: countError } = await supabaseAdmin
      .from("admin_users")
      .select("id", { count: "exact" });

    if (countError) {
      console.error("[INTERNAL] Error checking admin count:", countError);
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (adminCount && adminCount.length <= 1) {
      return new Response(
        JSON.stringify({ error: "Cannot delete the last admin user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete from admin_users table first
    const { error: deleteAdminError } = await supabaseAdmin
      .from("admin_users")
      .delete()
      .eq("id", adminId);

    if (deleteAdminError) {
      console.error("[INTERNAL] Error deleting admin record:", deleteAdminError);
      return new Response(
        JSON.stringify({ error: "Failed to remove admin privileges" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete the auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(adminId);

    if (deleteUserError) {
      console.error("[INTERNAL] Error deleting auth user:", deleteUserError);
      // The admin record is already deleted, so we should still report success
      // but log the issue
      console.warn("[INTERNAL] Admin record deleted but auth user deletion failed");
    }

    console.log(`[SECURITY] Successfully deleted admin user ${adminId} from IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[INTERNAL] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
