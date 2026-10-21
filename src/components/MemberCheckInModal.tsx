import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, UserMinus } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { useToast } from './ui/Toast';
import { checkInMember, fetchCheckInMembers, fetchSessionCheckIns, removeMemberCheckIn } from '../lib/queries/attendance';
import { getErrorMessage } from '../lib/errors';
import type { AttendanceMember, AttendanceRecord, AttendanceSession } from '../types/attendance';

interface MemberCheckInModalProps {
  session: AttendanceSession | null;
  userId: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const nameOf = (m: { first_name: string | null; surname: string | null }) =>
  `${m.surname ?? ''} ${m.first_name ?? ''}`.trim() || 'Unnamed member';

const getTargetGroup = (serviceType: string): string | null => {
  const type = serviceType.toLowerCase();
  if (type.includes('jy') || type.includes('junior youth')) return 'jy';
  if (type.includes('children')) return 'children';
  if (type.includes('yaf')) return 'yaf';
  if (type.includes('ypg')) return 'ypg';
  if (type.includes('womens')) return 'women';
  if (type.includes('mens')) return 'men';
  return null; // Sunday Main Service, Bible Study and Other show all members
};

const inTargetGroup = (groups: string[] | undefined, target: string): boolean =>
  (groups ?? []).some((g) => {
    const name = g.toLowerCase();
    // "men" is a substring of "women"
    return name.includes(target) && !(target === 'men' && name.includes('women'));
  });

function GroupBadges({ groups }: { groups?: string[] }) {
  if (!groups || groups.length === 0) return <span className="text-[10px] italic text-slate-400">No Group</span>;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {groups.map((g) => (
        <span key={g} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{g}</span>
      ))}
    </span>
  );
}

export default function MemberCheckInModal({ session, userId, readOnly = false, onClose, onChanged }: MemberCheckInModalProps) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sessionId = session?.id;

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [activeMembers, checkIns] = await Promise.all([fetchCheckInMembers(), fetchSessionCheckIns(sessionId)]);
      setMembers(activeMembers);
      setRecords(checkIns);
    } catch (err) {
      console.error('Failed to load check-ins', err);
      showToast(`Could not load check-ins: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, showToast]);

  useEffect(() => {
    setSearch('');
    setShowAll(false);
    void load();
  }, [load]);

  const targetGroup = session ? getTargetGroup(session.service_type) : null;

  const checkedIds = useMemo(() => new Set(records.map((r) => r.member_id)), [records]);
  const term = search.trim().toLowerCase();
  const available = useMemo(
    () => members
      .filter((m) => !checkedIds.has(m.id))
      .filter((m) => !targetGroup || showAll || inTargetGroup(m.groups, targetGroup))
      .filter((m) => !term || nameOf(m).toLowerCase().includes(term) || (m.mobile_phone ?? '').includes(term))
      .slice(0, 50),
    [members, checkedIds, term, targetGroup, showAll],
  );

  if (!session) return null;

  const handleCheckIn = async (memberId: string) => {
    setBusyId(memberId);
    try {
      const record = await checkInMember(session.id, memberId, userId);
      setRecords((prev) => [record, ...prev]);
      onChanged?.();
    } catch (err) {
      console.error('Check-in failed', err);
      showToast(`Could not check in member: ${getErrorMessage(err)}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (record: AttendanceRecord) => {
    setBusyId(record.id);
    try {
      await removeMemberCheckIn(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      onChanged?.();
    } catch (err) {
      console.error('Remove check-in failed', err);
      showToast(`Could not remove check-in: ${getErrorMessage(err)}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Check-in: ${session.service_type} (${session.session_date})`} maxWidth="2xl" blueHeader>
      <input
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Search members by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {targetGroup && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Showing members in the matching group only. Tick to show all members.
        </label>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-primaryDark">Present ({records.length})</h3>
            <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
              {records.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No one checked in yet.</li>}
              {records.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{r.members ? nameOf(r.members) : 'Unknown member'}</span>
                    <GroupBadges groups={r.members?.groups} />
                  </span>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" loading={busyId === r.id} icon={<UserMinus aria-hidden="true" size={14} />} onClick={() => void handleRemove(r)}>Remove</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-primaryDark">Available members</h3>
            <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
              {available.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matching members.</li>}
              {available.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{nameOf(m)}</span>
                    <GroupBadges groups={m.groups} />
                  </span>
                  {!readOnly && (
                    <Button size="sm" variant="secondary" loading={busyId === m.id} icon={<Check aria-hidden="true" size={14} />} onClick={() => void handleCheckIn(m.id)}>Check In</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
