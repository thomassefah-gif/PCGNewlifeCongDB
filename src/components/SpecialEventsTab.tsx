import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import { useToast } from './ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { createSpecialEvent, deleteSpecialEvent, getSpecialEvents, updateSpecialEvent, type SpecialEvent, type SpecialEventInput } from '../lib/queries/events';

const blank: SpecialEventInput = { title: '', event_date: '', notes: '' };
const inputClass = 'w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10';

export default function SpecialEventsTab() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const canManage = role !== 'viewer';
  const [events, setEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialEvent | null>(null);
  const [form, setForm] = useState<SpecialEventInput>(blank);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<SpecialEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await getSpecialEvents());
    } catch (err) {
      setEvents([]);
      showToast((err as Error)?.message || String(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void reload(); }, [reload]);

  const openNew = () => { setEditing(null); setForm(blank); setModalOpen(true); };
  const openEdit = (item: SpecialEvent) => { setEditing(item); setForm({ title: item.title, event_date: item.event_date, notes: item.notes ?? '' }); setModalOpen(true); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!form.title.trim() || !form.event_date) { showToast('Title and date are required.', 'error'); return; }
    setSaving(true);
    try {
      if (editing) await updateSpecialEvent(editing.id, form); else await createSpecialEvent(form);
      showToast(editing ? 'Event updated.' : 'Event added.', 'success');
      setModalOpen(false);
      await reload();
    } catch (err) {
      showToast((err as Error)?.message || String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete || !canManage) return;
    setDeleting(true);
    try {
      await deleteSpecialEvent(toDelete.id);
      showToast('Event deleted.', 'success');
      setToDelete(null);
      await reload();
    } catch (err) {
      showToast((err as Error)?.message || String(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Special Programs &amp; Events</h1>
          <p className="mt-1 text-sm text-slate-600">Upcoming special programs and events for the congregation.</p>
        </div>
        {canManage && <button type="button" onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1D4ED8] px-4 text-sm font-semibold text-white hover:bg-[#1E40AF]"><Plus aria-hidden="true" size={17} />Add Event</button>}
      </header>

      <section aria-label="Special events list" className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading events...</div> : events.length === 0 ? <EmptyState title="No special events yet" description="Add a special program or event to see it listed here." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3.5">Title</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Notes</th>{canManage && <th className="px-4 py-3.5 text-right">Actions</th>}</tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {events.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50">
                    <td className="px-5 py-4 font-semibold text-slate-900">{item.title}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700"><span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" size={14} className="text-[#1D4ED8]" />{item.event_date}</span></td>
                    <td className="max-w-xl px-4 py-4 text-sm text-slate-600">{item.notes}</td>
                    {canManage && (
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Edit ${item.title}`} onClick={() => openEdit(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-[#1D4ED8]/10 hover:text-[#1D4ED8]"><Pencil aria-hidden="true" size={16} /></button>
                          <button type="button" aria-label={`Delete ${item.title}`} onClick={() => setToDelete(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <>
          <Modal isOpen={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? 'Edit Event' : 'Add Event'} maxWidth="lg">
            <form className="space-y-4" onSubmit={save} noValidate>
              <div><label htmlFor="event-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title <span className="text-danger">*</span></label><input id="event-title" autoFocus className={`${inputClass} h-10`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><label htmlFor="event-date" className="mb-1.5 block text-sm font-medium text-slate-700">Date <span className="text-danger">*</span></label><input id="event-date" type="date" className={`${inputClass} h-10`} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
              <div><label htmlFor="event-notes" className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label><textarea id="event-notes" rows={4} className={`${inputClass} py-2.5`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
                <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="h-10 rounded-xl border border-stone-300 px-4 text-sm font-medium text-slate-700 hover:bg-stone-50">Cancel</button>
                <button type="submit" disabled={saving} className="h-10 rounded-xl bg-[#1D4ED8] px-4 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Event'}</button>
              </div>
            </form>
          </Modal>
          <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => { if (!deleting) setToDelete(null); }} onConfirm={confirmDelete} title="Delete event" message={`Delete “${toDelete?.title ?? 'this event'}”? This action cannot be undone.`} confirmLabel="Delete Event" loading={deleting} />
        </>
      )}
    </div>
  );
}
