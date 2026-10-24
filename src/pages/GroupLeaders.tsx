import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, Plus, RefreshCw, Shield, Trash2, UserRoundPlus } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../features/auth/AuthContext';
import { GENERATIONAL_GROUPS, canonicalGroupName } from '../lib/groupScope';
import { getMembers } from '../lib/queries/members';
import { getUsers, type SystemUser } from '../lib/queries/users';
import { supabase } from '../lib/supabaseClient';
import type { Member } from '../types/member';

interface Coverage {
  name: string;
  members: number;
  leaders: number;
}

const inputClass = 'h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-blue-100';
const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function generatePassword(): string {
  let password = '';
  const maxAcceptedByte = Math.floor(256 / passwordAlphabet.length) * passwordAlphabet.length;
  while (password.length < 12) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= maxAcceptedByte) continue;
      password += passwordAlphabet[byte % passwordAlphabet.length];
      if (password.length === 12) break;
    }
  }
  return password;
}

function memberMatchesGroup(member: Member, groupName: string): boolean {
  const target = canonicalGroupName(groupName).toLocaleLowerCase();
  const names = [
    ...(member.groups ?? []),
    member.primary_generational_group,
    member.generational_group,
    member.family_group,
    member.church_family_group,
  ].filter((name): name is string => Boolean(name));
  return names.some((name) => canonicalGroupName(name).toLocaleLowerCase() === target);
}

export default function GroupLeadersPage() {
  const { role } = useAuth();
  const [leaders, setLeaders] = useState<SystemUser[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [assignedGroup, setAssignedGroup] = useState<string>(GENERATIONAL_GROUPS[0]);
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SystemUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allUsers = await getUsers();
      const allMembers: Member[] = [];
      const firstPage = await getMembers({ page: 1, pageSize: 1000 });
      allMembers.push(...firstPage.members);
      for (let page = 2; page <= Math.ceil(firstPage.totalCount / 1000); page += 1) {
        const nextPage = await getMembers({ page, pageSize: 1000 });
        if (!nextPage.members.length) break;
        allMembers.push(...nextPage.members);
      }

      const nextLeaders = allUsers.filter((account) => account.role === 'group_leader');
      setLeaders(nextLeaders);
      setCoverage(GENERATIONAL_GROUPS.map((name) => ({
        name,
        members: allMembers.filter((member) => memberMatchesGroup(member, name)).length,
        leaders: nextLeaders.filter((leader) => canonicalGroupName(leader.assigned_group ?? '') === name).length,
      })));
    } catch (caughtError) {
      setLeaders([]);
      setCoverage([]);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (role === 'admin') void load(); }, [load, role]);

  const groupedLeaders = leaders;

  const createLeader = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_create_group_leader', {
        p_email: email.trim(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_assigned_group: assignedGroup,
      });
      if (rpcError) throw rpcError;
      const result = data as { success?: boolean; error?: string } | null;
      if (result?.error) throw new Error(result.error);
      if (result?.success !== true) throw new Error('The group leader account could not be created.');
      setSuccess(`Leader account created for ${assignedGroup}.`);
      setFullName('');
      setEmail('');
      setPassword('');
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setSaving(false);
    }
  };

  const updateLeaderGroup = async (leader: SystemUser, group: string) => {
    setBusyUserId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ assigned_group: group })
        .eq('id', leader.id)
        .eq('role', 'group_leader')
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('Group leader account not found.');
      setSuccess(`${leader.full_name || leader.email || 'Leader'} reassigned to ${group}.`);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleLeader = async (leader: SystemUser) => {
    setBusyUserId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: !leader.is_active })
        .eq('id', leader.id)
        .eq('role', 'group_leader')
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('Group leader account not found.');
      setSuccess(`${leader.full_name || leader.email || 'Leader'} ${leader.is_active ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyUserId(null);
    }
  };

  const savePassword = async (leader: SystemUser) => {
    setBusyUserId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: invocationError } = await supabase.functions.invoke('create-group-leader', {
        body: { action: 'reset_password', userId: leader.id, password: resetPassword },
      });
      if (invocationError) throw new Error(invocationError.message || 'The password reset request failed.');
      const result = data as { success?: boolean; error?: string } | null;
      if (result?.error) throw new Error(result.error);
      if (result?.success !== true) throw new Error('The password reset request failed.');
      setSuccess(`Password reset for ${leader.full_name || leader.email || 'leader'}.`);
      setResettingId(null);
      setResetPassword('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteLeader = async () => {
    if (!deleteTarget) return;
    setBusyUserId(deleteTarget.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('role', 'group_leader')
        .select('id')
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error('Group leader account not found.');
      setSuccess(`${deleteTarget.full_name || deleteTarget.email || 'Leader'} deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setBusyUserId(null);
    }
  };

  if (role !== 'admin') {
    return <section className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
      <Shield className="mx-auto text-red-700" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-600">Only administrators can manage group leader accounts.</p>
    </section>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1D4ED8]">Administration</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Group Leaders</h1><p className="mt-1 text-sm text-slate-600">Create and manage group-scoped leader accounts.</p></div>
          <Button type="button" variant="outline" onClick={() => void load()} loading={loading} icon={<RefreshCw aria-hidden="true" size={16} />}>Refresh</Button>
        </div>
      </header>

      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800" role="status">{success}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{error}</div>}

      <section aria-label="Generational group coverage" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading && coverage.length === 0 ? <div className="col-span-full rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Loading group coverage...</div> : coverage.map((item) => (
          <article key={item.name} className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">{item.name}</h2>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600"><strong className="text-slate-900">{item.members}</strong> members</span>
              <Badge variant={item.leaders > 0 ? 'active' : 'inactive'}>{item.leaders > 0 ? `${item.leaders} leader account${item.leaders === 1 ? '' : 's'}` : 'No leader account'}</Badge>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-[#1D4ED8]"><UserRoundPlus aria-hidden="true" size={19} /><h2 className="font-semibold text-slate-900">Create group leader account</h2></div>
        <form onSubmit={(event) => void createLeader(event)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-medium text-slate-600">Full name<input className={inputClass} autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-slate-600">Email<input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-slate-600">Assigned group<select className={inputClass} required value={assignedGroup} onChange={(event) => setAssignedGroup(event.target.value)}>{GENERATIONAL_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium text-slate-600">Initial password<span className="flex gap-2"><input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /><Button type="button" title="Generate a 12-character password" onClick={() => setPassword(generatePassword())}>Generate</Button></span></label>
          <div className="flex items-end"><Button type="submit" loading={saving} icon={<Plus aria-hidden="true" size={16} />}>{saving ? 'Creating...' : 'Create account'}</Button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Existing leader accounts</h2><p className="mt-1 text-xs text-slate-500">{groupedLeaders.length} accounts</p></div><KeyRound aria-hidden="true" className="text-[#1D4ED8]" size={19} /></div>
        {loading ? <div className="px-6 py-12 text-center text-sm text-slate-500">Loading group leaders...</div> : groupedLeaders.length === 0 ? <EmptyState title="No group leaders yet" description="Create an account above to assign a leader to a generational group." /> : (
          <div className="divide-y divide-stone-100">
            {groupedLeaders.map((leader) => {
              const name = leader.full_name || leader.email || 'Group leader';
              const busy = busyUserId === leader.id;
              return <article key={leader.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(210px,.8fr)_auto] lg:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{name}</p><p className="mt-1 truncate text-xs text-slate-500">{leader.email || 'No email recorded'}</p><span className="mt-2 inline-flex"><Badge variant={leader.is_active ? 'active' : 'inactive'}>{leader.is_active ? 'Active' : 'Disabled'}</Badge></span></div>
                <select aria-label={`Assigned group for ${name}`} className={inputClass} value={leader.assigned_group ?? ''} disabled={busy} onChange={(event) => void updateLeaderGroup(leader, event.target.value)}>
                  {GENERATIONAL_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => { setResettingId(resettingId === leader.id ? null : leader.id); setResetPassword(''); }} icon={<KeyRound aria-hidden="true" size={14} />}>Reset password</Button>
                  <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => void toggleLeader(leader)} icon={<Check aria-hidden="true" size={14} />}>{leader.is_active ? 'Disable' : 'Enable'}</Button>
                  <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => setDeleteTarget(leader)} icon={<Trash2 aria-hidden="true" size={14} />}>Delete</Button>
                </div>
                {resettingId === leader.id && <form className="flex flex-wrap gap-2 lg:col-span-3" onSubmit={(event) => { event.preventDefault(); void savePassword(leader); }}>
                  <input aria-label={`New password for ${name}`} className={`${inputClass} max-w-sm`} type="password" autoComplete="new-password" minLength={8} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="New password (8+ characters)" />
                  <Button type="button" variant="outline" onClick={() => setResetPassword(generatePassword())}>Generate</Button>
                  <Button type="submit" disabled={busy}>Save password</Button>
                </form>}
              </article>;
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteLeader()}
        title="Delete group leader"
        message={`Delete ${deleteTarget?.full_name || deleteTarget?.email || 'this account'}? Their sign-in will be permanently removed.`}
        confirmLabel="Delete account"
        loading={Boolean(deleteTarget && busyUserId === deleteTarget.id)}
      />
    </div>
  );
}
