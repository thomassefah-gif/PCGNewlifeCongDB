import { supabase } from '../supabaseClient';
import type { Group, GroupType, Member } from '../../types/member';

export interface GroupWithCount extends Group {
  description: string | null;
  is_active: boolean;
  member_count: number;
}

export interface ProgramMember {
  id: string;
  member_id: string;
  group_id: string;
  membership_status: 'Active' | 'Inactive';
  is_primary: boolean;
  joined_at: string | null;
  members: Member;
}

export type GroupMembershipFilter = 'ALL' | 'Active' | 'Inactive';

async function attachActiveCounts(groups: Array<Omit<GroupWithCount, 'member_count'>>): Promise<GroupWithCount[]> {
  if (!groups.length) return [];
  return Promise.all(groups.map(async (group) => {
    const { count, error } = await supabase
      .from('member_groups')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .eq('membership_status', 'Active');
    if (error) throw error;
    return { ...group, member_count: count ?? 0 };
  }));
}

export async function getGroupsByType(groupType: string): Promise<GroupWithCount[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id,name,description,group_type,is_active')
    .eq('group_type', groupType)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return attachActiveCounts((data ?? []) as Omit<GroupWithCount, 'member_count'>[]);
}

export async function getAllGroupsWithCounts(): Promise<GroupWithCount[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id,name,description,group_type,is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return attachActiveCounts((data ?? []) as Omit<GroupWithCount, 'member_count'>[]);
}

export async function getGroupById(id: string): Promise<GroupWithCount> {
  const { data, error } = await supabase
    .from('groups')
    .select('id,name,description,group_type,is_active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Group not found.');
  const [group] = await attachActiveCounts([data as Omit<GroupWithCount, 'member_count'>]);
  return group;
}

export async function createGroup(data: { name: string; description?: string; group_type: string }): Promise<string> {
  const { data: created, error } = await supabase
    .from('groups')
    .insert({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      group_type: data.group_type as GroupType,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

export async function updateGroup(id: string, data: { name: string; description?: string }): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ name: data.name.trim(), description: data.description?.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

export async function getProgramMembers(
  groupId: string,
  search = '',
  status: GroupMembershipFilter = 'ALL',
): Promise<ProgramMember[]> {
  let query = supabase
    .from('member_groups')
    .select('id,member_id,group_id,membership_status,is_primary,joined_at,members!inner(id,title,surname,first_name,sex,date_of_birth,mobile_phone,residential_phone,email,status,is_distant_member,date_joined_new_life,created_at)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: false });

  if (status !== 'ALL') query = query.eq('membership_status', status);
  const term = search.trim().replace(/[(),]/g, ' ');
  if (term) {
    query = query.or(
      `first_name.ilike.%${term}%,surname.ilike.%${term}%,email.ilike.%${term}%,mobile_phone.ilike.%${term}%`,
      { referencedTable: 'members' },
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    members: Array.isArray(row.members) ? row.members[0] : row.members,
  })) as unknown as ProgramMember[];
}

export async function addMemberToGroup(groupId: string, memberId: string, isPrimary = false): Promise<void> {
  const { error } = await supabase.from('member_groups').upsert({
    group_id: groupId,
    member_id: memberId,
    membership_status: 'Active',
    is_primary: isPrimary,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'member_id,group_id' });
  if (error) throw error;
}

export async function updateGroupMembership(memberGroupId: string, status: string): Promise<void> {
  if (status !== 'Active' && status !== 'Inactive') throw new Error('Invalid group membership status.');
  const { error } = await supabase
    .from('member_groups')
    .update({ membership_status: status })
    .eq('id', memberGroupId);
  if (error) throw error;
}

export async function removeMemberFromGroup(groupId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('member_groups')
    .delete()
    .eq('group_id', groupId)
    .eq('member_id', memberId);
  if (error) throw error;
}
