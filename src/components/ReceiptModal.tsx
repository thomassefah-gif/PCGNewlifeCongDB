import { Printer } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { formatCedi } from '../lib/currency';
import { contributorName } from '../lib/queries/contributions';
import type { Contribution } from '../types/contributions';

interface ReceiptModalProps {
  contribution: Contribution | null;
  onClose: () => void;
}

export default function ReceiptModal({ contribution, onClose }: ReceiptModalProps) {
  if (!contribution) return null;
  const date = parseISO(contribution.payment_date);
  const receiptNo = contribution.id.slice(0, 8).toUpperCase();

  const rows: [string, string][] = [
    ['Receipt No.', receiptNo],
    ['Date', isValid(date) ? format(date, 'dd MMM yyyy') : contribution.payment_date],
    ['Received from', contributorName(contribution)],
    ['Category', contribution.category],
    ['Payment method', contribution.payment_method],
    ['Reference', contribution.reference_number ?? '-'],
    ['Recorded by', contribution.profiles?.full_name ?? '-'],
  ];

  return (
    <Modal isOpen onClose={onClose} title="Payment Receipt" maxWidth="md">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #receipt-print, #receipt-print * { visibility: visible !important; }
        #receipt-print { position: fixed; inset: 0; padding: 24px; background: #fff; }
      }`}</style>
      <div id="receipt-print" className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-bold text-primaryDark">New Life Congregation</h3>
          <p className="text-xs text-slate-500">Presbyterian Church of Ghana, Ga West Presbytery</p>
        </div>
        <dl className="divide-y divide-stone-200 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-xl bg-accent p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Amount received</p>
          <p className="text-2xl font-bold text-primaryDark">{formatCedi(contribution.amount)}</p>
        </div>
        {contribution.notes && <p className="text-xs text-slate-500">Notes: {contribution.notes}</p>}
        <p className="text-center text-xs text-slate-400">Thank you for your faithful giving.</p>
      </div>
      <div className="mt-5 flex justify-end gap-3 print:hidden">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button icon={<Printer aria-hidden="true" size={16} />} onClick={() => window.print()}>Print</Button>
      </div>
    </Modal>
  );
}
