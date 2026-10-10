import { differenceInYears, format, isValid, parseISO } from 'date-fns';

/** Calculate a person's current age from an ISO date of birth. */
export function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;

  const parsedDate = parseISO(dateOfBirth);
  if (!isValid(parsedDate) || parsedDate > new Date()) return null;

  return differenceInYears(new Date(), parsedDate);
}

/** Format an ISO date as d MMM yyyy, returning an em dash for missing/invalid values. */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';

  const parsedDate = parseISO(dateString);
  return isValid(parsedDate) ? format(parsedDate, 'd MMM yyyy') : '—';
}
