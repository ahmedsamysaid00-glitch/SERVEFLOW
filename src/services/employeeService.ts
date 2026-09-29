import { supabase } from '@/supabase/client';
import type { MemberRole } from '@/types';

export interface EmployeeInvitationResult {
  restaurant_id: string;
  branch_id: string;
  email: string;
  full_name: string;
  role: MemberRole;
  status: 'invited';
  has_account: boolean;
}

export interface InvitationResponse {
  success: boolean;
  message: string;
  warning?: string;
  error?: string;
  error_detail?: string;
  membership?: EmployeeInvitationResult;
}

function getRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  return '/';
}

async function callInviteFunction(
  payload: Record<string, unknown>
): Promise<{ data: InvitationResponse | null; error: string | null }> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-employee`;
    const { data: session } = await supabase.auth.getSession();

    if (!session.session?.access_token) {
      return { data: null, error: 'Your session has expired. Please sign in again.' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    const body: InvitationResponse = await response.json().catch(() => null);
    if (!body) {
      return { data: null, error: 'We couldn\u2019t send the invitation. Please try again.' };
    }

    if (!response.ok) {
      return { data: null, error: body.error ?? 'We couldn\u2019t send the invitation. Please try again.' };
    }

    if (body.warning === 'email_failed') {
      const detail = body.error_detail ? ` (${body.error_detail})` : '';
      return { data: null, error: `Invitation email could not be sent.${detail}` };
    }

    if (!body.success) {
      return { data: null, error: body.error ?? 'We couldn\u2019t send the invitation. Please try again.' };
    }

    return { data: body, error: null };
  } catch {
    return { data: null, error: 'We couldn\u2019t send the invitation. Please try again.' };
  }
}

export async function createEmployeeInvitation(
  email: string,
  fullName: string,
  role: MemberRole,
  branchId: string
): Promise<{ data: InvitationResponse | null; error: string | null }> {
  return callInviteFunction({
    email,
    full_name: fullName,
    role,
    branch_id: branchId,
    redirect_url: getRedirectUrl(),
  });
}

export async function resendInvitation(
  memberId: string
): Promise<{ data: InvitationResponse | null; error: string | null }> {
  return callInviteFunction({
    action: 'resend',
    member_id: memberId,
    redirect_url: getRedirectUrl(),
  });
}
