import { format } from 'date-fns';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ParsedPdfAnnouncement {
  title: string;
  date: string;
  content: string;
}

const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/;
const labeledFieldPattern = /^(title|date|content)\s*:\s*(.*)$/i;

function findIsoDate(lines: string[]): { date: string | null; index: number } {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(isoDatePattern);
    if (match) return { date: match[0], index };
  }
  return { date: null, index: -1 };
}

function parseLabeled(text: string): ParsedPdfAnnouncement | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const values = new Map<string, string>();
  let currentField = '';
  for (const line of lines) {
    const match = line.match(labeledFieldPattern);
    if (match) {
      currentField = match[1].toLowerCase();
      values.set(currentField, match[2].trim());
      continue;
    }
    if (currentField === 'content') values.set('content', `${values.get('content') ?? ''}\n${line}`.trim());
    else if (currentField && !values.get(currentField)) values.set(currentField, line);
  }

  const dateMatch = values.get('date')?.match(isoDatePattern);
  if (values.has('title') && values.has('content') && dateMatch) {
    return { title: values.get('title') || 'Imported Announcement', date: dateMatch[0], content: values.get('content') || '' };
  }
  return null;
}

function parseUnlabeled(text: string): ParsedPdfAnnouncement | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const { date, index } = findIsoDate(lines);
  if (!date || index <= 0) return null;
  const title = lines.slice(0, index).join(' ').trim();
  const content = lines.slice(index + 1).join('\n').trim();
  if (!title || !content) return null;
  return { title, date, content };
}

export async function extractAnnouncementsFromPDF(file: File): Promise<ParsedPdfAnnouncement[]> {
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items.flatMap((item) => ('str' in item && typeof item.str === 'string' ? [item.str] : []));
    pageTexts.push(items.join('\n'));
  }

  const extractedText = pageTexts.join('\n\n').replace(/\u0000/g, '').trim();
  if (!extractedText) throw new Error('No readable text found in this PDF.');

  const labeled = parseLabeled(extractedText);
  if (labeled) return [labeled];
  const unlabeled = parseUnlabeled(extractedText);
  if (unlabeled) return [unlabeled];

  const lines = extractedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('No readable text found in this PDF.');
  const { date } = findIsoDate(lines);
  const titleIndex = date ? lines.findIndex((line) => isoDatePattern.test(line)) : -1;
  const title = lines[0].replace(/^title\s*:\s*/i, '').trim() || 'Imported Announcement';
  const contentLines = titleIndex >= 0 ? lines.filter((_, index) => index !== 0 && index !== titleIndex) : lines.slice(1);
  const content = contentLines.join('\n').replace(/^content\s*:\s*/i, '').trim() || extractedText;
  return [{ title, date: date ?? format(new Date(), 'yyyy-MM-dd'), content }];
}
