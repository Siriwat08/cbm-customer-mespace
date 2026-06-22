import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MESPACE Self Storage - คำนวณ CBM และราคาค่าขนส่ง",
  description: "เครื่องมือช่วยคำนวณ CBM (ปริมาตรสินค้า) ตรวจสอบการจัดวางสินค้าในรถแบบ 3D และคำนวณราคาค่าขนส่ง สำหรับบริการ Door-to-Door Storage ของ MESPACE Self Storage",
  keywords: ["CBM", "คำนวณ CBM", "ค่าขนส่ง", "รถขนส่ง", "MESPACE", "Self Storage", "ห้องเก็บของ", "3D Bin Packing", "ราคาน้ำมันดีเซล"],
  authors: [{ name: "MESPACE Self Storage" }],
  icons: {
    icon: "/images/mespace-favicon.png",
  },
  openGraph: {
    title: "MESPACE Self Storage - คำนวณ CBM และราคาค่าขนส่ง",
    description: "เครื่องมือช่วยคำนวณ CBM ตรวจสอบการจัดวางสินค้า 3D และคำนวณราคาค่าขนส่ง",
    type: "website",
    locale: "th_TH",
    siteName: "MESPACE Self Storage",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
