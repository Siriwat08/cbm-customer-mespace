/**
 * Oil Price API — แอป MESPACE
 *
 * ดึงราคาน้ำมันดีเซลจากแอปหลักผ่าน MAIN_APP_API_URL
 *
 * Endpoint: GET {MAIN_APP_API_URL}/api/oil-price
 * Response: { date, price, history: OilPriceEntry[], source, livePrice, bangkokToday }
 */

import { getTodayISO } from './date-utils';
import type { OilPriceEntry } from './types';

export const FALLBACK_DIESEL_PRICE = 42.25;
export const LABOR_COST = 500;

export const CARGO_LIMITS = {
  MAX_DIMENSION_CM: 2000,
  MAX_WEIGHT_KG: 50000,
  MAX_QUANTITY: 1000,
} as const;

interface MainAppOilPriceResponse {
  date: string;
  price: number;
  history?: OilPriceEntry[];
  source?: string;
  livePrice?: { date: string; price: number } | null;
  bangkokToday?: string;
}

export async function fetchOilPriceFromMainApp(): Promise<{
  date: string;
  price: number;
  history: OilPriceEntry[];
  source: string;
  livePrice: { date: string; price: number } | null;
  bangkokToday: string;
}> {
  const mainAppUrl = process.env.MAIN_APP_API_URL;
  const bangkokToday = getTodayISO();

  if (!mainAppUrl) {
    console.warn('[OilPrice] MAIN_APP_API_URL not configured — using fallback price');
    return {
      date: bangkokToday,
      price: FALLBACK_DIESEL_PRICE,
      history: [],
      source: 'fallback',
      livePrice: null,
      bangkokToday,
    };
  }

  try {
    const baseUrl = mainAppUrl.replace(/\/$/, '');
    const url = `${baseUrl}/api/oil-price`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[OilPrice] Main app returned ${response.status} ${response.statusText}`);
      return {
        date: bangkokToday,
        price: FALLBACK_DIESEL_PRICE,
        history: [],
        source: 'fallback',
        livePrice: null,
        bangkokToday,
      };
    }

    const data: MainAppOilPriceResponse = await response.json();

    return {
      date: data.date || bangkokToday,
      price: typeof data.price === 'number' ? data.price : FALLBACK_DIESEL_PRICE,
      history: Array.isArray(data.history) ? data.history : [],
      source: data.source || 'main-app',
      livePrice: data.livePrice ?? null,
      bangkokToday: data.bangkokToday || bangkokToday,
    };
  } catch (error) {
    console.error('[OilPrice] Failed to fetch from main app:', error);
    return {
      date: bangkokToday,
      price: FALLBACK_DIESEL_PRICE,
      history: [],
      source: 'fallback',
      livePrice: null,
      bangkokToday,
    };
  }
}

export { convertThaiDateToISO, getTodayISO } from './date-utils';

/**
 * กฎราคาน้ำมันสำหรับ MESPACE:
 *   ราคาน้ำมันที่ประกาศ วันจันทร์ → ใช้คิดค่าขนส่ง ตั้งแต่ วันพุธ ถึง วันอังคาร
 *
 *   ตัวอย่าง:
 *   - วันจันทร์-อังคาร: ใช้ราคาจันทร์สัปดาห์ก่อนหน้า (รอบเก่ายังไม่หมด)
 *   - วันพุธ-อาทิตย์: ใช้ราคาจันทร์สัปดาห์ปัจจุบัน
 *
 * Returns:
 *   - price: ราคาน้ำมันที่ใช้คิดค่าขนส่ง
 *   - mondayDate: วันจันทร์ที่ประกาศราคานั้น (ISO)
 *   - periodStart: วันพุธเริ่มรอบ (ISO)
 *   - periodEnd: วันอังคารสิ้นสุดรอบ (ISO)
 */
export function getApplicableOilPrice(
  history: OilPriceEntry[],
  todayISO: string
): {
  price: number;
  mondayDate: string;
  periodStart: string;
  periodEnd: string;
} {
  // Parse today's date in Bangkok timezone
  const today = new Date(todayISO + 'T00:00:00');
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, ..., 6=Sat

  // Find the Monday of the "applicable" week
  // If today is Mon(1) or Tue(2): use LAST week's Monday
  // If today is Wed(3)-Sun(0): use THIS week's Monday
  let applicableMonday: Date;

  if (dayOfWeek === 1 || dayOfWeek === 2) {
    // จันทร์หรืออังคาร → ใช้ราคาจันทร์สัปดาห์ก่อนหน้า
    const daysSinceLastMonday = dayOfWeek === 1 ? 7 : 8; // Mon: go back 7 days, Tue: go back 8 days
    applicableMonday = new Date(today);
    applicableMonday.setDate(today.getDate() - daysSinceLastMonday);
  } else {
    // พุธ-อาทิตย์ → ใช้ราคาจันทร์สัปดาห์นี้
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sun: 6 days back, Wed: 2 days back
    applicableMonday = new Date(today);
    applicableMonday.setDate(today.getDate() - daysToMonday);
  }

  // Format applicable Monday as ISO
  const mondayISO = formatDateISO(applicableMonday);

  // Calculate period: Wed of that week to Tue of next week
  const periodStart = new Date(applicableMonday);
  periodStart.setDate(applicableMonday.getDate() + 2); // +2 = Wednesday

  const periodEnd = new Date(applicableMonday);
  periodEnd.setDate(applicableMonday.getDate() + 8); // +8 = Tuesday next week

  const periodStartISO = formatDateISO(periodStart);
  const periodEndISO = formatDateISO(periodEnd);

  // Find the oil price for that Monday from history
  // First try exact match on Monday
  const mondayEntry = history.find(entry => entry.date === mondayISO);
  if (mondayEntry) {
    return {
      price: mondayEntry.price,
      mondayDate: mondayISO,
      periodStart: periodStartISO,
      periodEnd: periodEndISO,
    };
  }

  // If no exact Monday entry, find the latest entry on or before that Monday
  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const beforeMonday = sortedHistory.find(entry => entry.date <= mondayISO);
  if (beforeMonday) {
    return {
      price: beforeMonday.price,
      mondayDate: beforeMonday.date,
      periodStart: periodStartISO,
      periodEnd: periodEndISO,
    };
  }

  // If no entry at all, find the earliest entry in history (better than fallback)
  if (sortedHistory.length > 0) {
    const earliest = sortedHistory[sortedHistory.length - 1];
    return {
      price: earliest.price,
      mondayDate: earliest.date,
      periodStart: periodStartISO,
      periodEnd: periodEndISO,
    };
  }

  // Absolute fallback
  return {
    price: FALLBACK_DIESEL_PRICE,
    mondayDate: mondayISO,
    periodStart: periodStartISO,
    periodEnd: periodEndISO,
  };
}

/** Format a Date object to YYYY-MM-DD */
function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
