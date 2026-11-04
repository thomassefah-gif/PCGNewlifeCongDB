import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserRoundCog, UsersRound } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { createUserAccount, getUsers, updateUserAssignedGroup, updateUserRole, updateUserStatus, type SystemUser } from '../lib/queries/users';
import { getLeaderGroupOptions, type LeaderGroupOption } from '../lib/queries/groupLeaders';
import type { UserRole } from '../types/auth';

const inputClass = 'h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const ROLE_LABELS: Record<UserRole, string> = { admin: 'Admin', user: 'User', viewer: 'View Only', group_leader: 'Group Leader' };

export default function UsersPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [groupOptions, setGroupOptions] = useState<LeaderGroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'user' as UserRole, assignedGroup: '' });

  useEffect(() => {
    void getLeaderGroupOptions().then(setGroupOptions).catch(() => setGroupOptions([]));
  }, []);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (form.role === 'group_leader' && !form.assignedGroup) { showToast('Choose a group for the group leader.', 'error'); return; }
    setCreating(true);
    try {
      await createUserAccount(form);
      showToast('Account created. They can sign in now.', 'success');
      setForm({ fullName: '', email: '', password: '', role: 'user', assignedGroup: '' });
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create the account.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } catch (error) {
      setUsers([]);
      showToast(error instanceof Error ? error.message : 'Unable to load system users.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);
  useEffect(() => {
    if (!loading && role !== 'admin') {
      showToast('Administrator access is required to view system users.', 'error');
      navigate('/dashboard', { replace: true });
    }
  }, [loading, navigate, role, showToast]);

  const toggleRole = async (account: SystemUser) => {
    setBusyUserId(account.id);
    try {
      const nextRole = account.role === 'admin' ? 'user' : 'admin';
      await updateUserRole(account.id, nextRole);
      showToast(`${account.full_name || account.email || 'User'} is now ${nextRole === 'admin' ? 'an administrator' : 'a user'}.`, 'success');
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update user role.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const changeGroup = async (account: SystemUser, group: string) => {
    setBusyUserId(account.id);
    try {
      await updateUserAssignedGroup(account.id, group);
      showToast(`${account.full_name || account.email || 'User'} ${group ? `assigned to ${group}` : 'has no assigned group'}.`, 'success');
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update assigned group.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleStatus = async (account: SystemUser) => {
    setBusyUserId(account.id);
    try {
      await updateUserStatus(account.id, !account.is_active);
      showToast(`${account.full_name || account.email || 'User'} ${account.is_active ? 'deactivated' : 'activated'}.`, 'success');
      await loadUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update user status.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  if (role !== 'admin' && !loading) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="flex items-center gap-2 text-primary"><UserRoundCog aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">Administration</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">System Users</h1><p className="mt-1 text-sm text-slate-600">Manage roles and access for church office accounts</p></div>
        <ExportButton<SystemUser> data={users} filename="system_users" label="Export Users (CSV)" />
      </header>

      <form onSubmit={(event) => void createAccount(event)} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm" aria-label="Create account">
        <div><h2 className="font-semibold text-slate-900">Create new account</h2><p className="mt-0.5 text-xs text-slate-500">Create a login here in the app. Choose a role and, for group leaders, the group they manage.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input required aria-label="Full name" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
          <input required type="email" aria-label="Email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          <input required type="password" minLength={8} aria-label="Password" placeholder="Password (8+ characters)" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputClass}>
            <option value="user">User (can edit)</option>
            <option value="viewer">View Only</option>
            <option value="group_leader">Group Leader</option>
            <option value="admin">Admin</option>
          </select>
          <select aria-label="Group" value={form.assignedGroup} onChange={(e) => setForm({ ...form, assignedGroup: e.target.value })} className={inputClass}>
            <option value="">{form.role === 'group_leader' ? 'Select group' : 'No group'}</option>
            {groupOptions.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}
          </select>
        </div>
        <Button type="submit" loading={creating}>Create account</Button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="System users table">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">User accounts</h2><p className="mt-0.5 text-xs text-slate-500">{users.length} registered {users.length === 1 ? 'account' : 'accounts'}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" size={18} /></span></div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading users...</div> : users.length === 0 ? <EmptyState title="No system users found" description="Profiles linked to Supabase Auth accounts will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">User</th><th className="px-4 py-3.5">Role</th><th className="px-4 py-3.5">Assigned Group</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Date Added</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">{users.map((account) => {
          const isCurrentUser = account.id === user?.id;
          const busy = busyUserId === account.id;
          const name = account.full_name || 'Name not provided';
          const initials = (account.full_name || account.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
          return <tr key={account.id} className="transition-colors hover:bg-accent/50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{initials}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{name}{isCurrentUser && <span className="ml-2 text-[10px] font-medium text-primary">You</span>}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{account.email || 'No email recorded'}</span></span></div></td><td className="px-4 py-4"><Badge variant={account.role === 'admin' ? 'primary' : 'gray'}><span className="inline-flex items-center gap-1.5">{account.role === 'admin' && <ShieldCheck aria-hidden="true" size={13} />}{ROLE_LABELS[account.role] ?? 'User'}</span></Badge></td><td className="px-4 py-4"><select aria-label={`Assigned group for ${name}`} value={account.assigned_group ?? ''} disabled={busy} onChange={(event) => void changeGroup(account, event.target.value)} className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-primary/50 disabled:opacity-60"><option value="">None</option>{account.assigned_group && !groupOptions.some((group) => group.name === account.assigned_group) && <option value={account.assigned_group}>{account.assigned_group}</option>}{groupOptions.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}</select></td><td className="px-4 py-4"><Badge variant={account.is_active ? 'active' : 'inactive'}>{account.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{new Date(account.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" loading={busy} disabled={busy || isCurrentUser || account.role === 'group_leader'} title={isCurrentUser ? 'You cannot change your own role.' : account.role === 'group_leader' ? 'Group leaders are managed from the Group Leaders page.' : undefined} onClick={() => void toggleRole(account)}>{account.role === 'admin' ? 'Make User' : 'Make Admin'}</Button><Button type="button" size="sm" variant={account.is_active ? 'ghost' : 'secondary'} loading={busy} disabled={busy || isCurrentUser} title={isCurrentUser ? 'You cannot change your own account status.' : undefined} onClick={() => void toggleStatus(account)}>{account.is_active ? 'Deactivate' : 'Activate'}</Button></div></td></tr>;
        })}</tbody></table></div>}
      </section>
    </div>
  );
}
