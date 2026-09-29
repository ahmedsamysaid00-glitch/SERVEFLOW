import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPER_ADMIN_EMAIL = "ahmedsamysaid00@gmail.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json() as { email?: string; password?: string };
    const email = (body.email ?? "").toLowerCase().trim();
    const password = body.password ?? "";

    if (email !== SUPER_ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "This reset endpoint is not available for this email." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up the user via SECURITY DEFINER RPC (reliable for all users)
    const { data: accountData, error: accountError } = await adminClient
      .rpc("get_admin_account_by_email", { p_email: email });

    if (accountError) {
      return new Response(
        JSON.stringify({ error: "Unable to verify account status." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existingAccount = accountData as {
      user_id: string;
      email: string;
      email_confirmed: boolean;
      has_password: boolean;
    } | null;

    if (existingAccount) {
      // User exists — reset password via official Admin API
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        existingAccount.user_id,
        { password },
      );

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to reset password. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Password reset successfully. You can now sign in." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // User does not exist — create it via admin.createUser
    const { error: createError } = await adminClient.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin" },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: "Failed to create account. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Account created and password set successfully. You can now sign in." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[set-initial-password] unexpected error:", msg);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
