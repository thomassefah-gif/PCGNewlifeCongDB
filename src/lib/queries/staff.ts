import { supabase } from '../supabaseClient';

export interface StaffRecord {
  id: string;
  member_id: string | null;
  full_name: string;
  role_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  is_active: boolean;
}

export type StaffInput = Pick<StaffRecord, 'full_name'> & Partial<Omit<StaffRecord, 'id' | 'full_name'>>;

export async function getStaff(): Promise<StaffRecord[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id,member_id,full_name,role_title,department,email,phone,photo_url,bio,is_active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StaffRecord[];
}

export async function createStaff(input: StaffInput): Promise<void> {
  const { error } = await supabase.from('staff').insert({
    member_id: input.member_id ?? null,
    full_name: input.full_name.trim(),
    role_title: input.role_title?.trim() || null,
    department: input.department?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    photo_url: input.photo_url ?? null,
    bio: input.bio ?? null,
    is_active: input.is_active ?? true,
  });
  if (error) throw error;
}

export async function updateStaff(id: string, input: StaffInput): Promise<void> {
  const { error } = await supabase.from('staff').update({
    member_id: input.member_id ?? null,
    full_name: input.full_name.trim(),
    role_title: input.role_title?.trim() || null,
    department: input.department?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    photo_url: input.photo_url ?? null,
    bio: input.bio ?? null,
    is_active: input.is_active ?? true,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw error;
}
