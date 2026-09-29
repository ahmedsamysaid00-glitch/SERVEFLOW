import { supabase } from '@/supabase/client';

export interface OwnerWorkspaceResult {
  restaurant_id: string;
  branch_id: string;
  restaurant_name: string;
  branch_name: string;
}

export async function createOwnerWorkspace(
  restaurantName: string,
  branchName: string
): Promise<{ data: OwnerWorkspaceResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_owner_workspace', {
    p_restaurant_name: restaurantName,
    p_branch_name: branchName,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as OwnerWorkspaceResult, error: null };
}
