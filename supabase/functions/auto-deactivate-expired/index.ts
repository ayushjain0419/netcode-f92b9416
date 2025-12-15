// ============================================
// AUTO-DEACTIVATE EXPIRED SUBSCRIPTIONS
// Edge function that runs daily via cron to mark expired subscriptions as inactive
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date
    const today = new Date().toISOString().split("T")[0];

    // Find all active customers whose subscription has expired
    // Subscription expires when: purchase_date + subscription_days <= today
    const { data: expiredCustomers, error: fetchError } = await supabase
      .from("customers")
      .select("id, name, purchase_date, subscription_days")
      .eq("is_active", true);

    if (fetchError) {
      console.error("Error fetching customers:", fetchError);
      throw fetchError;
    }

    // Filter expired customers
    const customersToDeactivate = (expiredCustomers || []).filter((customer) => {
      const purchaseDate = new Date(customer.purchase_date);
      const endDate = new Date(purchaseDate);
      endDate.setDate(endDate.getDate() + customer.subscription_days);
      
      return endDate <= new Date();
    });

    if (customersToDeactivate.length === 0) {
      console.log("No expired subscriptions found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No expired subscriptions found",
          deactivated_count: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deactivate expired customers
    const idsToDeactivate = customersToDeactivate.map((c) => c.id);
    
    const { error: updateError } = await supabase
      .from("customers")
      .update({ is_active: false })
      .in("id", idsToDeactivate);

    if (updateError) {
      console.error("Error deactivating customers:", updateError);
      throw updateError;
    }

    console.log(`Deactivated ${customersToDeactivate.length} expired subscriptions`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Deactivated ${customersToDeactivate.length} expired subscription(s)`,
        deactivated_count: customersToDeactivate.length,
        deactivated_customers: customersToDeactivate.map((c) => c.name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in auto-deactivate function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
