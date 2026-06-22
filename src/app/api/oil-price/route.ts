import { NextResponse } from 'next/server';
import { fetchOilPriceFromMainApp } from '@/lib/oil-price-api';

/**
 * GET /api/oil-price
 * Proxy ไปยังแอปหลักเพื่อดึงราคาน้ำมันดีเซล
 */
export async function GET() {
  try {
    const result = await fetchOilPriceFromMainApp();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[MESPACE API /oil-price] Error:', error);
    const bangkokToday = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return NextResponse.json(
      {
        date: bangkokToday,
        price: 42.25,
        history: [],
        source: 'fallback',
        livePrice: null,
        bangkokToday,
      },
      { status: 200 }
    );
  }
}
