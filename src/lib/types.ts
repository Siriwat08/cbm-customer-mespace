// ===== Core Types =====

export interface OilPriceEntry {
  date: string;   // ISO format: YYYY-MM-DD
  price: number;
  manual?: boolean;
}

export type OilPrice = OilPriceEntry;

export interface OilRange {
  min: number;
  max: number;
}

export interface DistanceRate {
  dist_min: number;
  dist_max: number;
  prices: number[];
}

export interface RateData {
  [key: string]: {
    oil_ranges: OilRange[];
    data: DistanceRate[];
  };
}

/**
 * Wheel arch (ซุ้มล้อ) — พื้นที่ต้องห้ามวางของ
 * หน่วยเป็น เซนติเมตร (เหมือน cargo)
 */
export interface TruckObstacle {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  label?: string;
}

export interface TruckType {
  id: string;
  name: string;
  image: string;
  cbm: number;
  maxWeight: number;
  dimensions: { width: number; length: number; height: number };
  usableSpace: number;
  jobKey: string;
  obstacles?: TruckObstacle[];
}

export interface CargoItem {
  id: string;
  width: number;
  length: number;
  height: number;
  quantity: number;
  weight: number;
}

// ===== 3D Bin Packing Types =====

export interface Box3D {
  width: number;
  length: number;
  height: number;
}

export interface PackedItem {
  itemIndex: number;
  cargoIndex: number;
  position: { x: number; y: number; z: number };
  rotatedDimensions: Box3D;
  fits: boolean;
}

export interface BinPackingResult {
  items: PackedItem[];
  utilizedCBM: number;
  totalCBM: number;
  truckCapacityCBM: number;
  utilizationPercent: number;
  canFitAll: boolean;
  unfittedItems: { cargoIndex: number; itemIndex: number; reason: string }[];
}
