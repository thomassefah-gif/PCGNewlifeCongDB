import { supabase } from '../supabaseClient';
import type { UserRole } from '../../types/auth';
import { GENERATIONAL_GROUPS } from '../groupScope';

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

export const ASSIGNABLE_GROUPS = GENERATIONAL_GROUPS;

export async function updateUserAssignedGroup(id: string, assigned_group: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ assigned_group: assigned_group || null }).eq('id', id);
  if (error) throw error;
}

export async function updateUserStatus(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active }).eq('id', id);
  if (error) throw error;
}
