const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzD0RN__3T2XTIFnMtiLZzXFFgraWkgsqXN-BzJXaKpSDm7P7KROJ0qUq_GyRnik5plAw/exec';

/** App edits go to this separate tab so the original Google Form responses are never modified. */
const APP_SHEET_NAME = 'App Members';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Mirrors a member create/update/delete to the Google Sheet. Never throws; failures are only logged. */
export async function syncToGoogleSheet(action: 'create' | 'update' | 'delete', memberData: any, originalMember?: any): Promise<void> {
  if (!GOOGLE_SHEET_WEBHOOK_URL || GOOGLE_SHEET_WEBHOOK_URL.includes('YOUR_COPIED_WEB_APP_URL')) return;

  const body = {
    action,
    source: 'app',
    targetSheet: APP_SHEET_NAME,
    matchEmail: originalMember?.email || memberData?.email || '',
    matchPhone: originalMember?.mobile_phone || originalMember?.phone_number || memberData?.mobile_phone || memberData?.phone_number || '',
    matchFirst: originalMember?.first_name || memberData?.first_name || '',
    matchLast: originalMember?.last_name || originalMember?.surname || memberData?.last_name || memberData?.surname || '',
    payload: memberData,
  };

  try {
    await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('Google Sheet webhook note:', err);
  }
}
