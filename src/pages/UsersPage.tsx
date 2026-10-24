import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ShieldCheck, UserRoundCog, UsersRound } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { ASSIGNABLE_GROUPS, getUsers, updateUserAssignedGroup, updateUserRole, updateUserStatus, type SystemUser } from '../lib/queries/users';

export default function UsersPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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
    if (account.role === 'group_leader') return;
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

      <aside className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-blue-900 sm:px-5" role="note"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-primary"><AlertCircle aria-hidden="true" size={19} /></span><div><h2 className="text-sm font-semibold">Adding a user</h2><p className="mt-1 text-sm leading-6 text-blue-800">To add a new user, create their account in the Supabase Auth dashboard. Their profile will automatically appear here.</p></div></aside>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="System users table">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">User accounts</h2><p className="mt-0.5 text-xs text-slate-500">{users.length} registered {users.length === 1 ? 'account' : 'accounts'}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" size={18} /></span></div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading users...</div> : users.length === 0 ? <EmptyState title="No system users found" description="Profiles linked to Supabase Auth accounts will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">User</th><th className="px-4 py-3.5">Role</th><th className="px-4 py-3.5">Assigned Group</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Date Added</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">{users.map((account) => {
          const isCurrentUser = account.id === user?.id;
          const busy = busyUserId === account.id;
          const name = account.full_name || 'Name not provided';
          const initials = (account.full_name || account.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
          return <tr key={account.id} className="transition-colors hover:bg-accent/50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{initials}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{name}{isCurrentUser && <span className="ml-2 text-[10px] font-medium text-primary">You</span>}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{account.email || 'No email recorded'}</span></span></div></td><td className="px-4 py-4"><Badge variant={account.role === 'admin' ? 'primary' : 'gray'}><span className="inline-flex items-center gap-1.5">{account.role === 'admin' && <ShieldCheck aria-hidden="true" size={13} />}{account.role === 'admin' ? 'Admin' : account.role === 'group_leader' ? 'Group Leader' : 'User'}</span></Badge></td><td className="px-4 py-4"><select aria-label={`Assigned group for ${name}`} value={account.assigned_group ?? ''} disabled={busy} onChange={(event) => void changeGroup(account, event.target.value)} className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-primary/50 disabled:opacity-60"><option value="">None</option>{ASSIGNABLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></td><td className="px-4 py-4"><Badge variant={account.is_active ? 'active' : 'inactive'}>{account.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{new Date(account.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{account.role === 'group_leader' ? <span className="text-xs text-slate-500">Managed in Group Leaders</span> : <Button type="button" size="sm" variant="outline" loading={busy} disabled={busy || isCurrentUser} title={isCurrentUser ? 'You cannot change your own role.' : undefined} onClick={() => void toggleRole(account)}>{account.role === 'admin' ? 'Make User' : 'Make Admin'}</Button>}<Button type="button" size="sm" variant={account.is_active ? 'ghost' : 'secondary'} loading={busy} disabled={busy || isCurrentUser} title={isCurrentUser ? 'You cannot change your own account status.' : undefined} onClick={() => void toggleStatus(account)}>{account.is_active ? 'Deactivate' : 'Activate'}</Button></div></td></tr>;
        })}</tbody></table></div>}
      </section>
    </div>
  );
}
