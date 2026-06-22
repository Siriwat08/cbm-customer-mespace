/**
 * Date Utilities - Standardized date handling
 *
 * Storage format: ISO YYYY-MM-DD
 * Display format: DD/MM/YYYY (Christian era, e.g. 28/05/2026)
 * Thai format: DD/MM/BBBB (Buddhist era, e.g. 28/05/2569)
 *
 * The functions are designed to be robust against various input formats
 * that might come from Edge Config or the Bangchak API.
 */

const THAI_MONTHS: Record<string, string> = {
  '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.',
  '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.',
  '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.',
};

/**
 * Convert any date input to DD/MM/YYYY (Christian era) for display.
 * Handles: ISO format, Thai Buddhist format, timestamps, and edge cases.
 */
export function formatDisplayDate(dateInput: unknown): string {
  if (!dateInput) return '-';
  if (typeof dateInput === 'number') {
    // Unix timestamp
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString();
    return `${day}/${month}/${year}`;
  }

  const str = String(dateInput).trim();
  if (!str) return '-';

  // Already in DD/MM/YYYY or DD/MM/BBBB format
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [day, month, yearStr] = parts;
      const year = parseInt(yearStr);
      if (isNaN(year)) return str;
      // If Buddhist era (> 2400), convert to Christian era
      if (year > 2400) {
        return `${day}/${month}/${year - 543}`;
      }
      return str;
    }
  }

  // ISO format: YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const [yearStr, month, day] = parts;
      const year = parseInt(yearStr);
      if (isNaN(year)) return str;
      // If year is Buddhist era (rare but possible), convert
      if (year > 2400) {
        return `${day}/${month}/${year - 543}`;
      }
      return `${day}/${month}/${yearStr}`;
    }
  }

  // Try Date constructor as last resort
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear().toString();
      return `${day}/${month}/${year}`;
    }
  } catch {
    // ignore
  }

  return str;
}

// Convert ISO date to Thai display format (DD/MM/BBBB)
export function formatThaiDate(isoDate: string): string {
  if (!isoDate) return '';

  // Already in DD/MM/YYYY or DD/MM/BBBB format
  if (isoDate.includes('/') && isoDate.split('/').length === 3) {
    const parts = isoDate.split('/');
    const year = parseInt(parts[2]);
    // If already Buddhist era
    if (year > 2400) {
      return isoDate;
    }
    // Convert Christian to Buddhist era
    return `${parts[0]}/${parts[1]}/${year + 543}`;
  }

  // ISO format: YYYY-MM-DD
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const buddhistYear = parseInt(year) + 543;
    return `${day}/${month}/${buddhistYear}`;
  }

  return isoDate;
}

// Convert Thai date (DD/MM/BBBB) to ISO (YYYY-MM-DD)
// Also works as the robust version that handles both Buddhist and Christian era years
export function convertThaiDateToISO(dateStr: string): string {
  if (!dateStr) return '';

  // Already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Thai format (DD/MM/BBBB) e.g. "27/05/2569"
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, yearStr] = parts;
      const year = parseInt(yearStr);
      if (!isNaN(year)) {
        // If Buddhist era (> 2400), convert to Christian era
        const christianYear = year > 2400 ? year - 543 : year;
        return `${christianYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // Return as-is if can't parse
  return dateStr;
}

/** @deprecated Use convertThaiDateToISO instead — it handles both Buddhist and Christian era years */
export function thaiDateToISO(thaiDate: string): string {
  return convertThaiDateToISO(thaiDate);
}

// Get today's date in ISO format (Bangkok timezone, NOT server UTC)
// CRITICAL: Vercel servers run in UTC, so new Date() returns UTC time.
// When it's 23:00 in Bangkok (May 29), UTC is already 00:00 (May 30).
// We MUST use Asia/Bangkok timezone to get the correct date for Thailand.
export function getTodayISO(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Get today's date in Thai format (Bangkok timezone)
export function getTodayThai(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());

  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = (parseInt(parts.find(p => p.type === 'year')?.value || '0') + 543).toString();

  return `${day}/${month}/${year}`;
}

// Get Thai month name
export function getThaiMonth(month: string): string {
  return THAI_MONTHS[month] || month;
}

// Format Thai date with month name
export function formatThaiDateLong(isoDate: string): string {
  if (!isoDate) return '';

  let day: string, month: string, year: string;

  if (isoDate.includes('-')) {
    const parts = isoDate.split('-');
    year = (parseInt(parts[0]) + 543).toString();
    month = parts[1];
    day = parseInt(parts[2]).toString();
  } else if (isoDate.includes('/')) {
    const parts = isoDate.split('/');
    day = parseInt(parts[0]).toString();
    month = parts[1];
    year = parts[2];
    if (parseInt(year) < 2400) year = (parseInt(year) + 543).toString();
  } else {
    return isoDate;
  }

  return `${day} ${getThaiMonth(month)} ${year}`;
}
