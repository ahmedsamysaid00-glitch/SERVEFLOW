import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteRequest {
  email: string;
  full_name: string;
  role: string;
  branch_id: string;
  redirect_url?: string;
}

interface ResendRequest {
  member_id: string;
  redirect_url?: string;
}

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[invite-employee] rejected: missing authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.log("[invite-employee] rejected: caller not authenticated");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const action = (body as { action?: string }).action ?? "create";

    // ─── Resend path ─────────────────────────────────────────────
    // Re-sends the invitation email for an existing invited membership
    // without creating a duplicate. The caller must be an active owner
    // of the same restaurant. Only memberships with status='invited'
    // and user_id IS NULL can be resent.
    if (action === "resend") {
      const { member_id, redirect_url } = body as ResendRequest;
      if (!member_id) {
        console.log("[invite-employee] resend rejected: missing member_id");
        return new Response(
          JSON.stringify({ error: "Missing member_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`[invite-employee] resend request: caller=${user.id} member=${member_id}`);

      // Fetch the membership — RLS ensures the caller can only see members
      // of their own restaurant. We further verify ownership via RPC below.
      const { data: member, error: memberError } = await userClient
        .from("restaurant_members")
        .select("id, restaurant_id, invite_email, role, status, user_id")
        .eq("id", member_id)
        .maybeSingle();

      if (memberError || !member) {
        console.log(`[invite-employee] resend failed: member not found`);
        return new Response(
          JSON.stringify({ error: "Invitation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const m = member as {
        id: string;
        restaurant_id: string;
        invite_email: string | null;
        role: string;
        status: string;
        user_id: string | null;
      };

      if (m.status !== "invited" || m.user_id !== null || !m.invite_email) {
        console.log(`[invite-employee] resend failed: member is not in a resendable state (status=${m.status} user_id=${m.user_id})`);
        return new Response(
          JSON.stringify({ error: "This invitation is no longer resendable" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Verify caller is an active owner of this restaurant
      const { data: ownerCheck, error: ownerError } = await userClient
        .from("restaurant_members")
        .select("id")
        .eq("restaurant_id", m.restaurant_id)
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("status", "active")
        .maybeSingle();

      if (ownerError || !ownerCheck) {
        console.log(`[invite-employee] resend rejected: caller is not an owner of this restaurant`);
        return new Response(
          JSON.stringify({ error: "Only restaurant owners can resend invitations" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cleanEmail = m.invite_email.toLowerCase().trim();
      const redirectTo = redirect_url || `${supabaseUrl}/auth/v1/verify`;

      console.log(`[invite-employee] resend: email=${cleanEmail} redirect=${redirectTo}`);

      // Check if the invitee now has an auth account (e.g. signed up independently)
      const { data: existingUser } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      let hasAccount = false;
      if (existingUser) {
        const users = (existingUser as { users?: Array<{ email?: string }> }).users ?? [];
        hasAccount = users.some((u) => u.email?.toLowerCase() === cleanEmail);
      }

      let inviteError: { message: string; name?: string; status?: number } | null = null;
      let createdUserId: string | null = null;

      if (hasAccount) {
        console.log(`[invite-employee] resend: existing user, sending magic link`);
        const { data, error } = await adminClient.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            emailRedirectTo: redirectTo,
            shouldCreateUser: false,
          },
        });
        createdUserId = (data as { user?: { id?: string } | null })?.user?.id ?? null;
        if (error) {
          inviteError = { message: error.message, name: error.name, status: (error as { status?: number }).status };
        }
      } else {
        console.log(`[invite-employee] resend: new user, calling inviteUserByEmail`);
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
          cleanEmail,
          {
            redirectTo: redirectTo,
            data: {
              invited_role: m.role,
            },
          },
        );
        createdUserId = (data as { user?: { id?: string } | null })?.user?.id ?? null;
        if (error) {
          inviteError = { message: error.message, name: error.name, status: (error as { status?: number }).status };
        }
      }

      console.log(
        `[invite-employee] resend auth API response: error=${inviteError ? "yes" : "no"} ` +
        `errorMsg=${inviteError?.message ?? "n/a"} ` +
        `userId=${createdUserId ?? "null"}`,
      );

      if (inviteError) {
        return new Response(
          JSON.stringify({
            warning: "email_failed",
            message: "Invitation email could not be sent.",
            error_detail: inviteError.message,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!hasAccount && !createdUserId) {
        return new Response(
          JSON.stringify({
            warning: "email_failed",
            message: "Invitation email could not be sent. The email provider may not be configured.",
            error_detail: "Auth API returned success but no user was created. Check Supabase Auth email/SMTP configuration.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`[invite-employee] resend success: email sent to ${cleanEmail}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Invitation email resent successfully.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Create path (original) ──────────────────────────────────
    const { email, full_name, role, branch_id, redirect_url } = body as InviteRequest;

    if (!email || !full_name || !role || !branch_id) {
      console.log("[invite-employee] rejected: missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    console.log(
      `[invite-employee] request received: caller=${user.id} email=${cleanEmail} role=${role} branch=${branch_id}`,
    );

    const { data: rpcResult, error: rpcError } = await userClient.rpc(
      "create_employee_invitation",
      {
        p_email: cleanEmail,
        p_full_name: full_name,
        p_role: role,
        p_branch_id: branch_id,
      },
    );

    if (rpcError) {
      console.log(`[invite-employee] RPC failed: code=${rpcError.code} message=${rpcError.message}`);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[invite-employee] RPC success: membership created for ${cleanEmail}`);

    const hasAccount = (rpcResult as { has_account?: boolean })?.has_account === true;
    const redirectTo = redirect_url || `${supabaseUrl}/auth/v1/verify`;

    console.log(`[invite-employee] redirect_url=${redirectTo} has_account=${hasAccount}`);

    let inviteError: { message: string; name?: string; status?: number } | null = null;
    let inviteData: { user?: { id?: string } | null } | null = null;

    if (hasAccount) {
      console.log(`[invite-employee] existing user, sending magic link to ${cleanEmail}`);
      const { data, error } = await adminClient.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      inviteData = data as { user?: { id?: string } | null } | null;
      if (error) {
        inviteError = { message: error.message, name: error.name, status: (error as { status?: number }).status };
      }
    } else {
      console.log(`[invite-employee] new user, calling admin.inviteUserByEmail for ${cleanEmail}`);
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          redirectTo: redirectTo,
          data: {
            full_name: full_name,
            invited_role: role,
          },
        },
      );
      inviteData = data as { user?: { id?: string } | null } | null;
      if (error) {
        inviteError = { message: error.message, name: error.name, status: (error as { status?: number }).status };
      }
    }

    const createdUserId = (inviteData as { user?: { id?: string } | null })?.user?.id ?? null;
    console.log(
      `[invite-employee] auth API response: error=${inviteError ? "yes" : "no"} ` +
      `errorName=${inviteError?.name ?? "n/a"} ` +
      `errorStatus=${inviteError?.status ?? "n/a"} ` +
      `errorMsg=${inviteError?.message ?? "n/a"} ` +
      `userId=${createdUserId ?? "null"}`,
    );

    if (inviteError) {
      console.log(`[invite-employee] email send failed: ${inviteError.message}`);
      return new Response(
        JSON.stringify({
          warning: "email_failed",
          message: "Employee created, but invitation email could not be sent.",
          error_detail: inviteError.message,
          membership: rpcResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!hasAccount && !createdUserId) {
      console.log(`[invite-employee] WARNING: inviteUserByEmail returned no error but no user was created — email provider may not be configured`);
      return new Response(
        JSON.stringify({
          warning: "email_failed",
          message: "Employee created, but invitation email could not be sent. The email provider may not be configured.",
          error_detail: "Auth API returned success but no user was created. Check Supabase Auth email/SMTP configuration.",
          membership: rpcResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[invite-employee] email send success: invitation sent to ${cleanEmail} userId=${createdUserId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation sent successfully.",
        membership: rpcResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[invite-employee] unexpected error: ${msg}`);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
