/**
 * App -> Google Sheet sync handler.
 *
 * Writes member create/update/delete from the React app into a SEPARATE tab ("App Members")
 * of the same spreadsheet. The Google Form responses tab is never touched.
 *
 * Install:
 *  1. Paste this file into your Apps Script project (keep your existing Form -> Supabase code).
 *  2. In your existing doPost(e), add at the very top:
 *       const body = JSON.parse(e.postData.contents);
 *       if (body && body.source === 'app') return handleAppSync_(body);
 *  3. Deploy > Manage deployments > edit > New version (keeps the same /exec URL).
 *     The Web App must run as you and allow access to "Anyone".
 */
const APP_SHEET_DEFAULT_NAME = 'App Members';

function handleAppSync_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getOrCreateAppSheet_(body.targetSheet || APP_SHEET_DEFAULT_NAME);
    const payload = body.payload || {};
    const flat = flattenPayload_(payload);
    flat.synced_at = new Date().toISOString();
    const header = ensureHeader_(sheet, Object.keys(flat));
    const rowIndex = findRow_(sheet, header, body, payload);

    if (body.action === 'delete') {
      if (rowIndex > 0) sheet.deleteRow(rowIndex);
      return json_({ ok: true, action: 'delete', found: rowIndex > 0 });
    }

    const columns = readHeader_(sheet);
    if (rowIndex > 0) {
      // Columns missing from this payload keep their existing cell values.
      const range = sheet.getRange(rowIndex, 1, 1, columns.length);
      const existing = range.getValues()[0];
      range.setValues([columns.map(function (name, i) {
        return Object.prototype.hasOwnProperty.call(flat, name) ? flat[name] : existing[i];
      })]);
    } else {
      sheet.appendRow(columns.map(function (name) {
        return Object.prototype.hasOwnProperty.call(flat, name) ? flat[name] : '';
      }));
    }
    return json_({ ok: true, action: body.action, updated: rowIndex > 0 });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateAppSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function readHeader_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
}

// Returns a map of column name -> 0-based index, adding any missing columns to row 1.
function ensureHeader_(sheet, keys) {
  const header = readHeader_(sheet);
  const missing = keys.filter(function (key) { return header.indexOf(key) === -1; });
  if (missing.length) {
    sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, header.length + missing.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const map = {};
  readHeader_(sheet).forEach(function (name, i) { map[name] = i; });
  return map;
}

function flattenPayload_(payload) {
  const out = {};
  Object.keys(payload).forEach(function (key) {
    const value = payload[key];
    if (value === null || value === undefined) { out[key] = ''; return; }
    if (typeof value === 'object') { out[key] = JSON.stringify(value); return; }
    out[key] = value;
  });
  return out;
}

function digits_(value) { return String(value || '').replace(/\D/g, ''); }
function norm_(value) { return String(value || '').trim().toLowerCase(); }

// Match priority: Supabase id, then email, phone, first+last name (values from the member BEFORE the edit).
function findRow_(sheet, header, body, payload) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const cell = function (row, name) { return header[name] === undefined ? '' : row[header[name]]; };

  const id = norm_(payload.id);
  const email = norm_(body.matchEmail);
  const phone = digits_(body.matchPhone);
  const first = norm_(body.matchFirst);
  const last = norm_(body.matchLast);

  if (id) {
    for (let i = 0; i < data.length; i++) {
      if (norm_(cell(data[i], 'id')) === id) return i + 2;
    }
  }
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (email && norm_(cell(row, 'email')) === email) return i + 2;
    if (phone && (digits_(cell(row, 'mobile_phone')) === phone || digits_(cell(row, 'phone_number')) === phone)) return i + 2;
    if (first && last && norm_(cell(row, 'first_name')) === first &&
        (norm_(cell(row, 'surname')) === last || norm_(cell(row, 'last_name')) === last)) return i + 2;
  }
  return -1;
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
