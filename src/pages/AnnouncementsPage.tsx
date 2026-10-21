import { useCallback, useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, CalendarDays, Download, FileUp, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import Modal from '../components/ui/Modal';
import SpecialEventsTab from '../components/SpecialEventsTab';
import { useToast } from '../components/ui/Toast';
import { bulkCreateAnnouncements, bulkInsertAnnouncements, createAnnouncement, deleteAnnouncement, getAnnouncements, updateAnnouncement, type Announcement, type AnnouncementInput } from '../lib/queries/announcements';
import type { ParsedPdfAnnouncement } from '../lib/pdfImport';

const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.'),
  date: z.string().min(1, 'Date is required.'),
  content: z.string().trim().min(1, 'Content is required.'),
});
type AnnouncementValues = z.infer<typeof announcementSchema>;
const blankValues: AnnouncementValues = { title: '', date: '', content: '' };

type AnnouncementCsvRow = Record<string, string>;

function validIsoDate(value: string): string | null {
  const date = parseISO(value.trim());
  return isValid(date) && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && format(date, 'yyyy-MM-dd') === value.trim() ? value.trim() : null;
}

export default function AnnouncementsPage() {
  const [tab, setTab] = useState<'announcements' | 'events'>('announcements');
  const tabs = [{ id: 'announcements', label: 'Announcements' }, { id: 'events', label: 'Special Programs & Events' }] as const;
  return (
    <div className="space-y-6">
      <div role="tablist" className="flex gap-2 border-b border-stone-200">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`-mb-px rounded-t-xl px-4 py-2.5 text-sm font-semibold ${tab === item.id ? 'bg-[#1D4ED8] text-white' : 'text-[#1D4ED8] hover:bg-[#1D4ED8]/10'}`}>{item.label}</button>
        ))}
      </div>
      {tab === 'announcements' ? <AnnouncementsTab /> : <SpecialEventsTab />}
    </div>
  );
}

function AnnouncementsTab() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfReviewOpen, setPdfReviewOpen] = useState(false);
  const [parsedAnnouncements, setParsedAnnouncements] = useState<ParsedPdfAnnouncement[]>([]);
  const [pdfImporting, setPdfImporting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AnnouncementValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: blankValues,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAnnouncements(await getAnnouncements());
    } catch (error) {
      setAnnouncements([]);
      showToast(error instanceof Error ? error.message : 'Unable to load announcements.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void reload(); }, [reload]);

  const createNew = () => {
    setEditing(null);
    reset(blankValues);
    setModalOpen(true);
  };

  const editAnnouncement = (item: Announcement) => {
    setEditing(item);
    reset({ title: item.title, date: item.date, content: item.content });
    setModalOpen(true);
  };

  const save = async (values: AnnouncementValues) => {
    setSaving(true);
    try {
      const input: AnnouncementInput = values;
      if (editing) await updateAnnouncement(editing.id, input);
      else await createAnnouncement(input);
      showToast(editing ? 'Announcement updated.' : 'Announcement published.', 'success');
      setModalOpen(false);
      await reload();
    } catch (error) {
      const err = error as { message?: string };
      showToast(err.message || 'Failed to save announcement', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(toDelete.id);
      showToast('Announcement deleted.', 'success');
      setToDelete(null);
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete announcement.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const importCsv = (file?: File) => {
    if (!file) return;
    setImporting(true);
    Papa.parse<AnnouncementCsvRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: async (parsed) => {
        try {
          if (parsed.errors.length) throw new Error(parsed.errors[0].message);
          const rows: AnnouncementInput[] = [];
          const invalidRows: number[] = [];
          parsed.data.forEach((row, index) => {
            const title = String(row.title ?? '').trim();
            const date = validIsoDate(String(row.date ?? ''));
            const content = String(row.content ?? '').trim();
            if (!title || !date || !content) invalidRows.push(index + 2);
            else rows.push({ title, date, content });
          });
          if (!rows.length) throw new Error('No valid announcement rows found. CSV headers must be Title, Date, and Content; dates must use YYYY-MM-DD.');
          await bulkInsertAnnouncements(rows);
          await reload();
          showToast(`Imported ${rows.length} announcement${rows.length === 1 ? '' : 's'}${invalidRows.length ? `; skipped ${invalidRows.length} invalid row${invalidRows.length === 1 ? '' : 's'}` : ''}.`, invalidRows.length ? 'info' : 'success');
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Unable to import announcements.', 'error');
        } finally {
          setImporting(false);
        }
      },
      error: (error) => {
        showToast(error.message || 'Unable to read CSV file.', 'error');
        setImporting(false);
      },
    });
  };

  const importPdf = async (file?: File) => {
    if (!file) return;
    setParsingPdf(true);
    try {
      const { extractAnnouncementsFromPDF } = await import('../lib/pdfImport');
      const extracted = await extractAnnouncementsFromPDF(file);
      setParsedAnnouncements(extracted);
      setPdfReviewOpen(true);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setParsingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const exportAllPdf = async () => {
    try {
      const { exportAnnouncementsToPDF } = await import('../lib/pdf');
      exportAnnouncementsToPDF(announcements);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const exportOnePdf = async (item: Announcement) => {
    try {
      const { exportSingleAnnouncementToPDF } = await import('../lib/pdf');
      exportSingleAnnouncementToPDF(item);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const updateParsedAnnouncement = (index: number, key: keyof ParsedPdfAnnouncement, value: string) => {
    setParsedAnnouncements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const savePdfImport = async () => {
    setPdfImporting(true);
    try {
      const rows = parsedAnnouncements.map((item) => ({ title: item.title.trim(), date: item.date, content: item.content.trim() }));
      await bulkCreateAnnouncements(rows);
      setPdfReviewOpen(false);
      setParsedAnnouncements([]);
      showToast(`Imported ${rows.length} announcement${rows.length === 1 ? '' : 's'}.`, 'success');
      await reload();
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setPdfImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="flex items-center gap-2 text-primary"><Bell aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">Church updates</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Announcements</h1><p className="mt-1 text-sm text-slate-600">Share news, events, and important notices with the congregation.</p></div>
        <div className="flex flex-wrap gap-2"><ExportButton<Announcement> data={announcements} filename="announcements" label="Export Announcements (CSV)" /><Button type="button" variant="outline" icon={<FileText aria-hidden="true" size={16} />} disabled={!announcements.length} onClick={() => void exportAllPdf()}>Export PDF</Button><input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => importCsv(event.target.files?.[0])} /><Button type="button" variant="outline" loading={importing} icon={<FileUp aria-hidden="true" size={16} />} onClick={() => fileInputRef.current?.click()}>Import CSV</Button><input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(event) => void importPdf(event.target.files?.[0])} /><Button type="button" variant="outline" loading={parsingPdf} icon={<FileUp aria-hidden="true" size={16} />} onClick={() => pdfInputRef.current?.click()}>Import PDF</Button><Button type="button" icon={<Plus aria-hidden="true" size={17} />} onClick={createNew}>New Announcement</Button></div>
      </header>

      <section aria-label="Announcements list" className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">All Announcements</h2><p className="mt-0.5 text-xs text-slate-500">{announcements.length} {announcements.length === 1 ? 'announcement' : 'announcements'}</p></div></div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading announcements...</div> : announcements.length === 0 ? <EmptyState title="No announcements yet" description="Create an announcement to share important information with the congregation." /> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Title</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Content Preview</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">{announcements.map((item) => <tr key={item.id} className="hover:bg-accent/40"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{item.title}</p></td><td className="whitespace-nowrap px-4 py-4"><Badge variant="primary"><span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" size={13} />{format(parseISO(item.date), 'd MMM yyyy')}</span></Badge></td><td className="max-w-xl px-4 py-4"><p className="line-clamp-2 text-sm leading-5 text-slate-600">{item.content}</p></td><td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" aria-label={`Download ${item.title} as PDF`} title="Download PDF" onClick={() => void exportOnePdf(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Download aria-hidden="true" size={16} /></button><button type="button" aria-label={`Edit ${item.title}`} onClick={() => editAnnouncement(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Pencil aria-hidden="true" size={16} /></button><button type="button" aria-label={`Delete ${item.title}`} onClick={() => setToDelete(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button></div></td></tr>)}</tbody></table></div>}
      </section>

      <Modal isOpen={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? 'Edit Announcement' : 'New Announcement'} maxWidth="lg">
        <form className="space-y-4" onSubmit={handleSubmit(save)} noValidate>
          <div><label htmlFor="announcement-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title <span className="text-danger">*</span></label><input id="announcement-title" autoFocus className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('title')} />{errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}</div>
          <div><label htmlFor="announcement-date" className="mb-1.5 block text-sm font-medium text-slate-700">Date <span className="text-danger">*</span></label><input id="announcement-date" type="date" className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('date')} />{errors.date && <p className="mt-1 text-xs text-danger">{errors.date.message}</p>}</div>
          <div><label htmlFor="announcement-content" className="mb-1.5 block text-sm font-medium text-slate-700">Content <span className="text-danger">*</span></label><textarea id="announcement-content" rows={6} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('content')} />{errors.content && <p className="mt-1 text-xs text-danger">{errors.content.message}</p>}</div>
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{editing ? 'Save Changes' : 'Publish Announcement'}</Button></div>
        </form>
      </Modal>

      <Modal isOpen={pdfReviewOpen} onClose={() => { if (!pdfImporting) setPdfReviewOpen(false); }} title="Review PDF Import" maxWidth="2xl">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Review and correct the extracted announcement fields before importing.</p>
          {parsedAnnouncements.length === 0 ? <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-slate-500">No announcements were extracted.</p> : <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">{parsedAnnouncements.map((item, index) => <fieldset key={`${index}-${item.title}`} className="space-y-3 rounded-xl border border-stone-200 p-4"><legend className="px-1 text-xs font-semibold text-slate-500">Announcement {index + 1}</legend><div><label htmlFor={`pdf-title-${index}`} className="mb-1 block text-xs font-medium text-slate-700">Title</label><input id={`pdf-title-${index}`} value={item.title} onChange={(event) => updateParsedAnnouncement(index, 'title', event.target.value)} className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></div><div><label htmlFor={`pdf-date-${index}`} className="mb-1 block text-xs font-medium text-slate-700">Date</label><input id={`pdf-date-${index}`} type="date" value={item.date} onChange={(event) => updateParsedAnnouncement(index, 'date', event.target.value)} className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></div><div><label htmlFor={`pdf-content-${index}`} className="mb-1 block text-xs font-medium text-slate-700">Content</label><textarea id={`pdf-content-${index}`} rows={4} value={item.content} onChange={(event) => updateParsedAnnouncement(index, 'content', event.target.value)} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></div></fieldset>)}</div>}
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button type="button" variant="outline" onClick={() => setPdfReviewOpen(false)} disabled={pdfImporting}>Cancel</Button><Button type="button" loading={pdfImporting} disabled={parsedAnnouncements.length === 0 || parsedAnnouncements.some((item) => !item.title.trim() || !item.content.trim() || !validIsoDate(item.date))} onClick={() => void savePdfImport()}>Import Parsed Announcements</Button></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => { if (!deleting) setToDelete(null); }} onConfirm={confirmDelete} title="Delete announcement" message={`Delete “${toDelete?.title ?? 'this announcement'}”? This action cannot be undone.`} confirmLabel="Delete Announcement" loading={deleting} />
    </div>
  );
}
