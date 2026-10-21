import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { format, isValid, parseISO } from 'date-fns';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, FileUp, RotateCcw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { bulkInsertMembers, checkDuplicates, getImports, logImport, type DuplicateCheckResult, type ImportHistoryRecord } from '../lib/queries/imports';

type ImportStep = 1 | 2 | 3 | 4;
type ImportField = 'first_name' | 'surname' | 'email' | 'mobile_phone' | 'sex' | 'date_of_birth';
type Mapping = Record<ImportField, string>;
type CsvRow = Record<string, string>;
interface PreviewRow {
  rowNumber: number;
  original: CsvRow;
  member: Record<string, unknown>;
  errors: string[];
}

const fields: Array<{ key: ImportField; label: string; required?: boolean }> = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'surname', label: 'Surname', required: true },
  { key: 'email', label: 'Email' },
  { key: 'mobile_phone', label: 'Mobile Phone' },
  { key: 'sex', label: 'Sex' },
  { key: 'date_of_birth', label: 'Date of Birth' },
];

const blankMapping: Mapping = {
  first_name: '', surname: '', email: '', mobile_phone: '', sex: '', date_of_birth: '',
};

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePhone(value: unknown): string {
  return String(value ?? '').trim();
}

function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseISO(trimmed);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && isValid(parsed) && format(parsed, 'yyyy-MM-dd') === trimmed ? trimmed : null;
}

function buildMember(row: CsvRow, mapping: Mapping): Record<string, unknown> {
  const value = (field: ImportField) => mapping[field] ? String(row[mapping[field]] ?? '').trim() : '';
  const sexValue = value('sex');
  return {
    first_name: value('first_name'),
    surname: value('surname'),
    email: value('email') || null,
    mobile_phone: value('mobile_phone') || null,
    sex: sexValue || null,
    date_of_birth: toIsoDate(value('date_of_birth')),
    date_of_birth_is_estimated: false,
    status: 'Active',
    is_distant_member: false,
    date_joined_new_life: null,
    date_joined_new_life_is_estimated: false,
    date_joined_pcg_is_estimated: false,
  };
}

function sourceLabel(source: string): string {
  return source.replace(/_/g, ' ');
}

export default function ImportsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>(blankMapping);
  const [duplicates, setDuplicates] = useState<DuplicateCheckResult>({ emails: new Set(), phones: new Set() });
  const [history, setHistory] = useState<ImportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ total: number; successful: number; failed: number; errors: Array<{ rowNumber: number; message: string }> } | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await getImports());
    } catch (error) {
      setHistory([]);
      showToast(error instanceof Error ? error.message : 'Unable to load import history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    const emailSeen = new Set<string>();
    const phoneSeen = new Set<string>();
    return csvRows.map((row, index) => {
      const member = buildMember(row, mapping);
      const errors: string[] = [];
      if (!String(member.first_name ?? '').trim()) errors.push('First name is required.');
      if (!String(member.surname ?? '').trim()) errors.push('Surname is required.');
      const mappedSex = mapping.sex ? String(row[mapping.sex] ?? '').trim() : '';
      if (mappedSex && mappedSex !== 'Male' && mappedSex !== 'Female') errors.push('Sex must be Male or Female.');
      const rawDob = mapping.date_of_birth ? String(row[mapping.date_of_birth] ?? '').trim() : '';
      if (rawDob && !member.date_of_birth) errors.push('Date of birth must use YYYY-MM-DD format.');
      const email = normalizeEmail(member.email);
      const phone = normalizePhone(member.mobile_phone);
      if (email && duplicates.emails.has(email)) errors.push('Email already exists in the member database.');
      if (phone && duplicates.phones.has(phone)) errors.push('Mobile phone already exists in the member database.');
      if (email && emailSeen.has(email)) errors.push('Email appears more than once in this file.');
      if (phone && phoneSeen.has(phone)) errors.push('Mobile phone appears more than once in this file.');
      if (email) emailSeen.add(email);
      if (phone) phoneSeen.add(phone);
      if (member.sex && member.sex !== 'Male' && member.sex !== 'Female') errors.push('Sex value is invalid.');
      return { rowNumber: index + 2, original: row, member, errors };
    });
  }, [csvRows, duplicates, mapping]);

  const importableRows = useMemo(() => previewRows.filter((row) => row.errors.length === 0), [previewRows]);
  const invalidRows = useMemo(() => previewRows.filter((row) => row.errors.length > 0), [previewRows]);

  const parseFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setParseError('Select a CSV file to continue.');
      return;
    }
    setParseError(null);
    Papa.parse<CsvRow>(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: (parsed) => {
        if (parsed.errors.length > 0) {
          setParseError(parsed.errors.slice(0, 3).map((error) => `Row ${error.row ?? '?'}: ${error.message}`).join(' '));
          setFile(null);
          setCsvRows([]);
          setHeaders([]);
          return;
        }
        const parsedHeaders = parsed.meta.fields ?? [];
        if (!parsedHeaders.length) {
          setParseError('The selected CSV file does not contain a header row.');
          return;
        }
        const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
        setFile(selectedFile);
        setHeaders(parsedHeaders);
        setCsvRows(rows);
        setMapping({ ...blankMapping });
        setDuplicates({ emails: new Set(), phones: new Set() });
        setResult(null);
      },
      error: (error) => setParseError(error.message || 'Unable to read this CSV file.'),
    });
  };

  const requiredMappingsComplete = Boolean(mapping.first_name && mapping.surname);

  const proceedToReview = async () => {
    if (!requiredMappingsComplete) {
      showToast('Map First Name and Surname before reviewing the import.', 'error');
      return;
    }
    setChecking(true);
    try {
      const mapped = csvRows.map((row) => buildMember(row, mapping));
      const duplicateResult = await checkDuplicates(
        mapped.map((member) => String(member.email ?? '')).filter(Boolean),
        mapped.map((member) => String(member.mobile_phone ?? '')).filter(Boolean),
      );
      setDuplicates(duplicateResult);
      setStep(3);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to check for duplicate members.', 'error');
    } finally {
      setChecking(false);
    }
  };

  const executeImport = async () => {
    if (!file) return;
    setImporting(true);
    const skippedErrors = invalidRows.map((row) => ({ rowNumber: row.rowNumber, message: row.errors.join(' ') }));
    let successful = 0;
    let failed = invalidRows.length;
    let rowErrors = [...skippedErrors];
    try {
      const insertResult = await bulkInsertMembers(importableRows.map((row) => row.member));
      successful = insertResult.successful;
      failed += insertResult.failed;
      rowErrors = [...rowErrors, ...insertResult.errors.map((entry) => ({ rowNumber: entry.index + 2, message: entry.message }))];
      try {
        await logImport({
          source: 'csv',
          file_name: file.name,
          total_rows: csvRows.length,
          successful_rows: successful,
          failed_rows: failed,
          errors: rowErrors,
        });
      } catch (logError) {
        showToast(`Members were imported, but the import history could not be recorded: ${logError instanceof Error ? logError.message : 'unknown error'}`, 'error');
      }
      setResult({ total: csvRows.length, successful, failed, errors: rowErrors });
      setStep(4);
      showToast(`Import complete: ${successful} successful, ${failed} failed.`, failed ? 'info' : 'success');
      await refreshHistory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to import member rows.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setCsvRows([]);
    setMapping({ ...blankMapping });
    setDuplicates({ emails: new Set(), phones: new Set() });
    setParseError(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const stepLabels = ['Upload file', 'Map columns', 'Review data', 'Import result'];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-2 text-primary"><FileSpreadsheet aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">Data tools</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">CSV Imports</h1><p className="mt-1 text-sm text-slate-600">Import member records and review previous import batches.</p></div>
        {role === 'admin' && <Button type="button" icon={<Upload aria-hidden="true" size={16} />} onClick={resetWizard}>Start New Import</Button>}
      </header>

      {role !== 'admin' ? <div role="alert" className="rounded-2xl border border-danger/20 bg-danger/5 p-5 text-sm text-danger">Administrator access is required to import members.</div> : <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4 sm:px-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Import wizard</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{step === 4 ? 'Import complete' : 'Start New Import'}</h2></div><ol aria-label="Import steps" className="flex flex-wrap items-center gap-2">{stepLabels.map((label, index) => { const stepNumber = index + 1; const current = step === stepNumber; const done = step > stepNumber; return <li key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${current ? 'bg-primary text-white' : done ? 'bg-success/10 text-success' : 'bg-stone-100 text-slate-500'}`}><span>{done ? <CheckCircle2 aria-hidden="true" size={13} /> : stepNumber}</span><span className="hidden sm:inline">{label}</span></li>; })}</ol></div></div>

        <div className="p-5 sm:p-6">
          {step === 1 && <div className="mx-auto max-w-2xl space-y-5">
            <div><h3 className="font-semibold text-slate-900">Upload a CSV file</h3><p className="mt-1 text-sm text-slate-500">Choose a comma-separated file with a header row. First Name and Surname are required during mapping.</p></div>
            <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setFileDragOver(true); }} onDragLeave={() => setFileDragOver(false)} onDrop={(event) => { event.preventDefault(); setFileDragOver(false); parseFile(event.dataTransfer.files[0]); }} className={`flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${fileDragOver ? 'border-primary bg-primary/5' : 'border-stone-300 bg-stone-50 hover:border-primary/50 hover:bg-primary/5'}`}>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileUp aria-hidden="true" size={25} /></span><span className="mt-4 text-sm font-semibold text-slate-800">Drop a CSV file here or browse files</span><span className="mt-1 text-xs text-slate-500">CSV files only</span>{file && <span className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-medium text-primary">{file.name}</span>}
            </button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => parseFile(event.target.files?.[0])} />
            {parseError && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{parseError}</p>}
            {csvRows.length > 0 && <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-4"><div><p className="text-sm font-semibold text-slate-800">{file?.name}</p><p className="mt-0.5 text-xs text-slate-500">{headers.length} columns · {csvRows.length} data rows</p></div><Button type="button" icon={<ArrowRight aria-hidden="true" size={16} />} onClick={() => setStep(2)}>Continue to Mapping</Button></div>}
          </div>}

          {step === 2 && <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex items-center gap-3"><Button type="button" variant="ghost" size="sm" icon={<ArrowLeft aria-hidden="true" size={15} />} onClick={() => setStep(1)}>Back</Button><div><h3 className="font-semibold text-slate-900">Map CSV columns</h3><p className="mt-1 text-sm text-slate-500">Choose the source header matching each member field. Required fields have an asterisk.</p></div></div>
            <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200">{fields.map((field) => <div key={field.key} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_1.2fr] sm:items-center"><label htmlFor={`map-${field.key}`} className="text-sm font-medium text-slate-700">{field.label}{field.required && <span className="ml-1 text-danger">*</span>}</label><select id={`map-${field.key}`} value={mapping[field.key]} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"><option value="">Do not import</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div>)}</div>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Unmapped member fields will use safe blank/default values.</p><Button type="button" icon={<ArrowRight aria-hidden="true" size={16} />} loading={checking} disabled={!requiredMappingsComplete} onClick={() => void proceedToReview()}>Next: Review Data</Button></div>
          </div>}

          {step === 3 && <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">Review &amp; validation</h3><Badge variant="active">{importableRows.length} ready</Badge>{invalidRows.length > 0 && <Badge variant="inactive">{invalidRows.length} with issues</Badge>}</div><p className="mt-1 text-sm text-slate-500">Rows with validation issues or existing duplicate email/phone values are skipped.</p></div><div className="flex gap-2"><Button type="button" variant="outline" icon={<ArrowLeft aria-hidden="true" size={15} />} onClick={() => setStep(2)}>Edit Mapping</Button><Button type="button" disabled={!importableRows.length} loading={importing} onClick={() => void executeImport()}>Import {importableRows.length} Members</Button></div></div>
            {previewRows.length === 0 ? <EmptyState title="No data rows" description="This CSV contains headers but no member records to import." /> : <div className="max-h-[520px] overflow-auto rounded-xl border border-stone-200"><table className="w-full min-w-[880px] border-collapse text-left"><thead className="sticky top-0 bg-stone-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Row</th><th className="px-3 py-3">First Name</th><th className="px-3 py-3">Surname</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Sex</th><th className="px-3 py-3">Date of Birth</th><th className="px-3 py-3">Validation</th></tr></thead><tbody className="divide-y divide-stone-100">{previewRows.map((row) => <tr key={row.rowNumber} className={row.errors.length ? 'bg-danger/5' : 'hover:bg-accent/40'}><td className="px-3 py-3 text-xs text-slate-500">{row.rowNumber}</td><td className="px-3 py-3 text-sm text-slate-800">{String(row.member.first_name || '—')}</td><td className="px-3 py-3 text-sm text-slate-800">{String(row.member.surname || '—')}</td><td className="px-3 py-3 text-xs text-slate-600">{String(row.member.email || '—')}</td><td className="px-3 py-3 text-xs text-slate-600">{String(row.member.mobile_phone || '—')}</td><td className="px-3 py-3 text-xs text-slate-600">{String(row.member.sex || '—')}</td><td className="px-3 py-3 text-xs text-slate-600">{String(row.member.date_of_birth || '—')}</td><td className="max-w-64 px-3 py-3 text-xs">{row.errors.length ? <span className="inline-flex items-start gap-1.5 text-danger"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span>{row.errors.join(' ')}</span></span> : <span className="font-medium text-success">Ready</span>}</td></tr>)}</tbody></table></div>}
          </div>}

          {step === 4 && result && <div className="mx-auto max-w-2xl py-4 text-center">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${result.failed ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{result.failed ? <AlertCircle aria-hidden="true" size={29} /> : <CheckCircle2 aria-hidden="true" size={30} />}</div>
            <h3 className="mt-4 text-xl font-semibold text-slate-900">Import complete</h3><p className="mt-2 text-sm text-slate-600">{result.successful} of {result.total} member rows were imported successfully.</p>
            <div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3"><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-slate-500">Total</p><p className="mt-1 text-xl font-bold text-slate-900">{result.total}</p></div><div className="rounded-xl bg-success/5 p-3"><p className="text-xs text-slate-500">Success</p><p className="mt-1 text-xl font-bold text-success">{result.successful}</p></div><div className="rounded-xl bg-danger/5 p-3"><p className="text-xs text-slate-500">Failed</p><p className="mt-1 text-xl font-bold text-danger">{result.failed}</p></div></div>
            {result.errors.length > 0 && <details className="mt-5 rounded-xl border border-stone-200 p-4 text-left"><summary className="cursor-pointer text-sm font-semibold text-slate-700">View {result.errors.length} skipped/failed rows</summary><ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-danger">{result.errors.map((item, index) => <li key={`${item.rowNumber}-${index}`}>Row {item.rowNumber}: {item.message}</li>)}</ul></details>}
            <div className="mt-6 flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" icon={<RotateCcw aria-hidden="true" size={15} />} onClick={resetWizard}>Start Another Import</Button><Button type="button" onClick={() => navigate('/contacts')}>View Contacts</Button></div>
          </div>}
        </div>
      </section>}

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="Import history">
        <div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Import History</h2><p className="mt-0.5 text-xs text-slate-500">Previous CSV and member data import batches</p></div>
        {historyLoading ? <div className="animate-pulse px-6 py-12 text-center text-sm text-slate-500">Loading import history...</div> : history.length === 0 ? <EmptyState title="No import history yet" description="Completed import batches will be recorded here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Date</th><th className="px-4 py-3.5">File Name</th><th className="px-4 py-3.5">Source</th><th className="px-4 py-3.5 text-right">Total Rows</th><th className="px-4 py-3.5 text-right">Success</th><th className="px-4 py-3.5 text-right">Failed</th></tr></thead><tbody className="divide-y divide-stone-100">{history.map((record) => <tr key={record.id} className="hover:bg-accent/40"><td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">{format(new Date(record.created_at), 'd MMM yyyy, p')}</td><td className="max-w-64 truncate px-4 py-3.5 text-sm font-medium text-slate-800">{record.file_name || '—'}</td><td className="px-4 py-3.5"><Badge variant="gray">{sourceLabel(record.source)}</Badge></td><td className="px-4 py-3.5 text-right text-sm text-slate-700">{record.total_rows}</td><td className="px-4 py-3.5 text-right text-sm font-medium text-success">{record.successful_rows}</td><td className="px-4 py-3.5 text-right text-sm font-medium text-danger">{record.failed_rows}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
