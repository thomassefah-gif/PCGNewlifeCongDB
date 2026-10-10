import { format, parseISO, isValid } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Announcement } from './queries/announcements';

const CHURCH_BLUE: [number, number, number] = [29, 78, 216];

function displayDate(value: string): string {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy') : value;
}

function safeFilename(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'announcement';
}

function addDocumentHeader(document: jsPDF, title: string): number {
  const pageWidth = document.internal.pageSize.getWidth();
  document.setFillColor(...CHURCH_BLUE);
  document.rect(0, 0, pageWidth, 11, 'F');
  document.setTextColor(...CHURCH_BLUE);
  document.setFont('helvetica', 'bold');
  document.setFontSize(17);
  document.text('New Life Congregation', 15, 23);
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.setTextColor(75, 85, 99);
  document.text('Presbyterian Church of Ghana — Ga West Presbytery', 15, 30);
  document.setFont('helvetica', 'bold');
  document.setFontSize(14);
  document.setTextColor(31, 41, 55);
  document.text(title, 15, 43);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(100, 116, 139);
  document.text(`Generated ${format(new Date(), 'd MMM yyyy')}`, pageWidth - 15, 43, { align: 'right' });
  return 51;
}

export function exportAnnouncementsToPDF(announcements: Announcement[]): void {
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addDocumentHeader(document, 'Announcements');

  if (announcements.length === 0) {
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    document.setTextColor(100, 116, 139);
    document.text('No announcements available.', 15, startY + 10);
  } else {
    autoTable(document, {
      startY,
      head: [['Title', 'Date', 'Content']],
      body: announcements.map((item) => [item.title, displayDate(item.date), item.content]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: CHURCH_BLUE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 27 }, 2: { cellWidth: 'auto' } },
      margin: { left: 15, right: 15 },
    });
  }

  document.save(`announcements_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function exportSingleAnnouncementToPDF(announcement: Announcement): void {
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addDocumentHeader(document, 'Announcement');
  const pageWidth = document.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 30;

  document.setTextColor(...CHURCH_BLUE);
  document.setFont('helvetica', 'bold');
  document.setFontSize(18);
  const titleLines = document.splitTextToSize(announcement.title, contentWidth);
  document.text(titleLines, 15, startY + 8);

  const dateY = startY + 8 + titleLines.length * 8;
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.setTextColor(100, 116, 139);
  document.text(displayDate(announcement.date), 15, dateY + 1);
  document.setDrawColor(226, 232, 240);
  document.line(15, dateY + 7, pageWidth - 15, dateY + 7);

  document.setTextColor(31, 41, 55);
  document.setFontSize(12);
  const contentLines = document.splitTextToSize(announcement.content, contentWidth);
  document.text(contentLines, 15, dateY + 17, { lineHeightFactor: 1.5 });

  document.save(`${safeFilename(announcement.title)}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
