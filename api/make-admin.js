import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { error } =
      await supabaseAdmin.auth.admin.updateUserById(
        "87ddf154-0758-4ce7-a8e3-74c3b3168fb2",
        { user_metadata: { role: "admin" } }
      );

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Admin role assigned"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
