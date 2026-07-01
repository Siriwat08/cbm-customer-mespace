import { TruckType } from './types';

export const FALLBACK_DIESEL_PRICE = 42.25; // Thai diesel price (บาท/ลิตร)
export const LABOR_COST = 500; // Labor cost per trip in THB

export const CARGO_LIMITS = {
  MAX_DIMENSION_CM: 2000,
  MAX_WEIGHT_KG: 50000,
  MAX_QUANTITY: 1000,
} as const;

// แอป MESPACE ใช้แค่รถ 4 ล้อ (รถกระบะตู้ทึบ Revo) สำหรับบริการ Door-to-Door Storage
export const truckTypes: TruckType[] = [
  {
    id: 'pickup',
    name: 'รถกระบะตู้ทึบ',
    image: '/images/Screenshot_20260320_125706_OneDrive.jpg',
    cbm: 6,
    maxWeight: 1500,
    // มิติจริง Revo ตอนเดียว (วัดเองเมื่อ 2026-05)
    dimensions: { width: 1.575, length: 2.315, height: 2.1 },
    usableSpace: 100,
    jobKey: '4ล้อ_PPY',
    obstacles: [
      { x: 0, y: 72.5, z: 0, width: 23.75, length: 80, height: 20, label: 'ซุ้มล้อซ้าย' },
      { x: 133.75, y: 72.5, z: 0, width: 23.75, length: 80, height: 20, label: 'ซุ้มล้อขวา' },
    ],
  },
];

export const selectedTruck = truckTypes[0];

export function getTruckGrossCBM(truck: TruckType): number {
  return truck.dimensions.width * truck.dimensions.length * truck.dimensions.height;
}

export function getTruckObstacleCBM(truck: TruckType): number {
  return (truck.obstacles || []).reduce((sum, obstacle) => {
    return sum + (obstacle.width * obstacle.length * obstacle.height) / 1000000;
  }, 0);
}

export function getTruckNetCBM(truck: TruckType): number {
  return Math.max(getTruckGrossCBM(truck) - getTruckObstacleCBM(truck), 0);
}

export function getTruckByJobKey(jobKey: string): TruckType | undefined {
  return truckTypes.find(t => t.jobKey === jobKey);
}

export function getJobKeyByTruckId(truckId: string): string | undefined {
  return truckTypes.find(t => t.id === truckId)?.jobKey;
}
