import { addYears, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { calculateAge } from '../date';
import { supabase } from '../supabaseClient';
import type { GroupType, Member } from '../../types/member';

export interface DashboardDateRange {
  from?: string;
  to?: string;
}

export interface DashboardMetrics {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  distantMembers: number;
  residentMembers: number;
  newMembers: number;
}

export interface GroupDistribution {
  generational: Array<{ name: string; count: number }>;
  interest: Array<{ name: string; count: number }>;
  family: Array<{ name: string; count: number }>;
}

export interface BirthdayMember extends Member {
  age_turning: number | null;
  birthday_date: string;
}

const dashboardMemberColumns = 'id,title,surname,first_name,sex,date_of_birth,mobile_phone,residential_phone,email,status,is_distant_member,date_joined_new_life,created_at';

async function getMemberIdsInRange(range: DashboardDateRange): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('members').select('id').order('id', { ascending: true });
    if (range.from) query = query.gte('date_joined_new_life', range.from);
    if (range.to) query = query.lte('date_joined_new_life', range.to);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    ids.push(...rows.map((row) => row.id as string));
    if (rows.length < pageSize) return ids;
  }
}

export async function getDashboardMetrics(dateRange: DashboardDateRange = {}): Promise<DashboardMetrics> {
  const count = async (filter: { status?: 'Active' | 'Inactive'; isDistant?: boolean } = {}): Promise<number> => {
    let query = supabase.from('members').select('id', { count: 'exact', head: true });
    if (dateRange.from) query = query.gte('date_joined_new_life', dateRange.from);
    if (dateRange.to) query = query.lte('date_joined_new_life', dateRange.to);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.isDistant !== undefined) query = query.eq('is_distant_member', filter.isDistant);
    const { count: total, error } = await query;
    if (error) throw error;
    return total ?? 0;
  };

  const [totalMembers, activeMembers, inactiveMembers, distantMembers, residentMembers] = await Promise.all([
    count(),
    count({ status: 'Active' }),
    count({ status: 'Inactive' }),
    count({ isDistant: true }),
    count({ isDistant: false }),
  ]);
  return {
    totalMembers,
    activeMembers,
    inactiveMembers,
    distantMembers,
    residentMembers,
    newMembers: totalMembers,
  };
}

export async function getGroupDistributionMetrics(dateRange: DashboardDateRange = {}): Promise<GroupDistribution> {
  const memberIds = await getMemberIdsInRange(dateRange);
  const groupsByType = new Map<GroupType, Map<string, number>>([
    ['generational', new Map()],
    ['interest', new Map()],
    ['family', new Map()],
  ]);
  if (!memberIds.length) return { generational: [], interest: [], family: [] };

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id,name,group_type')
    .eq('is_active', true)
    .in('group_type', ['generational', 'interest', 'family']);
  if (groupsError) throw groupsError;
  const groupById = new Map((groups ?? []).map((group) => [group.id as string, group]));
  const groupIds = [...groupById.keys()];
  if (!groupIds.length) return { generational: [], interest: [], family: [] };

  const chunkSize = 300;
  for (let start = 0; start < memberIds.length; start += chunkSize) {
    const chunk = memberIds.slice(start, start + chunkSize);
    const { data, error } = await supabase
      .from('member_groups')
      .select('group_id,member_id')
      .in('member_id', chunk)
      .in('group_id', groupIds)
      .eq('membership_status', 'Active');
    if (error) throw error;
    for (const membership of data ?? []) {
      const group = groupById.get(membership.group_id as string);
      if (!group) continue;
      const type = group.group_type as GroupType;
      const counts = groupsByType.get(type);
      if (counts) counts.set(group.name as string, (counts.get(group.name as string) ?? 0) + 1);
    }
  }

  return {
    generational: [...(groupsByType.get('generational') ?? new Map()).entries()].map(([name, count]) => ({ name, count })),
    interest: [...(groupsByType.get('interest') ?? new Map()).entries()].map(([name, count]) => ({ name, count })),
    family: [...(groupsByType.get('family') ?? new Map()).entries()].map(([name, count]) => ({ name, count })),
  };
}

async function getAllActiveBirthdays(): Promise<Member[]> {
  const result: Member[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('members')
      .select(dashboardMemberColumns)
      .eq('status', 'Active')
      .not('date_of_birth', 'is', null)
      .order('surname', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Member[];
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
}

function getUpcomingBirthdayDate(dateOfBirth: string, now: Date): Date {
  const birthday = parseISO(dateOfBirth);
  let nextBirthday = new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate());
  if (differenceInCalendarDays(nextBirthday, now) < 0) nextBirthday = addYears(nextBirthday, 1);
  return nextBirthday;
}

function mapBirthday(member: Member, birthdayDate: Date, now: Date): BirthdayMember {
  const currentAge = calculateAge(member.date_of_birth);
  const ageTurning = currentAge === null ? null : currentAge + (differenceInCalendarDays(birthdayDate, now) > 0 ? 1 : 0);
  return { ...member, age_turning: ageTurning, birthday_date: format(birthdayDate, 'yyyy-MM-dd') };
}

export async function getBirthdays(): Promise<{ today: BirthdayMember[]; upcoming: BirthdayMember[] }> {
  const now = new Date();
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();
  const activeMembers = await getAllActiveBirthdays();
  const birthdays = activeMembers.flatMap((member) => {
    if (!member.date_of_birth) return [];
    const date = parseISO(member.date_of_birth);
    if (!Number.isFinite(date.getTime())) return [];
    const nextDate = getUpcomingBirthdayDate(member.date_of_birth, now);
    const daysUntil = differenceInCalendarDays(nextDate, now);
    return [{ member, date, nextDate, daysUntil }];
  });

  const today = birthdays
    .filter(({ date }) => date.getMonth() === todayMonth && date.getDate() === todayDay)
    .map(({ member, nextDate }) => mapBirthday(member, nextDate, now));
  const upcoming = birthdays
    .filter(({ daysUntil }) => daysUntil > 0 && daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil || (a.member.surname ?? '').localeCompare(b.member.surname ?? ''))
    .map(({ member, nextDate }) => mapBirthday(member, nextDate, now));
  return { today, upcoming };
}

export async function getRecentContacts(limit = 10): Promise<Member[]> {
  const run = async (columns: string) => await supabase
    .from('members')
    .select(columns)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit));
  // Photo columns may be missing or not granted, so retry without them.
  let { data, error } = await run(`${dashboardMemberColumns},photo_url,passport_picture`);
  if (error) ({ data, error } = await run(`${dashboardMemberColumns},photo_url`));
  if (error) ({ data, error } = await run(dashboardMemberColumns));
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
}
