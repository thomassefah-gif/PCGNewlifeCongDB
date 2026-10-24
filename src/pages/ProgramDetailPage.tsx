import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Pencil, Search, UserMinus, UsersRound } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { calculateAge, formatDate } from '../lib/date';
import { addMemberToGroup, getGroupById, getProgramMembers, removeMemberFromGroup, updateGroupMembership, type GroupMembershipFilter, type GroupWithCount, type ProgramMember } from '../lib/queries/groups';
import { searchMembers } from '../lib/queries/members';
import { supabase } from '../lib/supabaseClient';
import { useGroupScope } from '../hooks/useGroupScope';
import type { Member } from '../types/member';

type MemberLookup = Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone' | 'status'>;

function joinedName(member: Member): string {
  return [member.title, member.first_name, member.surname].filter(Boolean).join(' ') || 'Unnamed member';
}

export default function ProgramDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canEdit } = useGroupScope();
  const [group, setGroup] = useState<GroupWithCount | null>(null);
  const [memberships, setMemberships] = useState<ProgramMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<GroupMembershipFilter>('ALL');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberLookup[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [membershipToEdit, setMembershipToEdit] = useState<ProgramMember | null>(null);
  const [nextStatus, setNextStatus] = useState<'Active' | 'Inactive'>('Active');
  const [savingStatus, setSavingStatus] = useState(false);
  const [membershipToRemove, setMembershipToRemove] = useState<ProgramMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [groupResult, memberResult] = await Promise.all([
        getGroupById(id),
        getProgramMembers(id, debouncedSearch, status),
      ]);
      setGroup(groupResult);
      setMemberships(memberResult);
    } catch (error) {
      setMemberships([]);
      showToast(error instanceof Error ? error.message : 'Unable to load group members.', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, id, showToast, status]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const channel = supabase
      .channel(`program_detail_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_groups', filter: `group_id=eq.${id}` }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${id}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, refresh]);

  useEffect(() => {
    const term = memberSearch.trim();
    if (term.length < 2) {
      setMemberResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearching(true);
      void searchMembers(term)
        .then((results) => {
          const alreadyInGroup = new Set(memberships.map((item) => item.member_id));
          setMemberResults(results.filter((candidate) => !alreadyInGroup.has(candidate.id)) as MemberLookup[]);
        })
        .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Unable to search members.', 'error'))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [memberSearch, memberships, showToast]);

  const exportedMembers = useMemo(() => memberships.map(({ members: member, joined_at, membership_status }) => ({
    ...member,
    group_membership_status: membership_status,
    group_joined_at: joined_at,
  })), [memberships]);

  const handleAddMember = async () => {
    if (!selectedMember) return;
    setAdding(true);
    try {
      await addMemberToGroup(id, selectedMember.id);
      showToast(`${joinedName(selectedMember as Member)} added to ${group?.name ?? 'group'}.`, 'success');
      setAddModalOpen(false);
      setMemberSearch('');
      setMemberResults([]);
      setSelectedMember(null);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add member to group.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const saveMembershipStatus = async () => {
    if (!membershipToEdit) return;
    setSavingStatus(true);
    try {
      await updateGroupMembership(membershipToEdit.id, nextStatus);
      showToast('Group membership status updated.', 'success');
      setMembershipToEdit(null);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update membership.', 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  const confirmRemove = async () => {
    if (!membershipToRemove) return;
    setRemoving(true);
    try {
      await removeMemberFromGroup(id, membershipToRemove.member_id);
      showToast(`${joinedName(membershipToRemove.members)} was removed from this group.`, 'success');
      setMembershipToRemove(null);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to remove group member.', 'error');
    } finally {
      setRemoving(false);
    }
  };

  if (loading && !group) return <div className="animate-pulse rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">Loading group...</div>;
  if (!group) return <EmptyState title="Group not found" description="This group may have been deleted or is not available to your account." />;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate('/programs')} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary"><ArrowLeft aria-hidden="true" size={16} /> Back to groups</button>
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" size={24} /></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{group.name}</h1><Badge variant="primary">{group.group_type}</Badge></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{group.description || 'No description provided.'}</p><p className="mt-2 text-sm font-medium text-slate-500">{group.member_count} active {group.member_count === 1 ? 'member' : 'members'}</p></div></div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button type="button" icon={<UsersRound aria-hidden="true" size={16} />} onClick={() => { setAddModalOpen(true); setSelectedMember(null); setMemberSearch(''); setMemberResults([]); }}>Add Member to Group</Button>}
            <ExportButton data={exportedMembers} filename={`group_${group.name}`} label="Export Group Members (CSV)" isMemberData />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-stone-100 p-4 md:grid-cols-[minmax(250px,1fr)_220px]">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 px-3 text-slate-400 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><Search aria-hidden="true" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this group's members..." aria-label="Search members in this group" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" /></label>
          <label className="sr-only" htmlFor="program-status-filter">Filter group membership status</label>
          <select id="program-status-filter" value={status} onChange={(event) => setStatus(event.target.value as GroupMembershipFilter)} className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"><option value="ALL">All membership statuses</option><option value="Active">Active in Group</option><option value="Inactive">Inactive in Group</option></select>
        </div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading group members...</div> : memberships.length === 0 ? <EmptyState title="No members found" description={search || status !== 'ALL' ? 'No members match this search and membership filter.' : 'Add church members to this group to see them listed here.'} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead className="bg-stone-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Contact</th><th className="px-4 py-3.5">Phone</th><th className="px-4 py-3.5">Sex</th><th className="px-4 py-3.5">Age</th><th className="px-4 py-3.5">Membership Status</th><th className="px-4 py-3.5">Date Enrolled</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{memberships.map((membership) => {
                const member = membership.members;
                const initials = `${member.first_name?.[0] ?? ''}${member.surname?.[0] ?? ''}`.toUpperCase() || '?';
                return <tr key={membership.id} className="transition-colors hover:bg-accent/50">
                  <td className="px-5 py-4"><div className="flex min-w-[210px] items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{initials}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{joinedName(member)}</p><p className="truncate text-xs text-slate-500">{member.email || 'No email recorded'}</p></div></div></td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{member.mobile_phone || member.residential_phone || '—'}</td><td className="px-4 py-4 text-sm text-slate-600">{member.sex || '—'}</td><td className="px-4 py-4 text-sm text-slate-600">{calculateAge(member.date_of_birth) ?? '—'}</td>
                  <td className="px-4 py-4"><Badge variant={membership.membership_status === 'Active' ? 'active' : 'inactive'}>{membership.membership_status}</Badge></td><td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{formatDate(membership.joined_at)}</td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" title="View profile" aria-label={`View ${joinedName(member)} profile`} onClick={() => navigate(`/contacts/${member.id}`)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Eye aria-hidden="true" size={17} /></button>{canEdit && <><button type="button" title="Edit membership status" aria-label={`Edit ${joinedName(member)} membership status`} onClick={() => { setMembershipToEdit(membership); setNextStatus(membership.membership_status); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Pencil aria-hidden="true" size={16} /></button><button type="button" title="Remove from group" aria-label={`Remove ${joinedName(member)} from group`} onClick={() => setMembershipToRemove(membership)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><UserMinus aria-hidden="true" size={17} /></button></>}</div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {!loading && memberships.length > 0 && <div className="border-t border-stone-100 px-5 py-3 text-xs text-slate-500">Showing {memberships.length} member{memberships.length === 1 ? '' : 's'}{search ? ` matching “${search}”` : ''}</div>}
      </section>

      <Modal isOpen={addModalOpen && canEdit} onClose={() => { if (!adding) setAddModalOpen(false); }} title="Add Member to Group" maxWidth="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Search for a church member by name, email, or phone number.</p>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 px-3 text-slate-400 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><Search aria-hidden="true" size={17} /><input autoFocus type="search" value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setSelectedMember(null); }} placeholder="Type at least 2 characters..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" /></label>
          {searching && <p className="text-sm text-slate-500">Searching members...</p>}
          {memberSearch.trim().length >= 2 && !searching && memberResults.length === 0 && <p className="rounded-xl bg-stone-50 px-4 py-5 text-center text-sm text-slate-500">No eligible member matches. They may already belong to this group.</p>}
          {memberResults.length > 0 && <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200">{memberResults.map((candidate) => <button key={candidate.id} type="button" onClick={() => setSelectedMember(candidate)} className={`flex w-full items-center gap-3 border-b border-stone-100 px-3 py-3 text-left last:border-b-0 ${selectedMember?.id === candidate.id ? 'bg-primary/5' : 'hover:bg-accent/60'}`}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{`${candidate.first_name?.[0] ?? ''}${candidate.surname?.[0] ?? ''}`.toUpperCase() || '?'}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{joinedName(candidate as Member)}</span><span className="block truncate text-xs text-slate-500">{candidate.email || candidate.mobile_phone || 'No email or phone'}</span></span><Badge variant={candidate.status === 'Active' ? 'active' : 'inactive'}>{candidate.status}</Badge></button>)}</div>}
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button type="button" variant="outline" onClick={() => setAddModalOpen(false)} disabled={adding}>Cancel</Button><Button type="button" disabled={!selectedMember} loading={adding} onClick={() => void handleAddMember()}>Add to Group</Button></div>
        </div>
      </Modal>

      <Modal isOpen={canEdit && Boolean(membershipToEdit)} onClose={() => { if (!savingStatus) setMembershipToEdit(null); }} title="Update Group Membership">
        <div className="space-y-5"><p className="text-sm text-slate-600">Set {membershipToEdit ? joinedName(membershipToEdit.members) : 'this member'}'s status in {group.name}.</p><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Membership Status</span><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as 'Active' | 'Inactive')} className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMembershipToEdit(null)} disabled={savingStatus}>Cancel</Button><Button type="button" loading={savingStatus} onClick={() => void saveMembershipStatus()}>Save Status</Button></div></div>
      </Modal>

      <ConfirmDialog isOpen={canEdit && Boolean(membershipToRemove)} onClose={() => { if (!removing) setMembershipToRemove(null); }} onConfirm={confirmRemove} title="Remove from group" message={`Remove ${membershipToRemove ? joinedName(membershipToRemove.members) : 'this member'} from ${group.name}? This will NOT delete the member from the church database.`} confirmLabel="Remove from group" loading={removing} />
    </div>
  );
}
