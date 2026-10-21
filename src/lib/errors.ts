/** Supabase errors are plain objects, not Error instances, so String(err) yields "[object Object]". */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const { message, details, hint, code } = err as Record<string, unknown>;
    const parts = [message, details, hint].filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (parts.length > 0) return code ? `${parts.join(' - ')} (${String(code)})` : parts.join(' - ');
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
  return String(err);
}
