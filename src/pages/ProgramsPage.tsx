import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { deleteGroup, getGroupsByType, type GroupWithCount, updateGroup, createGroup } from '../lib/queries/groups';
import { supabase } from '../lib/supabaseClient';
import type { GroupType } from '../types/member';

const tabs: Array<{ type: GroupType; label: string; singular: string }> = [
  { type: 'generational', label: 'Generational Groups', singular: 'Generational' },
  { type: 'interest', label: 'Interest Groups', singular: 'Interest' },
  { type: 'family', label: 'Family Groups', singular: 'Family' },
  { type: 'custom', label: 'Custom Groups', singular: 'Custom' },
];

const groupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required.'),
  description: z.string(),
  group_type: z.enum(['generational', 'interest', 'family', 'custom']),
});
type GroupFormValues = z.infer<typeof groupSchema>;

function typeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function ProgramsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role } = useAuth();
  const [activeType, setActiveType] = useState<GroupType>('generational');
  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [allGroups, setAllGroups] = useState<GroupWithCount[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithCount | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<GroupWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: '', description: '', group_type: activeType },
  });

  const refreshGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [generational, interest, family, custom] = await Promise.all([
        getGroupsByType('generational'),
        getGroupsByType('interest'),
        getGroupsByType('family'),
        getGroupsByType('custom'),
      ]);
      const everyGroup = [...generational, ...interest, ...family, ...custom];
      setAllGroups(everyGroup);
      setGroups(everyGroup.filter((group) => group.group_type === activeType));
      setTotalCount(everyGroup.length);
    } catch (error) {
      setGroups([]);
      showToast(error instanceof Error ? error.message : 'Unable to load groups.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeType, showToast]);

  useEffect(() => { void refreshGroups(); }, [refreshGroups]);

  useEffect(() => {
    const refreshChannel = () => { void refreshGroups(); };
    const channel = supabase
      .channel('programs_groups_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refreshChannel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_groups' }, refreshChannel)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshGroups]);

  const openCreateModal = () => {
    setEditingGroup(null);
    reset({ name: '', description: '', group_type: activeType });
    setModalOpen(true);
  };

  const openEditModal = (group: GroupWithCount) => {
    setEditingGroup(group);
    reset({ name: group.name, description: group.description ?? '', group_type: group.group_type });
    setModalOpen(true);
  };

  const saveGroup = async (values: GroupFormValues) => {
    setSaving(true);
    try {
      if (editingGroup) await updateGroup(editingGroup.id, values);
      else await createGroup(values);
      showToast(editingGroup ? 'Group updated successfully.' : 'Group created successfully.', 'success');
      setModalOpen(false);
      await refreshGroups();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save group.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;
    setDeleting(true);
    try {
      await deleteGroup(groupToDelete.id);
      showToast('Group deleted successfully.', 'success');
      setGroupToDelete(null);
      await refreshGroups();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete group.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const activeTab = tabs.find((tab) => tab.type === activeType) ?? tabs[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2 text-primary"><FolderKanban aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">Church life</span></div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Groups</h1>
          <p className="mt-1 text-sm text-slate-600">{totalCount.toLocaleString()} active {totalCount === 1 ? 'group' : 'groups'} across the congregation</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton<GroupWithCount> data={allGroups} filename="groups" label="Export All Groups (CSV)" />
          <Button type="button" icon={<Plus aria-hidden="true" size={17} />} onClick={openCreateModal}>New Group</Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div role="tablist" aria-label="Group types" className="flex overflow-x-auto border-b border-stone-200 px-3 pt-3 sm:px-5">
          {tabs.map((tab) => <button key={tab.type} type="button" role="tab" aria-selected={activeType === tab.type} onClick={() => setActiveType(tab.type)} className={`whitespace-nowrap rounded-t-xl px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${activeType === tab.type ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-800'}`}>{tab.label}</button>)}
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{activeTab.label}</h2><p className="mt-1 text-sm text-slate-500">Browse and manage the congregation's {activeTab.singular.toLowerCase()} groups.</p></div><span className="text-xs font-medium text-slate-500">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span></div>
          {loading ? <div className="animate-pulse rounded-xl bg-stone-50 px-6 py-16 text-center text-sm font-medium text-slate-500">Loading groups...</div> : groups.length === 0 ? <EmptyState title={`No ${activeTab.singular.toLowerCase()} groups yet`} description="Create a group to start organizing members in this category." /> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => <article key={group.id} role="button" tabIndex={0} onClick={() => navigate(`/programs/${group.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/programs/${group.id}`); } }} className="group cursor-pointer rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><FolderKanban aria-hidden="true" size={20} /></div><div className="flex items-center gap-1">
                  <button type="button" aria-label={`Edit ${group.name}`} title="Edit group" onClick={(event) => { event.stopPropagation(); openEditModal(group); }} onKeyDown={(event) => event.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Pencil aria-hidden="true" size={16} /></button>
                  {role === 'admin' && <button type="button" aria-label={`Delete ${group.name}`} title="Delete group" onClick={(event) => { event.stopPropagation(); setGroupToDelete(group); }} onKeyDown={(event) => event.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button>}
                </div></div>
                <div className="mt-4"><h3 className="text-lg font-semibold text-slate-900 group-hover:text-primaryDark">{group.name}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{group.description || 'No description provided.'}</p></div>
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-stone-100 pt-4"><Badge variant="primary">{typeLabel(group.group_type)}</Badge><Badge variant="gray">{group.member_count} active {group.member_count === 1 ? 'member' : 'members'}</Badge></div>
              </article>)}
            </div>
          )}
        </div>
      </section>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingGroup ? 'Edit Group' : 'Create New Group'}>
        <form className="space-y-4" onSubmit={handleSubmit(saveGroup)} noValidate>
          <div><label htmlFor="group-name" className="mb-1.5 block text-sm font-medium text-slate-700">Name <span className="text-danger">*</span></label><input id="group-name" autoFocus className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('name')} />{errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}</div>
          <div><label htmlFor="group-description" className="mb-1.5 block text-sm font-medium text-slate-700">Description</label><textarea id="group-description" rows={3} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('description')} /></div>
          {!editingGroup && <div><label htmlFor="group-type" className="mb-1.5 block text-sm font-medium text-slate-700">Group Type <span className="text-danger">*</span></label><select id="group-type" className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('group_type')}>
            {tabs.map((tab) => <option key={tab.type} value={tab.type}>{tab.singular}</option>)}
          </select></div>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{editingGroup ? 'Save Changes' : 'Create Group'}</Button></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(groupToDelete)} onClose={() => { if (!deleting) setGroupToDelete(null); }} onConfirm={confirmDelete} title="Delete group" message={`Delete “${groupToDelete?.name ?? 'this group'}”? Group memberships will be removed, but member records are not deleted.`} confirmLabel="Delete group" loading={deleting} />
    </div>
  );
}
