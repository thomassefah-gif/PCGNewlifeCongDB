import { supabase } from '../supabaseClient';

export interface ImportHistoryRecord {
  id: string;
  source: 'google_form' | 'csv' | 'manual' | string;
  file_name: string | null;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  errors: unknown;
  imported_by: string | null;
  created_at: string;
}

export interface ImportLogInput {
  source: 'google_form' | 'csv' | 'manual' | string;
  file_name: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  errors: unknown;
}

export interface BulkInsertResult {
  successful: number;
  failed: number;
  errors: Array<{ index: number; message: string; row: Record<string, unknown> }>;
}

export interface DuplicateCheckResult {
  emails: Set<string>;
  phones: Set<string>;
}

const MAX_MEMBER_ROWS_PER_INSERT = 100;

export async function getImports(): Promise<ImportHistoryRecord[]> {
  const { data, error } = await supabase
    .from('imports')
    .select('id,source,file_name,total_rows,successful_rows,failed_rows,errors,imported_by,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ImportHistoryRecord[];
}

export async function logImport(data: ImportLogInput): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const { error } = await supabase.from('imports').insert({
    source: data.source,
    file_name: data.file_name,
    total_rows: data.total_rows,
    successful_rows: data.successful_rows,
    failed_rows: data.failed_rows,
    errors: data.errors,
    imported_by: authData.user?.id ?? null,
  });
  if (error) throw error;
}

export async function bulkInsertMembers(members: Array<Record<string, unknown>>): Promise<BulkInsertResult> {
  const errors: BulkInsertResult['errors'] = [];
  let successful = 0;

  for (let start = 0; start < members.length; start += MAX_MEMBER_ROWS_PER_INSERT) {
    const chunk = members.slice(start, start + MAX_MEMBER_ROWS_PER_INSERT);
    const { error } = await supabase.from('members').insert(chunk);
    if (!error) {
      successful += chunk.length;
      continue;
    }

    // Retrying each row individually reports row-level validation/RLS failures while
    // allowing other valid rows in the same batch to be imported.
    const individualResults = await Promise.all(chunk.map(async (row, index) => {
      const { error: rowError } = await supabase.from('members').insert(row);
      return { row, index, error: rowError };
    }));
    for (const result of individualResults) {
      if (result.error) {
        errors.push({ index: start + result.index, message: result.error.message, row: result.row });
      } else {
        successful += 1;
      }
    }
  }

  return { successful, failed: errors.length, errors };
}

export async function checkDuplicates(emails: string[], phones: string[]): Promise<DuplicateCheckResult> {
  const emailValues = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const phoneValues = [...new Set(phones.map((phone) => phone.trim()).filter(Boolean))];
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();
  const valueChunkSize = 100;

  for (let start = 0; start < emailValues.length; start += valueChunkSize) {
    const chunk = emailValues.slice(start, start + valueChunkSize);
    const { data, error } = await supabase.from('members').select('email').in('email', chunk);
    if (error) throw error;
    for (const row of data ?? []) if (row.email) existingEmails.add(String(row.email).trim().toLowerCase());
  }

  for (let start = 0; start < phoneValues.length; start += valueChunkSize) {
    const chunk = phoneValues.slice(start, start + valueChunkSize);
    const { data, error } = await supabase.from('members').select('mobile_phone').in('mobile_phone', chunk);
    if (error) throw error;
    for (const row of data ?? []) if (row.mobile_phone) existingPhones.add(String(row.mobile_phone).trim());
  }

  return { emails: existingEmails, phones: existingPhones };
}
