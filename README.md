# CBM Calculator for MESPACE Self Storage

แอปคำนวณ CBM และราคาค่าขนส่ง สำหรับบริการ Door-to-Door Storage ของ **MESPACE Self Storage**

## 📋 ฟีเจอร์

- ✅ คำนวณ CBM (ปริมาตรสินค้า) ด้วย 3D Bin Packing Algorithm
- ✅ แสดงภาพ 3D การจัดวางสินค้าในรถ (4 มุมมอง)
- ✅ รองรับซุ้มล้อรถกระบะ Revo (ไม่วางสินค้าทับซุ้มล้อ)
- ✅ คำนวณราคาค่าขนส่งตามระยะทางและราคาน้ำมัน
- ✅ ดึงราคาน้ำมันดีเซลอัตโนมัติจากแอปหลัก
- ✅ เลือกเพิ่มค่าแรงงานยกสินค้าได้

## 🚛 ประเภทรถที่รองรับ

- รถกระบะตู้ทึบ (Revo) — 1.575 × 2.315 × 2.100 ม. พร้อมซุ้มล้อ 2 ข้าง

## 🏢 เกี่ยวกับ MESPACE Self Storage

- **เว็บไซต์**: https://www.mespace-selfstorage.co.th/
- **ที่อยู่**: 36 ถนนกรุงเทพกรีฑา แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240
- **โทร**: 02-710-4088, 02-710-4090
- **สาขา**: 11 สาขา (กรุงเทพฯ 7 + พัทยา 1 + ภูเก็ต 3)
- **บริการ**: ห้องเก็บของส่วนตัว, ห้องเก็บของธุรกิจ, ห้องเก็บไวน์, ห้องเก็บของแบบไดร์ฟอิน, บริการรับส่งเก็บของ (Door-to-Door)

## 🛠️ เทคโนโลยี

- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui
- **3D Bin Packing** — First Fit Decreasing + Guillotine Cut
- ดึงข้อมูลจากแอปหลักผ่าน `MAIN_APP_API_URL`

## 📦 การติดตั้ง

```bash
npm install
cp .env.example .env.local
# แก้ไข MAIN_APP_API_URL ใน .env.local ให้เป็น URL ของแอปหลัก
npm run dev
```

## 🚀 การ Deploy บน Vercel

1. สร้าง GitHub repo ใหม่ (เช่น `cbm-customer-mespace`)
2. Push โค้ดนี้ขึ้น repo
3. ใน Vercel Dashboard > Add New Project > เลือก repo
4. ตั้งค่า Environment Variable:
   ```
   MAIN_APP_API_URL=https://your-main-app.vercel.app
   ```
5. Deploy

## 🔧 Environment Variables

| ชื่อ | คำอธิบาย | ตัวอย่าง |
|---|---|---|
| `MAIN_APP_API_URL` | URL ของแอปหลัก (CBM Calculator สำหรับ admin) | `https://cbm-calculator.vercel.app` |
| `FALLBACK_DIESEL_PRICE` | ราคาน้ำมันสำรอง (บาท/ลิตร) | `42.25` |

## 🎨 การเปลี่ยนโลโก้/แบรนด์

หากต้องการเปลี่ยนโลโก้ แทนที่ไฟล์เหล่านี้:

| ไฟล์ | ขนาดแนะนำ | หน้าที่ |
|---|---|---|
| `public/images/mespace-logo-full.png` | 855×161 px | โลโก้ใน header หน้าเว็บ |
| `public/images/mespace-favicon.png` | 32×32 px | Favicon บน tab browser |
| `public/images/mespace-icon.png` | 161×161 px | ไอคอนโลโก้ (สำรอง) |

## 📁 โครงสร้างโปรเจกต์

```
cbm-customer-mespace/
├── src/
│   ├── app/
│   │   ├── api/oil-price/route.ts   # Proxy ไปยังแอปหลัก
│   │   ├── globals.css
│   │   ├── layout.tsx               # ใส่ metadata MESPACE
│   │   └── page.tsx                 # หน้าหลัก (2 แท็บ)
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── BinPackingVisualization.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   └── lib/
│       ├── bin-packing.ts            # 3D Bin Packing algorithm
│       ├── date-utils.ts
│       ├── oil-price-api.ts          # ดึงจาก MAIN_APP_API_URL
│       ├── truck-data.ts             # รถ 4 ล้อ พร้อมซุ้มล้อ
│       ├── types.ts
│       └── utils.ts
├── public/
│   ├── images/                       # รูปรถ + โลโก้ MESPACE
│   ├── transport_rates.json          # ตารางราคา 4ล้อ_PPY
│   └── logo.svg
└── ... (config files)
```
