import { supabase } from '../supabaseClient';
import { logAuditEvent } from './auditlogs';
import {
  type AbsenteeMember,
  type AttendanceRecord,
  type AttendanceSession,
  type AttendanceSessionFilters,
  type AttendanceSessionFormData,
  type AttendanceSummary,
} from '../../types/attendance';

const SUNDAY = 'Sunday Main Service';

function toError(error: { message?: string; details?: string }): Error {
  return new Error(error.message || error.details || String(error));
}

function sessionPayload(input: AttendanceSessionFormData) {
  const male = Math.max(0, Math.floor(Number(input.head_count_male) || 0));
  const female = Math.max(0, Math.floor(Number(input.head_count_female) || 0));
  const children = Math.max(0, Math.floor(Number(input.head_count_children) || 0));
  return {
    session_date: input.session_date,
    service_type: input.service_type,
    title: input.title ?? null,
    head_count_male: male,
    head_count_female: female,
    head_count_children: children,
    total_head_count: male + female + children,
    notes: input.notes ?? null,
  };
}

async function audit(params: Parameters<typeof logAuditEvent>[0]): Promise<void> {
  try {
    await logAuditEvent(params);
  } catch (err) {
    console.error('Audit logging failed', err);
  }
}

export async function fetchAttendanceSessions(filters: AttendanceSessionFilters = {}): Promise<AttendanceSession[]> {
  let query = supabase.from('attendance_sessions').select('*');
  if (filters.serviceType && filters.serviceType !== 'ALL') query = query.eq('service_type', filters.serviceType);
  if (filters.startDate) query = query.gte('session_date', filters.startDate);
  if (filters.endDate) query = query.lte('session_date', filters.endDate);
  const { data, error } = await query.order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000);
  if (error) throw toError(error);
  return (data ?? []) as unknown as AttendanceSession[];
}

export async function fetchAttendanceSummary(): Promise<AttendanceSummary> {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('session_date,head_count_male,head_count_female,head_count_children,total_head_count');
  if (error) throw toError(error);
  const rows = (data ?? []) as unknown as AttendanceSession[];

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let monthTotal = 0;
  let total = 0;
  let children = 0;
  for (const r of rows) {
    total += r.total_head_count;
    children += r.head_count_children;
    if (r.session_date.startsWith(month)) monthTotal += r.total_head_count;
  }
  const adults = total - children;
  return {
    totalSessions: rows.length,
    totalAttendeesThisMonth: monthTotal,
    avgAttendance: rows.length ? Math.round(total / rows.length) : 0,
    childrenVsAdultRatio: adults > 0 ? Math.round((children / adults) * 100) / 100 : 0,
  };
}

export async function createAttendanceSession(
  input: AttendanceSessionFormData,
  userId: string | null,
  userEmail: string | null,
): Promise<AttendanceSession> {
  const payload = { ...sessionPayload(input), created_by: userId ?? null };
  const { data, error } = await supabase.from('attendance_sessions').insert(payload).select('*').single();
  if (error) throw toError(error);
  const created = data as unknown as AttendanceSession;
  await audit({
    action: 'create',
    entity_type: 'attendance_session',
    entity_id: created.id,
    entity_label: `${created.service_type} - ${created.session_date}`,
    changes: { ...payload, performed_by: { userId, userEmail } },
  });
  return created;
}

export async function updateAttendanceSession(
  id: string,
  input: AttendanceSessionFormData,
  userId: string | null,
  userEmail: string | null,
): Promise<void> {
  const payload = { ...sessionPayload(input), updated_at: new Date().toISOString() };
  const { error } = await supabase.from('attendance_sessions').update(payload).eq('id', id);
  if (error) throw toError(error);
  await audit({
    action: 'update',
    entity_type: 'attendance_session',
    entity_id: id,
    entity_label: `${payload.service_type} - ${payload.session_date}`,
    changes: { ...payload, performed_by: { userId, userEmail } },
  });
}

export async function deleteAttendanceSession(id: string, userId: string | null, userEmail: string | null): Promise<void> {
  const { data: existing } = await supabase.from('attendance_sessions').select('service_type,session_date').eq('id', id).maybeSingle();
  const { error } = await supabase.from('attendance_sessions').delete().eq('id', id);
  if (error) throw toError(error);
  await audit({
    action: 'delete',
    entity_type: 'attendance_session',
    entity_id: id,
    entity_label: existing ? `${existing.service_type} - ${existing.session_date}` : undefined,
    changes: { performed_by: { userId, userEmail } },
  });
}

export async function fetchSessionCheckIns(sessionId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id,session_id,member_id,check_in_time,check_in_by,created_at,members(id,first_name,surname,mobile_phone)')
    .eq('session_id', sessionId)
    .order('check_in_time', { ascending: false });
  if (error) throw toError(error);
  return (data ?? []) as unknown as AttendanceRecord[];
}

export async function fetchAllCheckIns(): Promise<(AttendanceRecord & { session: Pick<AttendanceSession, 'session_date' | 'service_type'> | null })[]> {
  const rows: (AttendanceRecord & { session: Pick<AttendanceSession, 'session_date' | 'service_type'> | null })[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('id,session_id,member_id,check_in_time,check_in_by,created_at,members(id,first_name,surname,mobile_phone),session:attendance_sessions(session_date,service_type)')
      .range(start, start + pageSize - 1);
    if (error) throw toError(error);
    const page = (data ?? []) as unknown as typeof rows;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function checkInMember(sessionId: string, memberId: string, userId: string | null): Promise<AttendanceRecord> {
  const { data, error } = await supabase
    .from('attendance_records')
    .insert({ session_id: sessionId, member_id: memberId, check_in_by: userId ?? null, check_in_time: new Date().toISOString() })
    .select('id,session_id,member_id,check_in_time,check_in_by,created_at,members(id,first_name,surname,mobile_phone)')
    .single();
  if (error) throw toError(error);
  return data as unknown as AttendanceRecord;
}

export async function removeMemberCheckIn(recordId: string): Promise<void> {
  const { error } = await supabase.from('attendance_records').delete().eq('id', recordId);
  if (error) throw toError(error);
}

/** Active members absent from each of the last `missedThreshold` Sunday main services. */
export async function fetchAbsenteeMembers(missedThreshold = 3): Promise<AbsenteeMember[]> {
  const { data: sessionData, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select('id,session_date')
    .eq('service_type', SUNDAY)
    .order('session_date', { ascending: false });
  if (sessionError) throw toError(sessionError);
  const sundays = (sessionData ?? []) as unknown as { id: string; session_date: string }[];
  if (sundays.length < missedThreshold) return [];

  const dates = sundays.map((s) => s.session_date); // newest first

  const lastSeen = new Map<string, string>();
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('member_id,session:attendance_sessions!inner(session_date,service_type)')
      .eq('session.service_type', SUNDAY)
      .range(start, start + pageSize - 1);
    if (error) throw toError(error);
    const page = (data ?? []) as unknown as { member_id: string; session: { session_date: string } | null }[];
    for (const r of page) {
      const d = r.session?.session_date;
      if (d && (!lastSeen.get(r.member_id) || d > (lastSeen.get(r.member_id) as string))) lastSeen.set(r.member_id, d);
    }
    if (page.length < pageSize) break;
  }

  const members: { id: string; first_name: string | null; surname: string | null; mobile_phone: string | null }[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('members')
      .select('id,first_name,surname,mobile_phone')
      .eq('status', 'Active')
      .range(start, start + pageSize - 1);
    if (error) throw toError(error);
    const page = (data ?? []) as unknown as typeof members;
    members.push(...page);
    if (page.length < pageSize) break;
  }

  const groupByMember = new Map<string, string>();
  const { data: groupData } = await supabase
    .from('member_groups')
    .select('member_id,groups(name)')
    .eq('membership_status', 'Active')
    .limit(10000);
  for (const row of (groupData ?? []) as unknown as { member_id: string; groups: { name: string } | null }[]) {
    if (row.groups?.name && !groupByMember.has(row.member_id)) groupByMember.set(row.member_id, row.groups.name);
  }

  const result: AbsenteeMember[] = [];
  for (const m of members) {
    const last = lastSeen.get(m.id) ?? null;
    const missed = last ? dates.filter((d) => d > last).length : dates.length;
    if (missed < missedThreshold) continue;
    result.push({
      member_id: m.id,
      full_name: `${m.first_name ?? ''} ${m.surname ?? ''}`.trim() || 'Unnamed member',
      phone: m.mobile_phone,
      group_name: groupByMember.get(m.id) ?? null,
      last_attended_date: last,
      missed_weeks_count: missed,
    });
  }
  return result.sort((a, b) => b.missed_weeks_count - a.missed_weeks_count);
}
