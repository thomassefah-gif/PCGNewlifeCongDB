import { supabase } from '../supabaseClient';

export interface GroupLeader {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  assigned_group: string | null;
  created_at: string;
}

export const LEADER_GROUPS = [
  'Children Service',
  'Junior Youth (JY)',
  "Young People's Guild (YPG)",
  'Young Adults Fellowship (YAF)',
  "Women's Fellowship",
  "Men's Fellowship",
] as const;

// RPCs may return a JSON { success, error } payload instead of raising.
function assertRpcResult(data: unknown, error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
  const result = data as { success?: boolean; error?: string } | null;
  if (result && typeof result === 'object' && result.success === false) throw new Error(result.error || fallback);
}

export async function getGroupLeaders(): Promise<GroupLeader[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,is_active,assigned_group,created_at')
    .eq('role', 'group_leader')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GroupLeader[];
}

export async function createGroupLeader(input: { email: string; password: string; fullName: string; assignedGroup: string }): Promise<void> {
  const { data, error } = await supabase.rpc('admin_create_group_leader', {
    p_email: input.email,
    p_password: input.password,
    p_full_name: input.fullName,
    p_assigned_group: input.assignedGroup,
  });
  assertRpcResult(data, error, 'Unable to create group leader.');
}

export async function resetLeaderPassword(userId: string, password: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_reset_leader_password', { p_user_id: userId, p_password: password });
  assertRpcResult(data, error, 'Unable to reset password.');
}

export async function toggleLeaderActive(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_toggle_leader_active', { p_user_id: userId });
  assertRpcResult(data, error, 'Unable to update leader status.');
}

export async function deleteLeader(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_delete_leader', { p_user_id: userId });
  assertRpcResult(data, error, 'Unable to delete leader.');
}
