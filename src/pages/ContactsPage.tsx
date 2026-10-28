import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3, Eye, Search, Trash2, UsersRound } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import MemberAvatar from '../components/MemberAvatar';
import { useToast } from '../components/ui/Toast';
import { calculateAge, formatDate } from '../lib/date';
import { syncToGoogleSheet } from '../lib/googleSheetSync';
import { getMobilePhone, getOtherPhone } from '../lib/memberFields';
import { deleteMember, getAllGroups, getAllMembers, getMembers } from '../lib/queries/members';
import { exportToCSV } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../features/auth/AuthContext';
import { canEdit, restrictedGroup } from '../lib/permissions';
import type { DistantFilter, Group, Member, MemberStatusFilter } from '../types/member';

const PAGE_SIZE = 25;

function memberName(member: Member): string {
  return [member.title, member.first_name, member.surname].filter(Boolean).join(' ') || 'Unnamed member';
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role, userGroup } = useAuth();
  const mayEdit = canEdit(role);
  const restricted = restrictedGroup(role, userGroup);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatusFilter>('ALL');
  const [groupId, setGroupId] = useState('ALL');
  const [distant, setDistant] = useState<DistantFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Record<string, Member>>({});
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const requestSequence = useRef(0);

  const restrictedId = restricted ? groups.find((group) => group.name === restricted)?.id ?? null : null;
  const effectiveGroupId = restricted ? restrictedId ?? 'ALL' : groupId;

  const fetchMembers = useCallback(async () => {
    if (restricted) {
      if (groupsLoading) return;
      if (!restrictedId) {
        setMembers([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getMembers({ page, pageSize: PAGE_SIZE, search, status, groupId: effectiveGroupId, distant });
      if (requestId !== requestSequence.current) return;
      let filtered = result.members;
      if (restricted) {
        filtered = filtered.filter((m) => m.groups?.some((g: string) => g.toLowerCase().includes(restricted.toLowerCase())));
      }
      setMembers(filtered);
      setTotalCount(result.totalCount);
      if (result.members.length === 0 && page > 1 && (page - 1) * PAGE_SIZE >= result.totalCount) {
        setPage(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
      }
    } catch (caughtError) {
      if (requestId !== requestSequence.current) return;
      const err = caughtError as { message?: string } | null;
      const message = err?.message || String(caughtError);
      setMembers([]);
      setTotalCount(0);
      setError(message);
      showToast(`Could not load contacts: ${message}`, 'error');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [distant, effectiveGroupId, groupsLoading, page, restricted, restrictedId, search, showToast, status]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    let active = true;
    void getAllGroups()
      .then((result) => { if (active) setGroups(result); })
      .catch(() => { if (active) showToast('Could not load groups for filtering.', 'error'); })
      .finally(() => { if (active) setGroupsLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  useEffect(() => {
    const channel = supabase
      .channel('members_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        void fetchMembers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  const selectedList = useMemo(() => Object.values(selectedMembers), [selectedMembers]);
  const pageSelected = members.length > 0 && members.every((member) => selectedMembers[member.id]);
  const firstRowNumber = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRowNumber = Math.min(page * PAGE_SIZE, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const toggleMember = (member: Member) => {
    setSelectedMembers((current) => {
      const next = { ...current };
      if (next[member.id]) delete next[member.id];
      else next[member.id] = member;
      return next;
    });
  };

  const togglePage = () => {
    setSelectedMembers((current) => {
      const next = { ...current };
      if (pageSelected) members.forEach(({ id }) => delete next[id]);
      else members.forEach((member) => { next[member.id] = member; });
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!memberToDelete) return;
    setDeleting(true);
    try {
      await deleteMember(memberToDelete.id);
      void syncToGoogleSheet('delete', memberToDelete, memberToDelete);
      setSelectedMembers((current) => {
        const next = { ...current };
        delete next[memberToDelete.id];
        return next;
      });
      showToast(`${memberName(memberToDelete)} was deleted.`, 'success');
      setMemberToDelete(null);
      await fetchMembers();
    } catch (caughtError) {
      showToast(caughtError instanceof Error ? caughtError.message : 'Unable to delete member.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      let allMembers: Member[];
      if (restricted) {
        if (!restrictedId) { allMembers = []; } else {
          const first = await getMembers({ page: 1, pageSize: 1000, groupId: restrictedId });
          allMembers = first.members;
          for (let nextPage = 2; allMembers.length < first.totalCount; nextPage += 1) {
            const next = await getMembers({ page: nextPage, pageSize: 1000, groupId: restrictedId });
            if (next.members.length === 0) break;
            allMembers.push(...next.members);
          }
        }
      } else {
        allMembers = await getAllMembers();
      }
      exportToCSV(allMembers, { filename: 'members', isMemberData: true });
    } catch (caughtError) {
      showToast(caughtError instanceof Error ? caughtError.message : 'Unable to export members.', 'error');
    } finally {
      setExportingAll(false);
    }
  };

  const changeSearch = (value: string) => { setPage(1); setSearch(value); };
  const changeStatus = (value: MemberStatusFilter) => { setPage(1); setStatus(value); };
  const changeGroup = (value: string) => { setPage(1); setGroupId(value); };
  const changeDistant = (value: DistantFilter) => { setPage(1); setDistant(value); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <UsersRound aria-hidden="true" size={18} />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Member directory</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Contacts &amp; Members</h1>
          <p className="mt-1 text-sm text-slate-600">{totalCount.toLocaleString()} registered {totalCount === 1 ? 'member' : 'members'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton<Member> data={selectedList} filename="selected_members" label="Export Selected (CSV)" isMemberData disabled={selectedList.length === 0} />
          <ExportButton<Member> data={members} filename="members" label="Export All (CSV)" isMemberData disabled={loading || totalCount === 0} loading={exportingAll} onExport={handleExportAll} />
          {mayEdit && <Button type="button" icon={<span aria-hidden="true" className="text-lg leading-none">+</span>} onClick={() => navigate('/contacts/new')}>
            Add Member
          </Button>}
        </div>
      </div>

      <section aria-label="Member filters" className="grid gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(145px,.8fr)_minmax(165px,1fr)_minmax(190px,1.1fr)]">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-slate-400 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
          <Search aria-hidden="true" size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Search name, email, phone..."
            aria-label="Search name, email, or phone"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </label>
        <label className="sr-only" htmlFor="member-status-filter">Filter by status</label>
        <select id="member-status-filter" value={status} onChange={(event) => changeStatus(event.target.value as MemberStatusFilter)} className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
          <option value="ALL">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
        </select>
        <label className="sr-only" htmlFor="member-group-filter">Filter by group</label>
        <select id="member-group-filter" value={restricted ? restrictedId ?? 'ALL' : groupId} onChange={(event) => changeGroup(event.target.value)} disabled={groupsLoading || Boolean(restricted)} className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-60">
          <option value="ALL">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="member-distant-filter">Filter by distant status</label>
        <select id="member-distant-filter" value={distant} onChange={(event) => changeDistant(event.target.value as DistantFilter)} className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
          <option value="ALL">All members</option><option value="NON_DISTANT">Resident members</option><option value="DISTANT">Distant members</option>
        </select>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="Members table">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Member records</h2>
            <p className="mt-0.5 text-xs text-slate-500">Contact information and membership status</p>
          </div>
          {selectedList.length > 0 && <span className="text-xs font-medium text-primary">{selectedList.length} selected</span>}
        </div>
        {loading ? (
          <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading members...</div>
        ) : error ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-danger">Members could not be loaded</p>
            <p className="mt-2 text-sm text-slate-500">Check Supabase configuration, network access, and row-level security.</p>
            <Button variant="outline" className="mt-5" onClick={() => void fetchMembers()}>Try again</Button>
          </div>
        ) : members.length === 0 ? (
          <EmptyState title="No members found" description="There are no members matching these filters. Try changing your search or add a member." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-stone-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-12 px-5 py-3.5">
                    <input type="checkbox" aria-label="Select all members on this page" checked={pageSelected} onChange={togglePage} className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" />
                  </th>
                  <th scope="col" className="px-4 py-3.5">Contact</th>
                  <th scope="col" className="px-4 py-3.5">Phone</th>
                  <th scope="col" className="px-4 py-3.5">Sex</th>
                  <th scope="col" className="px-4 py-3.5">Age</th>
                  <th scope="col" className="px-4 py-3.5">Status</th>
                  <th scope="col" className="px-4 py-3.5">Date Joined</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {members.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-accent/50">
                    <td className="px-5 py-4">
                      <input type="checkbox" aria-label={`Select ${memberName(member)}`} checked={Boolean(selectedMembers[member.id])} onChange={() => toggleMember(member)} className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-[205px] items-center gap-3">
                        <MemberAvatar member={member} enlargeable />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{memberName(member)}</p>
                          <p className="truncate text-xs text-slate-500">{member.email || 'No email recorded'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{getMobilePhone(member) || getOtherPhone(member) || '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{member.sex || '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{calculateAge(member.date_of_birth) ?? '—'}</td>
                    <td className="px-4 py-4"><Badge variant={member.status === 'Active' ? 'active' : 'inactive'}>{member.status}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{formatDate(member.date_joined_new_life)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <button type="button" title="View member" aria-label={`View ${memberName(member)}`} onClick={() => navigate(`/contacts/${member.id}`)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Eye aria-hidden="true" size={17} /></button>
                        {mayEdit && <button type="button" title="Edit member" aria-label={`Edit ${memberName(member)}`} onClick={() => navigate(`/contacts/${member.id}/edit`)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Edit3 aria-hidden="true" size={16} /></button>}
                        {role === 'admin' && <button type="button" title="Delete member" aria-label={`Delete ${memberName(member)}`} onClick={() => setMemberToDelete(member)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && totalCount > 0 && (
          <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Showing <span className="font-semibold text-slate-700">{firstRowNumber}–{lastRowNumber}</span> of <span className="font-semibold text-slate-700">{totalCount}</span> members</p>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
              <span className="px-2 text-xs font-medium text-slate-600">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(memberToDelete)}
        onClose={() => { if (!deleting) setMemberToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete member"
        message={`Are you sure you want to delete ${memberToDelete ? memberName(memberToDelete) : 'this member'}? This action cannot be undone.`}
        confirmLabel="Delete member"
        loading={deleting}
      />
    </div>
  );
}
