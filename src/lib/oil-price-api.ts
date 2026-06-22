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
