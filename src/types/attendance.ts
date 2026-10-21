export const SERVICE_TYPES = [
  'Sunday Main Service',
  'Children Service',
  'Junior Youth (JY)',
  'YAF',
  'YPG',
  'Womens Fellowship',
  'Mens Fellowship',
  'Bible Study / Prayer Meeting',
  'Other',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface AttendanceSession {
  id: string;
  session_date: string;
  service_type: ServiceType;
  title: string | null;
  head_count_male: number;
  head_count_female: number;
  head_count_children: number;
  total_head_count: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSessionFormData {
  session_date: string;
  service_type: ServiceType;
  title: string | null;
  head_count_male: number;
  head_count_female: number;
  head_count_children: number;
  notes: string | null;
}

export interface AttendanceSessionFilters {
  serviceType?: ServiceType | 'ALL';
  startDate?: string;
  endDate?: string;
}

// The members table has mobile_phone, not phone_primary, and no member_code column.
export interface AttendanceMember {
  id: string;
  first_name: string | null;
  surname: string | null;
  mobile_phone: string | null;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  member_id: string;
  check_in_time: string;
  check_in_by: string | null;
  created_at: string;
  members: AttendanceMember | null;
}

export interface AttendanceSummary {
  totalSessions: number;
  totalAttendeesThisMonth: number;
  avgAttendance: number;
  childrenVsAdultRatio: number;
}

export interface AbsenteeMember {
  member_id: string;
  full_name: string;
  phone: string | null;
  group_name: string | null;
  last_attended_date: string | null;
  missed_weeks_count: number;
}
