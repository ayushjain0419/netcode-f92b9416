// ============================================
// AUTO-DEACTIVATE EXPIRED SUBSCRIPTIONS
// Edge function that runs daily via cron to mark expired subscriptions as inactive
// SECURITY: This function requires CRON_SECRET authentication
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // This is an internal cron function - no CORS headers needed
  // Verify this is an authorized cron/internal call
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret) {
    console.error("[INTERNAL] CRON_SECRET environment variable not configured");
    return new Response(
      JSON.stringify({ error: "Service configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[SECURITY] Unauthorized cron function access attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Initialize Supabase client with external database credentials for admin operations
    const supabaseUrl = Deno.env.get("EXT_SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("EXT_SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date
    const today = new Date().toISOString().split("T")[0];
    console.log(`[INTERNAL] Running auto-deactivate check for date: ${today}`);

    // Find all active customers whose subscription has expired
    const { data: expiredCustomers, error: fetchError } = await supabase
      .from("customers")
      .select("id, name, purchase_date, subscription_days")
      .eq("is_active", true);

    if (fetchError) {
      console.error("[INTERNAL] Error fetching customers:", fetchError);
      throw new Error("Database query failed");
    }

    // Filter expired customers
    const customersToDeactivate = (expiredCustomers || []).filter((customer) => {
      const purchaseDate = new Date(customer.purchase_date);
      const endDate = new Date(purchaseDate);
      endDate.setDate(endDate.getDate() + customer.subscription_days);
      
      return endDate <= new Date();
    });

    if (customersToDeactivate.length === 0) {
      console.log("[INTERNAL] No expired subscriptions found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No expired subscriptions found",
          deactivated_count: 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Deactivate expired customers and free up their slots
    const idsToDeactivate = customersToDeactivate.map((c) => c.id);
    
    const { error: updateError } = await supabase
      .from("customers")
      .update({ is_active: false, netflix_account_id: null, profile_number: null })
      .in("id", idsToDeactivate);

    if (updateError) {
      console.error("[INTERNAL] Error deactivating customers:", updateError);
      throw new Error("Database update failed");
    }

    console.log(`[INTERNAL] Deactivated ${customersToDeactivate.length} expired subscriptions`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Deactivated ${customersToDeactivate.length} expired subscription(s)`,
        deactivated_count: customersToDeactivate.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[INTERNAL] Error in auto-deactivate function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Operation failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
