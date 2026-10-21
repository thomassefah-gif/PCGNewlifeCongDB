import { useEffect, useState, type FormEvent } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import {
  SERVICE_TYPES,
  type AttendanceSession,
  type AttendanceSessionFormData,
  type ServiceType,
} from '../types/attendance';

interface AttendanceSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AttendanceSessionFormData) => Promise<void>;
  session?: AttendanceSession | null;
  saving?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const inputClass = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block text-sm font-medium text-slate-700';

const count = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

export default function AttendanceSessionModal({ isOpen, onClose, onSave, session, saving = false }: AttendanceSessionModalProps) {
  const [serviceType, setServiceType] = useState<ServiceType>('Sunday Main Service');
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState('');
  const [male, setMale] = useState('0');
  const [female, setFemale] = useState('0');
  const [children, setChildren] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setServiceType(session?.service_type ?? 'Sunday Main Service');
    setDate(session?.session_date ?? today());
    setTitle(session?.title ?? '');
    setMale(String(session?.head_count_male ?? 0));
    setFemale(String(session?.head_count_female ?? 0));
    setChildren(String(session?.head_count_children ?? 0));
    setNotes(session?.notes ?? '');
  }, [isOpen, session]);

  const total = count(male) + count(female) + count(children);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!date) return setError('Session date is required.');
    setError('');
    await onSave({
      session_date: date,
      service_type: serviceType,
      title: title.trim() || null,
      head_count_male: count(male),
      head_count_female: count(female),
      head_count_children: count(children),
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={session ? 'Edit Service Session' : 'Create Service Session'} maxWidth="xl" blueHeader>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Service type
            <select className={inputClass} value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={labelClass}>Session date
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className={labelClass}>Session title
          <input className={inputClass} value={title} placeholder="Optional, e.g. Harvest Thanksgiving" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>Male
            <input className={inputClass} type="number" min="0" step="1" value={male} onChange={(e) => setMale(e.target.value)} />
          </label>
          <label className={labelClass}>Female
            <input className={inputClass} type="number" min="0" step="1" value={female} onChange={(e) => setFemale(e.target.value)} />
          </label>
          <label className={labelClass}>Children
            <input className={inputClass} type="number" min="0" step="1" value={children} onChange={(e) => setChildren(e.target.value)} />
          </label>
        </div>
        <div className="rounded-xl bg-accent px-4 py-3 text-sm text-slate-600">
          Total headcount: <span className="text-lg font-bold text-primaryDark">{total}</span>
        </div>
        <label className={labelClass}>Notes
          <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{session ? 'Save Changes' : 'Create Session'}</Button>
        </div>
      </form>
    </Modal>
  );
}
