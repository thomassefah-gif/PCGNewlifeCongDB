import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Pencil, Phone, Plus, Trash2, UsersRound } from 'lucide-react';
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
import { createStaff, deleteStaff, getStaff, updateStaff, type StaffInput, type StaffRecord } from '../lib/queries/staff';

const staffSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required.'),
  role_title: z.string(),
  department: z.string(),
  email: z.string().email('Enter a valid email address.').or(z.literal('')),
  phone: z.string(),
});
type StaffValues = z.infer<typeof staffSchema>;
const emptyForm: StaffValues = { full_name: '', role_title: '', department: '', email: '', phone: '' };

export default function StaffPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const isAdmin = role === 'admin';
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<StaffRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StaffValues>({ resolver: zodResolver(staffSchema), defaultValues: emptyForm });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      setStaff(await getStaff());
    } catch (error) {
      setStaff([]);
      showToast(error instanceof Error ? error.message : 'Unable to load staff directory.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadStaff(); }, [loadStaff]);

  const openCreate = () => {
    setEditingStaff(null);
    reset(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (record: StaffRecord) => {
    setEditingStaff(record);
    reset({ full_name: record.full_name, role_title: record.role_title ?? '', department: record.department ?? '', email: record.email ?? '', phone: record.phone ?? '' });
    setModalOpen(true);
  };

  const saveStaff = async (values: StaffValues) => {
    setSaving(true);
    try {
      const data: StaffInput = values;
      if (editingStaff) await updateStaff(editingStaff.id, data);
      else await createStaff(data);
      showToast(editingStaff ? 'Staff record updated.' : 'Staff member added.', 'success');
      setModalOpen(false);
      await loadStaff();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save staff record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!staffToDelete) return;
    setDeleting(true);
    try {
      await deleteStaff(staffToDelete.id);
      showToast(`${staffToDelete.full_name} was removed from the staff directory.`, 'success');
      setStaffToDelete(null);
      await loadStaff();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete staff record.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="flex items-center gap-2 text-primary"><UsersRound aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">People &amp; ministry</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Staff Directory</h1><p className="mt-1 text-sm text-slate-600">Church staff and ministry leadership contacts</p></div>
        <div className="flex flex-wrap gap-2"><ExportButton<StaffRecord> data={staff} filename="staff_directory" label="Export Staff (CSV)" />{isAdmin && <Button type="button" icon={<Plus aria-hidden="true" size={17} />} onClick={openCreate}>Add Staff</Button>}</div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="Staff directory table">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Staff members</h2><p className="mt-0.5 text-xs text-slate-500">{staff.length} directory {staff.length === 1 ? 'entry' : 'entries'}</p></div></div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading staff...</div> : staff.length === 0 ? <EmptyState title="No staff records yet" description={isAdmin ? 'Add a staff member to begin building the directory.' : 'Staff directory entries will appear here.'} /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Full Name</th><th className="px-4 py-3.5">Role Title</th><th className="px-4 py-3.5">Department</th><th className="px-4 py-3.5">Email</th><th className="px-4 py-3.5">Phone</th>{isAdmin && <th className="px-4 py-3.5 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-stone-100">{staff.map((record) => <tr key={record.id} className="transition-colors hover:bg-accent/50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{record.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span><div><p className="text-sm font-semibold text-slate-900">{record.full_name}</p><Badge variant={record.is_active ? 'active' : 'inactive'} className="mt-1">{record.is_active ? 'Active' : 'Inactive'}</Badge></div></div></td><td className="px-4 py-4 text-sm text-slate-700">{record.role_title || '—'}</td><td className="px-4 py-4 text-sm text-slate-700">{record.department || '—'}</td><td className="px-4 py-4 text-sm text-slate-600">{record.email ? <a href={`mailto:${record.email}`} className="inline-flex items-center gap-1.5 hover:text-primary"><Mail aria-hidden="true" size={14} />{record.email}</a> : '—'}</td><td className="px-4 py-4 text-sm text-slate-600">{record.phone ? <a href={`tel:${record.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary"><Phone aria-hidden="true" size={14} />{record.phone}</a> : '—'}</td>{isAdmin && <td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${record.full_name}`} onClick={() => openEdit(record)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Pencil aria-hidden="true" size={16} /></button><button type="button" aria-label={`Delete ${record.full_name}`} onClick={() => setStaffToDelete(record)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button></div></td>}</tr>)}</tbody></table></div>}
      </section>

      <Modal isOpen={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}>
        <form className="space-y-4" onSubmit={handleSubmit(saveStaff)} noValidate>
          <div><label htmlFor="staff-name" className="mb-1.5 block text-sm font-medium text-slate-700">Full Name <span className="text-danger">*</span></label><input id="staff-name" autoFocus className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('full_name')} />{errors.full_name && <p className="mt-1 text-xs text-danger">{errors.full_name.message}</p>}</div>
          <div><label htmlFor="staff-role" className="mb-1.5 block text-sm font-medium text-slate-700">Role Title</label><input id="staff-role" className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('role_title')} /></div>
          <div><label htmlFor="staff-department" className="mb-1.5 block text-sm font-medium text-slate-700">Department</label><input id="staff-department" className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('department')} /></div>
          <div><label htmlFor="staff-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label><input id="staff-email" type="email" className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('email')} />{errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}</div>
          <div><label htmlFor="staff-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label><input id="staff-phone" inputMode="tel" className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('phone')} /></div>
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{editingStaff ? 'Save Changes' : 'Add Staff'}</Button></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(staffToDelete)} onClose={() => { if (!deleting) setStaffToDelete(null); }} onConfirm={confirmDelete} title="Delete staff record" message={`Delete ${staffToDelete?.full_name ?? 'this staff record'} from the directory? This does not delete the member record.`} confirmLabel="Delete" loading={deleting} />
    </div>
  );
}
