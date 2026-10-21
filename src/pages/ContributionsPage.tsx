import { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import ContributionModal from '../components/ContributionModal';
import ReceiptModal from '../components/ReceiptModal';
import { useAuth } from '../features/auth/AuthContext';
import { exportToCSV } from '../lib/csv';
import { formatCedi } from '../lib/currency';
import { canDelete, canEdit, restrictedGroup } from '../lib/permissions';
import {
  contributorName,
  createContribution,
  deleteContribution,
  fetchContributions,
  fetchContributionSummary,
  updateContribution,
} from '../lib/queries/contributions';
import {
  CONTRIBUTION_CATEGORIES,
  type Contribution,
  type ContributionCategory,
  type ContributionFormData,
  type ContributionSummary,
} from '../types/contributions';

const emptySummary: ContributionSummary = {
  totalRevenue: 0,
  monthRevenue: 0,
  yearRevenue: 0,
  totalTransactions: 0,
  categoryTotals: Object.fromEntries(CONTRIBUTION_CATEGORIES.map((c) => [c, 0])) as ContributionSummary['categoryTotals'],
};

const fieldClass = 'rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const errorMessage = (err: any): string =>
  err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));

function displayDate(value: string): string {
  const d = parseISO(value);
  return isValid(d) ? format(d, 'dd MMM yyyy') : value;
}

export default function ContributionsPage() {
  const { role, user, profile, userGroup } = useAuth();
  const restricted = restrictedGroup(role, userGroup);
  const { showToast } = useToast();
  const [rows, setRows] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ContributionSummary>(emptySummary);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ContributionCategory | 'ALL'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contribution | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Contribution | null>(null);
  const [toDelete, setToDelete] = useState<Contribution | null>(null);
  const [deleting, setDeleting] = useState(false);

  const mayEdit = canEdit(role);
  const mayDelete = canDelete(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, overall] = await Promise.all([
        fetchContributions({ search, category, startDate, endDate }),
        fetchContributionSummary(),
      ]);
      setRows(restricted ? list.filter((row) => row.members?.groups?.includes(restricted)) : list);
      setSummary(overall);
    } catch (err) {
      console.error('Failed to load contributions', err);
      setRows([]);
      showToast(`Could not load contributions: ${errorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, category, startDate, endDate, showToast, restricted]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);



  const handleSave = async (data: ContributionFormData) => {
    setSaving(true);
    try {
      const who = [user?.id ?? null, user?.email ?? null, profile?.full_name ?? null] as const;
      if (editing) await updateContribution(editing.id, data, ...who);
      else await createContribution(data, ...who);
      showToast(editing ? 'Contribution updated.' : 'Contribution recorded.', 'success');
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error('Failed to save contribution', err);
      showToast(`Could not save contribution: ${errorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteContribution(toDelete.id, user?.id ?? null, user?.email ?? null, profile?.full_name ?? null);
      showToast('Contribution deleted.', 'success');
      setToDelete(null);
      await load();
    } catch (err) {
      console.error('Failed to delete contribution', err);
      showToast(`Could not delete contribution: ${errorMessage(err)}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    exportToCSV(
      rows.map((r) => ({
        Date: r.payment_date,
        Contributor: contributorName(r),
        Category: r.category,
        Amount: r.amount.toFixed(2),
        Method: r.payment_method,
        Reference: r.reference_number ?? '',
        Notes: r.notes ?? '',
        RecordedBy: r.profiles?.full_name ?? '',
      })),
      { filename: 'contributions' },
    );
  };

  const cards = [
    ['Total Revenue', formatCedi(summary.totalRevenue)],
    ['This Month', formatCedi(summary.monthRevenue)],
    ['This Year', formatCedi(summary.yearRevenue)],
    ['Transactions', String(summary.totalTransactions)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dues, Tithes & Contributions</h1>
          <p className="text-sm text-slate-500">Record and track congregation giving.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Download aria-hidden="true" size={16} />} onClick={handleExport} disabled={rows.length === 0}>Export CSV</Button>
          {mayEdit && (
            <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => { setEditing(null); setModalOpen(true); }}>Record Contribution</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-primaryDark">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTRIBUTION_CATEGORIES.map((c) => (
          <Badge key={c} variant="primary">{c}: {formatCedi(summary.categoryTotals[c])}</Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <input className={`${fieldClass} min-w-[14rem] flex-1`} placeholder="Search contributor or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as ContributionCategory | 'ALL')}>
          <option value="ALL">All categories</option>
          {CONTRIBUTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={fieldClass} type="date" aria-label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className={fieldClass} type="date" aria-label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Loading contributions...</div>
        ) : rows.length === 0 ? (
          <EmptyState title="No contributions found" description="Recorded contributions will appear here." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-accent text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Contributor</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Ref #</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-primary/5">
                  <td className="whitespace-nowrap px-4 py-2.5">{displayDate(r.payment_date)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{contributorName(r)}</td>
                  <td className="px-4 py-2.5"><Badge variant="primary">{r.category}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{formatCedi(r.amount)}</td>
                  <td className="px-4 py-2.5">{r.payment_method}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.reference_number ?? '-'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label="Receipt" onClick={() => setReceipt(r)}><Receipt aria-hidden="true" size={15} /></Button>
                      {mayEdit && (
                        <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setEditing(r); setModalOpen(true); }}><Pencil aria-hidden="true" size={15} /></Button>
                      )}
                      {mayDelete && (
                        <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setToDelete(r)}><Trash2 aria-hidden="true" size={15} className="text-danger" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ContributionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        contribution={editing}
        saving={saving}
      />
      <ReceiptModal contribution={receipt} onClose={() => setReceipt(null)} />
      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Delete contribution"
        message="This permanently removes the contribution record. Continue?"
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
