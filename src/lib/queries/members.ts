import { supabase } from '../supabaseClient';
import type { Group, Member, MemberFilters, MemberFormInput, MemberProfile, MemberRelationship } from '../../types/member';

const memberColumns = 'id,member_code,title,surname,first_name,maiden_name,marriage_type,spouse_name,spouse_phone,spouse_postal_address,children_names,children_contacts,sex,date_of_birth,mobile_phone,residential_phone,email,status,is_distant_member,date_joined_new_life,created_at';

export async function getMembers(filters: MemberFilters = {}): Promise<{ members: Member[]; totalCount: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.pageSize ?? 25);
  const start = (page - 1) * pageSize;
  let query = supabase
    .from('members')
    .select(`${memberColumns},member_groups(membership_status,groups(name))`, { count: 'exact' })
    .order('surname', { ascending: true })
    .order('first_name', { ascending: true });

  if (filters.search?.trim()) {
    const search = filters.search.trim().replace(/[(),]/g, ' ');
    query = query.or(`first_name.ilike.%${search}%,surname.ilike.%${search}%,email.ilike.%${search}%,mobile_phone.ilike.%${search}%`);
  }
  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status);
  if (filters.distant === 'DISTANT') query = query.eq('is_distant_member', true);
  if (filters.distant === 'NON_DISTANT') query = query.eq('is_distant_member', false);

  if (filters.groupId && filters.groupId !== 'ALL') {
    const { data: memberships, error: membershipError } = await supabase
      .from('member_groups')
      .select('member_id')
      .eq('group_id', filters.groupId)
      .eq('membership_status', 'Active');
    if (membershipError) throw membershipError;
    const memberIds = [...new Set((memberships ?? []).map((row) => row.member_id as string))];
    if (memberIds.length === 0) return { members: [], totalCount: 0 };
    query = query.in('id', memberIds);
  }

  try {
    const { data, error, count } = await query.range(start, start + pageSize - 1);
    if (error) throw new Error(error.message || error.details || String(error));

    const rows = ((data as any[]) || []).map((row) => {
      const { member_groups: memberGroups, ...member } = row;
      const groups = ((memberGroups as any[]) || [])
        .filter((mg) => mg?.membership_status !== 'Inactive')
        .map((mg) => mg?.groups?.name)
        .filter((name): name is string => Boolean(name));
      return { ...member, groups } as Member;
    });
    return { members: rows, totalCount: count ?? 0 };
  } catch (err) {
    const e = err as { message?: string; details?: string } | null;
    throw new Error(e?.message || e?.details || String(err));
  }
}

/** Retrieve the full member set for the unfiltered directory CSV export. */
export async function getAllMembers(): Promise<Member[]> {
  const pageSize = 1000;
  const allMembers: Member[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('members')
      .select(memberColumns)
      .order('surname', { ascending: true })
      .order('first_name', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Member[];
    allMembers.push(...rows);
    if (rows.length < pageSize) return allMembers;
  }
}

export async function getAllGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id,name,group_type')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Group[];
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw error;
}

const memberPayloadColumns = [
  'title', 'title_other', 'member_code', 'spouse_name', 'spouse_phone', 'spouse_postal_address', 'children_names', 'children_contacts', 'surname', 'first_name', 'maiden_name', 'sex', 'date_of_birth',
  'date_of_birth_is_estimated', 'communicant_status', 'marital_status', 'marriage_type',
  'profession', 'occupation', 'special_interests', 'home_town', 'place_of_birth', 'nationality',
  'residence_area', 'residence_description', 'house_number', 'street_name', 'postal_address',
  'mobile_phone', 'residential_phone', 'email', 'status', 'is_distant_member',
  'date_joined_new_life', 'photo_url', 'admin_notes', 'emergency_contact_name', 'emergency_contact_phone',
] as const;

type MemberInputWithAdminNotes = MemberFormInput & { admin_notes?: string | null };

function toMemberPayload(input: MemberInputWithAdminNotes) {
  const isYouth = ['Children Service', 'Junior Youth (JY)'].includes(input.primary_group_name);
  const nullableText = (value: string) => value.trim() || null;
  return {
    title: nullableText(input.title),
    title_other: nullableText(input.title_other),
    surname: input.surname.trim(),
    member_code: input.member_code?.trim() || null,
    first_name: input.first_name.trim(),
    maiden_name: nullableText(input.maiden_name),
    sex: input.sex,
    date_of_birth: input.date_of_birth,
    date_of_birth_is_estimated: input.date_of_birth_is_estimated,
    communicant_status: input.communicant_status || null,
    marital_status: isYouth ? null : input.marital_status || null,
    marriage_type: isYouth || input.marital_status !== 'Married' ? null : input.marriage_type || null,
    profession: isYouth ? null : nullableText(input.profession),
    spouse_name: isYouth || input.marital_status !== 'Married' ? null : input.spouse_name?.trim() || null,
    spouse_phone: isYouth || input.marital_status !== 'Married' ? null : input.spouse_phone?.trim() || null,
    spouse_postal_address: isYouth || input.marital_status !== 'Married' ? null : input.spouse_postal_address?.trim() || null,
    children_names: isYouth ? null : input.children_names?.trim() || null,
    children_contacts: isYouth ? null : input.children_contacts?.trim() || null,
    occupation: isYouth ? null : nullableText(input.occupation),
    special_interests: nullableText(input.special_interests),
    home_town: nullableText(input.home_town),
    place_of_birth: nullableText(input.place_of_birth),
    nationality: nullableText(input.nationality),
    residence_area: nullableText(input.residence_area),
    residence_description: nullableText(input.residence_description),
    house_number: nullableText(input.house_number),
    street_name: nullableText(input.street_name),
    postal_address: nullableText(input.postal_address),
    mobile_phone: nullableText(input.mobile_phone),
    residential_phone: nullableText(input.residential_phone),
    email: nullableText(input.email),
    status: input.status,
    is_distant_member: input.is_distant_member,
    date_joined_new_life: nullableText(input.date_joined_new_life),
    photo_url: nullableText(input.photo_url),
    ...(input.admin_notes !== undefined ? { admin_notes: nullableText(input.admin_notes ?? '') } : {}),
    emergency_contact_name: nullableText(input.emergency_contact_name),
    emergency_contact_phone: nullableText(input.emergency_contact_phone),
  } satisfies Partial<Record<(typeof memberPayloadColumns)[number], unknown>>;
}

function selectedGroupIds(input: MemberFormInput): string[] {
  return [...new Set([
    input.primary_group_id,
    input.family_group_id,
    ...input.interest_group_ids,
  ].filter(Boolean))];
}

export async function syncMemberGroups(memberId: string, groupIds: string[], primaryGroupId = ''): Promise<void> {
  const uniqueIds = [...new Set(groupIds.filter(Boolean))];
  const { data: currentRows, error: currentError } = await supabase
    .from('member_groups')
    .select('group_id,membership_status,joined_at')
    .eq('member_id', memberId);
  if (currentError) throw currentError;

  const currentIds = (currentRows ?? [])
    .filter((row) => row.membership_status === 'Active')
    .map((row) => row.group_id as string);
  const removedIds = currentIds.filter((id) => !uniqueIds.includes(id));
  if (removedIds.length) {
    const { error } = await supabase.from('member_groups').delete().eq('member_id', memberId).in('group_id', removedIds);
    if (error) throw error;
  }

  if (uniqueIds.length) {
    const { error } = await supabase.from('member_groups').upsert(
      uniqueIds.map((groupId) => {
        const existing = currentRows?.find((row) => row.group_id === groupId);
        return {
          member_id: memberId,
          group_id: groupId,
          membership_status: 'Active',
          is_primary: groupId === primaryGroupId,
          joined_at: existing?.joined_at ?? new Date().toISOString(),
        };
      }),
      { onConflict: 'member_id,group_id' },
    );
    if (error) throw error;
  }
}

export async function addMemberToGroup(memberId: string, groupId: string): Promise<void> {
  const { error } = await supabase.from('member_groups').upsert({
    member_id: memberId,
    group_id: groupId,
    membership_status: 'Active',
    is_primary: false,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'member_id,group_id' });
  if (error) throw error;
}

export async function removeMemberFromGroup(memberId: string, groupId: string): Promise<void> {
  const { error } = await supabase.from('member_groups').delete().eq('member_id', memberId).eq('group_id', groupId);
  if (error) throw error;
}

async function syncMemberSacraments(memberId: string, input: MemberFormInput): Promise<void> {
  const details = {
    baptism_date: input.baptism_date || null,
    baptised_by: input.baptised_by.trim() || null,
    confirmation_date: input.confirmation_date || null,
    local_congregation: input.local_congregation.trim() || null,
    district: input.district.trim() || null,
    presbytery: input.presbytery.trim() || null,
    memory_verse: input.memory_verse.trim() || null,
  };
  const hasDetails = Object.values(details).some(Boolean);
  if (!hasDetails) {
    const { error } = await supabase.from('member_sacraments').delete().eq('member_id', memberId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('member_sacraments').upsert(
    { member_id: memberId, ...details },
    { onConflict: 'member_id' },
  );
  if (error) throw error;
}

async function syncParentRelationship(memberId: string, input: MemberFormInput): Promise<void> {
  const { error: deleteError } = await supabase
    .from('member_relationships')
    .delete()
    .eq('member_id', memberId)
    .in('relationship_type', ['parent', 'guardian']);
  if (deleteError) throw deleteError;
  if (!['Children Service', 'Junior Youth (JY)'].includes(input.primary_group_name)) return;
  if (!input.parent_member_id) return;

  const { error } = await supabase.from('member_relationships').insert({
    member_id: memberId,
    related_member_id: input.parent_member_id,
    relationship_type: input.parent_relationship_type,
    is_primary: true,
    notes: null,
  });
  if (error) throw error;
}

async function syncSpouseContact(memberId: string, input: MemberFormInput): Promise<void> {
  const { error: deleteError } = await supabase
    .from('member_family_contacts')
    .delete()
    .eq('member_id', memberId)
    .eq('relationship_type', 'spouse');
  if (deleteError) throw deleteError;
  if (input.marital_status !== 'Married' || ['Children Service', 'Junior Youth (JY)'].includes(input.primary_group_name)) return;

  const fullName = input.spouse_name.trim();
  const postalAddress = input.spouse_postal_address.trim();
  const contactNumber = input.spouse_phone.trim();
  if (!fullName) return;
  const { error } = await supabase.from('member_family_contacts').insert({
    member_id: memberId,
    relationship_type: 'spouse',
    full_name: fullName,
    postal_address: postalAddress || null,
    contact_number: contactNumber || null,
    email: null,
    notes: null,
  });
  if (error) throw error;
}

export async function getMemberById(id: string, includeAdminNotes = false): Promise<MemberProfile> {
  const memberColumns = [
    'id', 'member_code', 'spouse_name', 'spouse_phone', 'spouse_postal_address', 'children_names', 'children_contacts', 'title', 'title_other', 'surname', 'first_name', 'maiden_name', 'sex', 'date_of_birth',
    'date_of_birth_is_estimated', 'communicant_status', 'marital_status', 'marriage_type', 'profession',
    'occupation', 'special_interests', 'home_town', 'place_of_birth', 'nationality', 'residence_area',
    'residence_description', 'house_number', 'street_name', 'postal_address', 'residential_phone',
    'mobile_phone', 'residential_phone', 'emergency_contact_name', 'emergency_contact_phone', 'photo_url', 'email', 'status',
    'is_distant_member', 'date_joined_new_life', 'date_joined_pcg',
    'date_joined_new_life_is_estimated', 'date_joined_pcg_is_estimated', 'created_at',
    ...(includeAdminNotes ? ['admin_notes'] : []),
  ].join(',');

  // Fetch the member separately: nested PostgREST joins are not required to get
  // the profile shell and can otherwise make the whole profile unavailable.
  const { data: baseMember, error: memberError } = await supabase
    .from('members')
    .select(memberColumns)
    .eq('id', id)
    .maybeSingle();
  if (memberError) {
    console.error('Error fetching member:', memberError);
    throw new Error(`Member query failed: ${memberError.message}`);
  }
  if (!baseMember) throw new Error('Member not found.');

  const [groupResult, sacramentResult, outgoingResult, incomingResult, familyResult, customValueResult] = await Promise.all([
    supabase.from('member_groups').select('*').eq('member_id', id),
    supabase.from('member_sacraments').select('*').eq('member_id', id).maybeSingle(),
    supabase.from('member_relationships').select('*').eq('member_id', id),
    supabase.from('member_relationships').select('*').eq('related_member_id', id),
    supabase.from('member_family_contacts').select('*').eq('member_id', id),
    supabase.from('member_custom_field_values').select('*').eq('member_id', id),
  ]);

  const rawGroups = groupResult.data ?? [];
  const groupIds = [...new Set(rawGroups.map((membership) => membership.group_id as string))];
  let groupsById = new Map<string, Group>();
  if (groupIds.length) {
    const { data: groups } = await supabase.from('groups').select('id,name,group_type').in('id', groupIds);
    groupsById = new Map((groups ?? []).map((group) => [group.id as string, group as Group]));
  }
  const memberGroups = rawGroups.map((membership) => ({
    ...membership,
    groups: groupsById.get(membership.group_id as string) ?? null,
  })) as unknown as MemberProfile['member_groups'];

  const rawRelationships = [
    ...(outgoingResult.data ?? []).map((relationship) => ({ ...relationship, direction: 'outgoing' as const, relatedId: relationship.related_member_id as string })),
    ...(incomingResult.data ?? []).map((relationship) => ({ ...relationship, direction: 'incoming' as const, relatedId: relationship.member_id as string })),
  ];
  const relatedIds = [...new Set(rawRelationships.map((relationship) => relationship.relatedId).filter((relatedId) => relatedId !== id))];
  let relatedMembersById = new Map<string, MemberRelationship['related_member']>();
  if (relatedIds.length) {
    const { data: relatedMembers } = await supabase
      .from('members')
      .select('id,title,first_name,surname,email,mobile_phone')
      .in('id', relatedIds);
    relatedMembersById = new Map((relatedMembers ?? []).map((relatedMember) => [
      relatedMember.id as string,
      relatedMember as MemberRelationship['related_member'],
    ]));
  }
  const relationships = rawRelationships.map(({ relatedId, ...relationship }) => ({
    ...relationship,
    related_member: relatedMembersById.get(relatedId) ?? null,
  })) as MemberRelationship[];

  const rawCustomValues = customValueResult.data ?? [];
  const customFieldIds = [...new Set(rawCustomValues.map((value) => value.field_id as string))];
  let customFieldsById = new Map<string, Record<string, unknown>>();
  if (customFieldIds.length) {
    const { data: customFields } = await supabase.from('custom_fields').select('*').in('id', customFieldIds);
    customFieldsById = new Map((customFields ?? []).map((field) => [field.id as string, field as Record<string, unknown>]));
  }
  const customFieldValues = rawCustomValues.map((value) => ({
    ...value,
    custom_fields: customFieldsById.get(value.field_id as string) ?? null,
  }));
  const sacraments = sacramentResult.data as MemberProfile['member_sacraments'] | null;
  const familyContacts = (familyResult.data ?? []) as MemberProfile['member_family_contacts'];

  return {
    ...(baseMember as unknown as MemberProfile),
    member_groups: memberGroups,
    member_sacraments: sacraments,
    member_relationships: relationships,
    member_family_contacts: familyContacts,
    sacraments,
    relationships,
    family_contacts: familyContacts,
    custom_field_values: customFieldValues,
  };
}

export async function createMember(input: MemberFormInput): Promise<string> {
  const { data, error } = await supabase.from('members').insert(toMemberPayload(input)).select('id').single();
  if (error) throw error;
  const memberId = data.id as string;

  try {
    await syncMemberGroups(memberId, selectedGroupIds(input), input.primary_group_id);
    await syncMemberSacraments(memberId, input);
    await syncParentRelationship(memberId, input);
    await syncSpouseContact(memberId, input);
  } catch (error) {
    await Promise.allSettled([
      supabase.from('member_groups').delete().eq('member_id', memberId),
      supabase.from('member_sacraments').delete().eq('member_id', memberId),
      supabase.from('member_relationships').delete().eq('member_id', memberId),
      supabase.from('member_family_contacts').delete().eq('member_id', memberId),
      supabase.from('members').delete().eq('id', memberId),
    ]);
    throw error;
  }
  return memberId;
}

export async function updateMember(id: string, input: MemberFormInput): Promise<void>;
export async function updateMember(id: string, input: Partial<Pick<Member, 'admin_notes' | 'photo_url'>>): Promise<void>;
export async function updateMember(
  id: string,
  input: MemberFormInput | Partial<Pick<Member, 'admin_notes' | 'photo_url'>>,
): Promise<void> {
  if (!('first_name' in input)) {
    const { error } = await supabase.from('members').update(input).eq('id', id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('members').update(toMemberPayload(input)).eq('id', id);
  if (error) throw error;

  await syncMemberGroups(id, selectedGroupIds(input), input.primary_group_id);
  await syncMemberSacraments(id, input);
  await syncParentRelationship(id, input);
  await syncSpouseContact(id, input);
}

export async function searchMembers(
  term: string,
  limit = 10,
): Promise<Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone' | 'status' | 'date_of_birth'>[]> {
  const search = term.trim();
  if (search.length < 2) return [];
  const safeSearch = search.replace(/[(),]/g, ' ');
  const { data, error } = await supabase
    .from('members')
    .select('id,title,first_name,surname,email,mobile_phone,status,date_of_birth')
    .or(`first_name.ilike.%${safeSearch}%,surname.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,mobile_phone.ilike.%${safeSearch}%`)
    .limit(Math.max(1, limit));
  if (error) throw error;
  return (data ?? []) as Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone' | 'status' | 'date_of_birth'>[];
}
