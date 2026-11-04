import { supabase } from '../supabaseClient';
import type { UserRole } from '../../types/auth';

export interface SystemUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  assigned_group: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUsers(): Promise<SystemUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,is_active,assigned_group,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SystemUser[];
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export const ASSIGNABLE_GROUPS = ['Children Service', 'Junior Youth (JY)', 'YPG', 'YAF', 'Womens Fellowship', 'Mens Fellowship'] as const;

export async function updateUserAssignedGroup(id: string, assigned_group: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ assigned_group: assigned_group || null }).eq('id', id);
  if (error) throw error;
}

export async function createUserAccount(input: { fullName: string; email: string; password: string; role: UserRole; assignedGroup: string }): Promise<void> {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_email: input.email,
    p_password: input.password,
    p_full_name: input.fullName,
    p_role: input.role,
    p_assigned_group: input.assignedGroup || null,
  });
  if (error) throw error;
  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) throw new Error(result?.error ?? 'Unable to create the account.');
}

export async function updateUserStatus(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active }).eq('id', id);
  if (error) throw error;
}
