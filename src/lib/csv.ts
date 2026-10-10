import Papa from 'papaparse';
import { format } from 'date-fns';
import { calculateAge } from './date';

interface ExportOptions {
  filename: string;
  isMemberData?: boolean;
}

/** Convert records to CSV and start a browser download. */
export function exportToCSV<T>(data: T[], options: ExportOptions): void {
  if (data.length === 0) {
    window.alert('No data available to export.');
    return;
  }

  const rows = options.isMemberData
    ? data.map((item) => {
        const record = item as T & { date_of_birth?: string | null };
        return { ...record, Calculated_Age: calculateAge(record.date_of_birth) ?? '' };
      })
    : data;
  const csv = Papa.unparse(rows as object[]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${options.filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
