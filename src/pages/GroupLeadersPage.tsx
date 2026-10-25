import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import {
  LEADER_GROUPS,
  createGroupLeader,
  deleteLeader,
  getGroupLeaders,
  resetLeaderPassword,
  toggleLeaderActive,
  type GroupLeader,
} from '../lib/queries/groupLeaders';

const inputClass = 'h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';

export default function GroupLeadersPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const [leaders, setLeaders] = useState<GroupLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', assignedGroup: LEADER_GROUPS[0] as string });
  const [resetTarget, setResetTarget] = useState<GroupLeader | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GroupLeader | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLeaders(await getGroupLeaders());
    } catch (error) {
      setLeaders([]);
      showToast(error instanceof Error ? error.message : 'Unable to load group leaders.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (id: string | null, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    try {
      await action();
      showToast(success, 'success');
      await load();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    const ok = await run(null, () => createGroupLeader(form), 'Group leader created.');
    setCreating(false);
    if (ok) setForm({ fullName: '', email: '', password: '', assignedGroup: LEADER_GROUPS[0] });
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    const ok = await run(resetTarget.id, () => resetLeaderPassword(resetTarget.id, newPassword), 'Password reset.');
    if (ok) { setResetTarget(null); setNewPassword(''); }
  };

  if (role !== 'admin') return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Group Leaders</h1>
        <p className="mt-1 text-sm text-slate-600">Create and manage group leader accounts</p>
      </header>

      <form onSubmit={(event) => void submitCreate(event)} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-primaryDark"><UserPlus aria-hidden="true" size={18} />Create Leader</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input required aria-label="Full name" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
          <input required type="email" aria-label="Email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          <input required type="password" minLength={8} aria-label="Password" placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          <select aria-label="Assigned group" value={form.assignedGroup} onChange={(e) => setForm({ ...form, assignedGroup: e.target.value })} className={inputClass}>
            {LEADER_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        <div className="flex justify-end"><Button type="submit" loading={creating}>Create Leader</Button></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="Group leaders table">
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading group leaders...</div>
          : leaders.length === 0 ? <EmptyState title="No group leaders yet" description="Create a leader above to get started." />
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Leader</th><th className="px-4 py-3.5">Assigned Group</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{leaders.map((leader) => {
              const busy = busyId === leader.id;
              return <tr key={leader.id} className="hover:bg-accent/50">
                <td className="px-5 py-4"><span className="block text-sm font-semibold text-slate-900">{leader.full_name || 'Name not provided'}</span><span className="block text-xs text-slate-500">{leader.email}</span></td>
                <td className="px-4 py-4 text-sm text-slate-700">{leader.assigned_group || '—'}</td>
                <td className="px-4 py-4"><Badge variant={leader.is_active ? 'active' : 'inactive'}>{leader.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-4 py-4"><div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" icon={<KeyRound aria-hidden="true" size={14} />} disabled={busy} onClick={() => { setResetTarget(leader); setNewPassword(''); }}>Reset Password</Button>
                  <Button type="button" size="sm" variant="ghost" loading={busy} disabled={busy} onClick={() => void run(leader.id, () => toggleLeaderActive(leader.id), leader.is_active ? 'Leader deactivated.' : 'Leader activated.')}>{leader.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => setDeleteTarget(leader)}>Delete</Button>
                </div></td>
              </tr>;
            })}</tbody></table></div>}
      </section>

      {resetTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primaryDark/40 p-4" role="dialog" aria-modal="true" aria-label="Reset password">
        <form onSubmit={(event) => void submitReset(event)} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="font-semibold text-slate-900">Reset password for {resetTarget.full_name || resetTarget.email}</h2>
          <input required type="password" minLength={8} autoFocus aria-label="New password" placeholder="New password (min 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button type="submit" loading={busyId === resetTarget.id}>Reset Password</Button>
          </div>
        </form>
      </div>}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete group leader"
        message={`Delete ${deleteTarget?.full_name || deleteTarget?.email || 'this leader'}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteTarget !== null && busyId === deleteTarget.id}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const ok = await run(deleteTarget.id, () => deleteLeader(deleteTarget.id), 'Leader deleted.');
          if (ok) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
