import { useEffect, useState, type FormEvent } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { getAllMembers } from '../lib/queries/members';
import {
  CONTRIBUTION_CATEGORIES,
  PAYMENT_METHODS,
  type Contribution,
  type ContributionCategory,
  type ContributionFormData,
  type PaymentMethod,
} from '../types/contributions';
import type { Member } from '../types/member';

interface ContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ContributionFormData) => Promise<void>;
  contribution?: Contribution | null;
  saving?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const inputClass = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block text-sm font-medium text-slate-700';

export default function ContributionModal({ isOpen, onClose, onSave, contribution, saving = false }: ContributionModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [category, setCategory] = useState<ContributionCategory>('Tithe');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setMemberId(contribution?.member_id ?? '');
    setGuestName(contribution?.guest_name ?? '');
    setCategory(contribution?.category ?? 'Tithe');
    setAmount(contribution ? String(contribution.amount) : '');
    setMethod(contribution?.payment_method ?? 'Cash');
    setPaymentDate(contribution?.payment_date ?? today());
    setReference(contribution?.reference_number ?? '');
    setNotes(contribution?.notes ?? '');
    let active = true;
    getAllMembers()
      .then((rows) => { if (active) setMembers(rows); })
      .catch((err) => console.error('Failed to load members', err));
    return () => { active = false; };
  }, [isOpen, contribution]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    const isGuest = !memberId;
    if (isGuest && !guestName.trim()) return setError('Select a member or enter a guest/visitor name.');
    if (!Number.isFinite(value) || value <= 0) return setError('Amount must be greater than zero.');
    if (!paymentDate) return setError('Payment date is required.');
    setError('');
    await onSave({
      member_id: isGuest ? null : memberId,
      guest_name: isGuest ? guestName.trim() : null,
      category,
      amount: Math.round(value * 100) / 100,
      payment_method: method,
      payment_date: paymentDate,
      reference_number: reference.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={contribution ? 'Edit Contribution' : 'Record Contribution'} maxWidth="xl" blueHeader>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <label className={labelClass}>Member
          <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Guest / visitor (not a member)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{`${m.surname ?? ''} ${m.first_name ?? ''}`.trim()}</option>
            ))}
          </select>
        </label>
        {!memberId && (
          <label className={labelClass}>Guest / visitor name
            <input className={inputClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Category
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as ContributionCategory)}>
              {CONTRIBUTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={labelClass}>Amount (GH₵)
            <input className={inputClass} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={labelClass}>Payment method
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className={labelClass}>Payment date
            <input className={inputClass} type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </label>
        </div>
        <label className={labelClass}>Reference # (MoMo / Cheque)
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className={labelClass}>Notes
          <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{contribution ? 'Save Changes' : 'Record'}</Button>
        </div>
      </form>
    </Modal>
  );
}
