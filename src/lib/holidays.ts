// src/lib/holidays.ts
// วันหยุดนักขัตฤกษ์ — อ้างอิงประกาศ SCG JWD Logistics ฉบับที่ 007/2568 (เรื่อง วันหยุดประจำปี 2569)
// อัพเดทปีละครั้งทุกต้นปี

export const THAI_HOLIDAYS: Record<string, string[]> = {
  "2026": [
    "2026-01-01", // วันขึ้นปีใหม่
    "2026-03-03", // วันมาฆบูชา
    "2026-04-06", // วันจักรี
    "2026-04-13", // วันสงกรานต์
    "2026-04-14", // วันสงกรานต์
    "2026-04-15", // วันสงกรานต์
    "2026-05-01", // วันแรงงานแห่งชาติ
    "2026-05-04", // วันฉัตรมงคล
    "2026-06-01", // วันหยุดชดเชย วันวิสาขบูชา
    "2026-06-03", // วันเฉลิมพระชนมพรรษา พระบรมราชินี
    "2026-07-28", // วันเฉลิมพระชนมพรรษา ร.10
    "2026-07-29", // วันอาสาฬห์บูชา
    "2026-08-12", // วันแม่แห่งชาติ
    "2026-10-13", // วันคล้ายวันสวรรคต ร.9
    "2026-10-23", // วันปิยมหาราช
    "2026-12-05", // วันพ่อแห่งชาติ (กลุ่มปฏิบัติงาน 6 วัน/สัปดาห์)
    "2026-12-07", // วันหยุดชดเชย วันพ่อ (กลุ่มสำนักงาน 5 วัน/สัปดาห์)
    "2026-12-31", // วันสิ้นปี
  ],
};

/**
 * ตรวจว่า dateStr เป็นวันหยุดนักขัตฤกษ์ไหม
 * @param dateStr  string 'YYYY-MM-DD' (ค่าจาก <input type="date">)
 */
export function isThaiHoliday(dateStr: string): boolean {
  if (!dateStr) return false;
  const year = dateStr.substring(0, 4);
  const yearHols = THAI_HOLIDAYS[year] ?? [];
  return yearHols.includes(dateStr);
}

export interface ServiceFeeInfo {
  hasFee: boolean;
  /** ข้อความเหตุผลสั้น เช่น "วันอาทิตย์" | "วันหยุดนักขัตฤกษ์" | "นอกเวลาบริการ (14:00–20:00)" */
  reason: string;
}

/**
 * คำนวณว่าการบริการในวัน/เวลานี้ต้องจ่ายค่าบริการพิเศษไหม
 *
 * กฎ:
 *   - วันอาทิตย์          → +฿700 ทุกช่วงเวลา
 *   - วันหยุดนักขัตฤกษ์   → +฿700 ทุกช่วงเวลา
 *   - วันธรรมดา นอกเวลา  → +฿700 เฉพาะก่อน 14:00 หรือ หลัง 20:00
 *
 * @param dateStr  'YYYY-MM-DD'
 * @param timeStr  'HH:MM'
 */
export function getServiceFeeInfo(dateStr: string, timeStr: string): ServiceFeeInfo {
  if (!dateStr || !timeStr) return { hasFee: false, reason: "" };

  // แยก y/m/d แล้วสร้าง local Date (หลีกเลี่ยง timezone offset ของ new Date(string))
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  // ① วันอาทิตย์
  if (dateObj.getDay() === 0) {
    return { hasFee: true, reason: "วันอาทิตย์" };
  }

  // ② วันหยุดนักขัตฤกษ์
  if (isThaiHoliday(dateStr)) {
    return { hasFee: true, reason: "วันหยุดนักขัตฤกษ์" };
  }

  // ③ นอกเวลาบริการปกติ
  const [hourText, minuteText] = timeStr.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hasFee: false, reason: "" };

  const totalMinutes = hour * 60 + minute;
  const normalStart = 14 * 60; // 14:00
  const normalEnd   = 20 * 60; // 20:00
  if (totalMinutes < normalStart || totalMinutes > normalEnd) {
    return { hasFee: true, reason: "นอกเวลาบริการ (14:00–20:00)" };
  }

  return { hasFee: false, reason: "" };
}
