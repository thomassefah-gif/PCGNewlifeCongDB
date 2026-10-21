import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, UserMinus } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { useToast } from './ui/Toast';
import { checkInMember, fetchSessionCheckIns, removeMemberCheckIn } from '../lib/queries/attendance';
import { getErrorMessage } from '../lib/errors';
import { getAllMembers } from '../lib/queries/members';
import type { AttendanceRecord, AttendanceSession } from '../types/attendance';
import type { Member } from '../types/member';

interface MemberCheckInModalProps {
  session: AttendanceSession | null;
  userId: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const nameOf = (m: { first_name: string | null; surname: string | null }) =>
  `${m.surname ?? ''} ${m.first_name ?? ''}`.trim() || 'Unnamed member';

export default function MemberCheckInModal({ session, userId, readOnly = false, onClose, onChanged }: MemberCheckInModalProps) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sessionId = session?.id;

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [allMembers, checkIns] = await Promise.all([getAllMembers(), fetchSessionCheckIns(sessionId)]);
      setMembers(allMembers.filter((m) => m.status === 'Active'));
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
    void load();
  }, [load]);

  const checkedIds = useMemo(() => new Set(records.map((r) => r.member_id)), [records]);
  const term = search.trim().toLowerCase();
  const available = useMemo(
    () => members
      .filter((m) => !checkedIds.has(m.id))
      .filter((m) => !term || nameOf(m).toLowerCase().includes(term) || (m.mobile_phone ?? '').includes(term))
      .slice(0, 50),
    [members, checkedIds, term],
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
                  <span className="min-w-0 truncate font-medium text-slate-900">{r.members ? nameOf(r.members) : 'Unknown member'}</span>
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
                  <span className="min-w-0 truncate">{nameOf(m)}</span>
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
