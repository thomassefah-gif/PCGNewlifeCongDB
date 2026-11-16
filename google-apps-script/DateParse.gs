/**
 * Converts a Google Form / Sheet date cell into an ISO date (YYYY-MM-DD) for Supabase.
 * Sheet dates are month/day/year (e.g. 11/6/2000 = 6 November 2000).
 * Use it where your Form -> Supabase code builds the member row:
 *   date_of_birth: toIsoDate_(row['Date of Birth'])
 * Returns null for empty or unreadable values.
 */
function toIsoDate_(value) {
  if (value === null || value === undefined || value === '') return null;

  var y, m, d;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    y = value.getFullYear(); m = value.getMonth() + 1; d = value.getDate();
  } else {
    var text = String(value).trim();
    var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    var us = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(text);
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (us) { m = +us[1]; d = +us[2]; y = +us[3]; }
    else return null;
  }

  var check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
