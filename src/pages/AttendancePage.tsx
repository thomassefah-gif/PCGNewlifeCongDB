import { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, PhoneCall, Plus, Trash2, UserCheck } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import clsx from 'clsx';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import AttendanceSessionModal from '../components/AttendanceSessionModal';
import MemberCheckInModal from '../components/MemberCheckInModal';
import { useAuth } from '../features/auth/AuthContext';
import { exportToCSV } from '../lib/csv';
import { getErrorMessage } from '../lib/errors';
import { canDelete, canEdit, restrictedGroup } from '../lib/permissions';
import {
  createAttendanceSession,
  deleteAttendanceSession,
  fetchAbsenteeMembers,
  fetchAllCheckIns,
  fetchAttendanceSessions,
  fetchAttendanceSummary,
  updateAttendanceSession,
} from '../lib/queries/attendance';
import {
  SERVICE_TYPES,
  type AbsenteeMember,
  type AttendanceSession,
  type AttendanceSessionFormData,
  type AttendanceSummary,
  type ServiceType,
} from '../types/attendance';

const ABSENT_THRESHOLD = 3;
const fieldClass = 'rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const emptySummary: AttendanceSummary = { totalSessions: 0, totalAttendeesThisMonth: 0, avgAttendance: 0, childrenVsAdultRatio: 0 };

function displayDate(value: string | null): string {
  if (!value) return 'Never';
  const d = parseISO(value);
  return isValid(d) ? format(d, 'dd MMM yyyy') : value;
}

export default function AttendancePage() {
  const { role, user, userGroup } = useAuth();
  const restricted = restrictedGroup(role, userGroup);
  const { showToast } = useToast();
  const [tab, setTab] = useState<'sessions' | 'absentees'>('sessions');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>(emptySummary);
  const [absentees, setAbsentees] = useState<AbsenteeMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState<ServiceType | 'ALL'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkInSession, setCheckInSession] = useState<AttendanceSession | null>(null);
  const [toDelete, setToDelete] = useState<AttendanceSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const mayEdit = canEdit(role);
  const mayDelete = canDelete(role);
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats, missing] = await Promise.all([
        fetchAttendanceSessions({ serviceType, startDate, endDate }),
        fetchAttendanceSummary(),
        fetchAbsenteeMembers(ABSENT_THRESHOLD),
      ]);
      setSessions(restricted ? list.filter((s) => s.service_type.includes(restricted)) : list);
      setSummary(stats);
      setAbsentees(restricted ? missing.filter((a) => a.groups?.includes(restricted)) : missing);
    } catch (err) {
      console.error('Failed to load attendance', err);
      setSessions([]);
      showToast(`Could not load attendance: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [serviceType, startDate, endDate, showToast, restricted]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleSave = async (data: AttendanceSessionFormData) => {
    setSaving(true);
    try {
      if (editing) await updateAttendanceSession(editing.id, data, userId, userEmail);
      else await createAttendanceSession(data, userId, userEmail);
      showToast(editing ? 'Session updated.' : 'Session created.', 'success');
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error('Failed to save session', err);
      showToast(`Could not save session: ${getErrorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteAttendanceSession(toDelete.id, userId, userEmail);
      showToast('Session deleted.', 'success');
      setToDelete(null);
      await load();
    } catch (err) {
      console.error('Failed to delete session', err);
      showToast(`Could not delete session: ${getErrorMessage(err)}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const records = await fetchAllCheckIns();
      if (records.length > 0) {
        exportToCSV(
          records.map((r) => ({
            Date: r.session?.session_date ?? '',
            Service: r.session?.service_type ?? '',
            Member: r.members ? `${r.members.first_name ?? ''} ${r.members.surname ?? ''}`.trim() : '',
            Phone: r.members?.mobile_phone ?? '',
            CheckInTime: r.check_in_time,
          })),
          { filename: 'attendance_checkins' },
        );
      } else {
        exportToCSV(
          sessions.map((s) => ({
            Date: s.session_date,
            Service: s.service_type,
            Title: s.title ?? '',
            Male: s.head_count_male,
            Female: s.head_count_female,
            Children: s.head_count_children,
            Total: s.total_head_count,
            Notes: s.notes ?? '',
          })),
          { filename: 'attendance_sessions' },
        );
      }
    } catch (err) {
      console.error('Failed to export attendance', err);
      showToast(`Could not export attendance: ${getErrorMessage(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const cards: [string, string][] = [
    ['Total Services', String(summary.totalSessions)],
    ['Attendance This Month', String(summary.totalAttendeesThisMonth)],
    ['Avg Attendance', String(summary.avgAttendance)],
    ['Flagged Absentees', String(absentees.length)],
  ];

  const tabClass = (active: boolean) => clsx(
    'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
    active ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-primary/10 hover:text-primary',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance & Service Check-in</h1>
          <p className="text-sm text-slate-500">Record services, check in members and follow up on absentees.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" loading={exporting} icon={<Download aria-hidden="true" size={16} />} onClick={() => void handleExport()}>Export Attendance CSV</Button>
          {mayEdit && (
            <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => { setEditing(null); setModalOpen(true); }}>Create Service Session</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-primaryDark">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm sm:w-fit">
        <button type="button" className={tabClass(tab === 'sessions')} onClick={() => setTab('sessions')}>Service Sessions</button>
        <button type="button" className={tabClass(tab === 'absentees')} onClick={() => setTab('absentees')}>Absentee Watchlist ({absentees.length})</button>
      </div>

      {tab === 'sessions' ? (
        <>
          <div className="flex flex-wrap gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <select className={fieldClass} value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType | 'ALL')}>
              <option value="ALL">All service types</option>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={fieldClass} type="date" aria-label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input className={fieldClass} type="date" aria-label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">Loading attendance...</div>
            ) : sessions.length === 0 ? (
              <EmptyState title="No service sessions" description="Create a service session to start recording attendance." />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-accent text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 text-right">Male</th>
                    <th className="px-4 py-3 text-right">Female</th>
                    <th className="px-4 py-3 text-right">Children</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-primary/5">
                      <td className="whitespace-nowrap px-4 py-2.5">{displayDate(s.session_date)}</td>
                      <td className="px-4 py-2.5"><Badge variant="primary">{s.service_type}</Badge></td>
                      <td className="px-4 py-2.5 text-slate-600">{s.title ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right">{s.head_count_male}</td>
                      <td className="px-4 py-2.5 text-right">{s.head_count_female}</td>
                      <td className="px-4 py-2.5 text-right">{s.head_count_children}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-primaryDark">{s.total_head_count}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" aria-label="Check-in members" title="Check-in members" onClick={() => setCheckInSession(s)}><UserCheck aria-hidden="true" size={15} /></Button>
                          {mayEdit && (
                            <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setEditing(s); setModalOpen(true); }}><Pencil aria-hidden="true" size={15} /></Button>
                          )}
                          {mayDelete && (
                            <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setToDelete(s)}><Trash2 aria-hidden="true" size={15} className="text-danger" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Loading watchlist...</div>
          ) : absentees.length === 0 ? (
            <EmptyState title="No flagged absentees" description={`Active members who missed ${ABSENT_THRESHOLD}+ consecutive Sunday services appear here.`} />
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-accent text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Groups</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Last attended</th>
                  <th className="px-4 py-3 text-right">Weeks missed</th>
                  <th className="px-4 py-3 text-right">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {absentees.map((a) => (
                  <tr key={a.member_id} className="hover:bg-warning/5">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{a.full_name}</td>
                    <td className="px-4 py-2.5">
                      {a.groups && a.groups.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {a.groups.map((g) => (
                            <span key={g} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{g}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs italic text-slate-400">No Group</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{a.phone ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{displayDate(a.last_attended_date)}</td>
                    <td className="px-4 py-2.5 text-right"><Badge variant="distant">{a.missed_weeks_count}</Badge></td>
                    <td className="px-4 py-2.5 text-right">
                      {a.phone ? (
                        <a
                          href={`tel:${a.phone.replace(/\s+/g, '')}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20"
                        >
                          <PhoneCall aria-hidden="true" size={14} /> Call / Follow-up
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">No phone</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AttendanceSessionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        session={editing}
        saving={saving}
      />
      <MemberCheckInModal
        session={checkInSession}
        userId={userId}
        readOnly={!mayEdit}
        onClose={() => setCheckInSession(null)}
        onChanged={() => void load()}
      />
      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Delete service session"
        message="This permanently removes the session and its check-ins. Continue?"
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
