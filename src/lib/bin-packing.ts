/**
 * 3D Bin Packing Algorithm (First Fit Decreasing with Rotation)
 *
 * This algorithm determines if cargo items can actually fit inside a truck
 * by considering 3D placement, not just total volume comparison.
 *
 * Approach:
 * 1. Sort items by volume (largest first) - First Fit Decreasing
 * 2. Try to place each item in the truck space
 * 3. When an item is placed, it creates 3 sub-spaces (right, front, top)
 * 4. Try all 6 rotations for each item
 * 5. Report which items fit and which don't
 *
 * Wheel arch / obstacle support:
 *   - ซุ้มล้อถูกจำลองเป็น "กล่องที่วางอยู่ก่อนแล้ว" ตั้งแต่เริ่มต้น
 *   - algorithm จะไม่วางสินค้าทับซุ้มล้อ แต่วางเหนือซุ้มล้อ (z ≥ obstacle.height) ได้
 *   - มี deduplicateSpaces() เพื่อป้องกันบั๊ก duplicate spaces ที่ทำให้ availableSpaces = 0
 */

import { Box3D, CargoItem, TruckType, TruckObstacle, PackedItem, BinPackingResult } from './types';

interface Space3D {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
}

interface PlacedBox {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  cargoIndex: number;
  itemIndex: number;
}

/**
 * ลบพื้นที่ว่างที่ซ้ำกันทุกมิติออก
 * ป้องกันบั๊ก: เมื่อประมวลผลซุ้มล้อ 2 อัน แต่ละอันสร้าง sub-space เหมือนกัน
 * แล้ว isSpaceInside() จะเช็คว่า A อยู่ใน B และ B อยู่ใน A → ลบทั้งคู่ทิ้ง → availableSpaces = 0
 */
function deduplicateSpaces(spaces: Space3D[]): Space3D[] {
  const seen = new Set<string>();
  return spaces.filter(s => {
    const key = `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)},${s.width.toFixed(2)},${s.length.toFixed(2)},${s.height.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Check if space is fully inside another space
function isSpaceInside(inner: Space3D, outer: Space3D): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.z >= outer.z &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.length <= outer.y + outer.length &&
    inner.z + inner.height <= outer.z + outer.height
  );
}

/**
 * ประมวลผล obstacles (ซุ้มล้อ) ล่วงหน้า — แปลงพื้นที่รถทั้งหมดให้เป็นช่องว่างที่ไม่ทับซุ้มล้อ
 * ทำงานโดย: สำหรับแต่ละ obstacle จะแบ่งแต่ละ available space ที่ทับซุ้มล้อออกเป็น sub-spaces
 * รอบ ๆ ซุ้มล้อ (ขวา/หน้า/บน) แล้วเก็บเฉพาะช่องที่ไม่ทับซุ้มล้อ
 */
function processObstacles(
  initialSpace: Space3D,
  obstacles: TruckObstacle[]
): { spaces: Space3D[]; placedObstacles: PlacedBox[] } {
  if (!obstacles || obstacles.length === 0) {
    return { spaces: [initialSpace], placedObstacles: [] };
  }

  // แปลง obstacles เป็น PlacedBox (cargoIndex = -1, itemIndex = -1 คือ obstacle)
  const placedObstacles: PlacedBox[] = obstacles.map((obs, idx) => ({
    x: obs.x,
    y: obs.y,
    z: obs.z,
    width: obs.width,
    length: obs.length,
    height: obs.height,
    cargoIndex: -1,
    itemIndex: -100 - idx, // ใช้ index ติดลบเพื่อกันชนกับ item จริง
  }));

  let spaces: Space3D[] = [initialSpace];

  // สำหรับแต่ละ obstacle จะแบ่ง spaces ที่ทับมันออก
  for (const obs of placedObstacles) {
    const newSpaces: Space3D[] = [];

    for (const space of spaces) {
      // ตรวจสอบว่า space นี้ทับ obstacle หรือไม่
      const overlapX = space.x < obs.x + obs.width && space.x + space.width > obs.x;
      const overlapY = space.y < obs.y + obs.length && space.y + space.length > obs.y;
      const overlapZ = space.z < obs.z + obs.height && space.z + space.height > obs.z;

      if (!overlapX || !overlapY || !overlapZ) {
        // ไม่ทับกัน → เก็บ space เดิมไว้
        newSpaces.push(space);
        continue;
      }

      // ทับกัน → แบ่ง space ออกเป็น sub-spaces รอบ ๆ obstacle (Guillotine cut)
      // 1) พื้นที่ด้านขวาของ obstacle (ในแกน X)
      const rightW = space.x + space.width - (obs.x + obs.width);
      if (rightW > 0) {
        newSpaces.push({
          x: obs.x + obs.width,
          y: space.y,
          z: space.z,
          width: rightW,
          length: space.length,
          height: space.height,
        });
      }
      // 2) พื้นที่ด้านซ้ายของ obstacle (ในแกน X) — สำคัญเพราะ obstacle อาจไม่ชิดผนังซ้าย
      const leftW = obs.x - space.x;
      if (leftW > 0) {
        newSpaces.push({
          x: space.x,
          y: space.y,
          z: space.z,
          width: leftW,
          length: space.length,
          height: space.height,
        });
      }
      // 3) พื้นที่ด้านหน้าของ obstacle (ในแกน Y — ฝั่งปลายรถ)
      const frontL = space.y + space.length - (obs.y + obs.length);
      if (frontL > 0) {
        newSpaces.push({
          x: space.x,
          y: obs.y + obs.length,
          z: space.z,
          width: space.width,
          length: frontL,
          height: space.height,
        });
      }
      // 4) พื้นที่ด้านหลังของ obstacle (ในแกน Y — ฝั่งห้องโดยสาร)
      const backL = obs.y - space.y;
      if (backL > 0) {
        newSpaces.push({
          x: space.x,
          y: space.y,
          z: space.z,
          width: space.width,
          length: backL,
          height: space.height,
        });
      }
      // 5) พื้นที่เหนือ obstacle (ในแกน Z — วางทับบนซุ้มล้อได้)
      const topH = space.z + space.height - (obs.z + obs.height);
      if (topH > 0) {
        newSpaces.push({
          x: space.x,
          y: space.y,
          z: obs.z + obs.height,
          width: space.width,
          length: space.length,
          height: topH,
        });
      }
      // 6) พื้นที่ใต้ obstacle (ในแกน Z — ไม่ควรเกิดเพราะ obstacle ปกติวางบนพื้น z=0)
      const bottomH = obs.z - space.z;
      if (bottomH > 0) {
        newSpaces.push({
          x: space.x,
          y: space.y,
          z: space.z,
          width: space.width,
          length: space.length,
          height: bottomH,
        });
      }
    }

    // deduplicate + ลบ spaces ที่ยังทับ obstacle ตัวเดิมหรือ obstacle ก่อนหน้า
    spaces = deduplicateSpaces(newSpaces).filter(s =>
      placedObstacles.every(po => {
        const oX = s.x < po.x + po.width && s.x + s.width > po.x;
        const oY = s.y < po.y + po.length && s.y + s.length > po.y;
        const oZ = s.z < po.z + po.height && s.z + s.height > po.z;
        return !(oX && oY && oZ);
      })
    );
  }

  // ลบ spaces ที่อยู่ในอีก space หนึ่ง (redundant)
  spaces = deduplicateSpaces(spaces).filter((space, idx, arr) => {
    return !arr.some((other, otherIdx) =>
      otherIdx !== idx && isSpaceInside(space, other)
    );
  });

  return { spaces, placedObstacles };
}

// All 6 possible rotations of a 3D box (deduplicated for cubes/square prisms)
function getRotations(box: Box3D): Box3D[] {
  const { width: w, length: l, height: h } = box;
  const all = [
    { width: w, length: l, height: h },
    { width: w, length: h, height: l },
    { width: l, length: w, height: h },
    { width: l, length: h, height: w },
    { width: h, length: w, height: l },
    { width: h, length: l, height: w },
  ];
  // Deduplicate: for a cube all 6 are identical, for a square prism some overlap
  const seen = new Set<string>();
  return all.filter(r => {
    const key = `${r.width}-${r.length}-${r.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Check if a box can fit in a space
function canFitInSpace(box: Box3D, space: Space3D): boolean {
  return (
    box.width <= space.width &&
    box.length <= space.length &&
    box.height <= space.height
  );
}

// Check if a candidate space overlaps with any already-placed box
function hasNoOverlap(
  space: Space3D,
  placedBoxes: PlacedBox[]
): boolean {
  for (const placed of placedBoxes) {
    const overlapX = space.x < placed.x + placed.width && space.x + space.width > placed.x;
    const overlapY = space.y < placed.y + placed.length && space.y + space.length > placed.y;
    const overlapZ = space.z < placed.z + placed.height && space.z + space.height > placed.z;

    if (overlapX && overlapY && overlapZ) {
      return false;
    }
  }
  return true;
}

// Generate sub-spaces after placing a box in a space (Guillotine cut)
function generateSubSpaces(
  space: Space3D,
  placedBox: PlacedBox
): Space3D[] {
  const subSpaces: Space3D[] = [];

  // Right space
  const rightWidth = space.x + space.width - (placedBox.x + placedBox.width);
  if (rightWidth > 0) {
    subSpaces.push({
      x: placedBox.x + placedBox.width,
      y: space.y,
      z: space.z,
      width: rightWidth,
      length: space.length,
      height: space.height,
    });
  }

  // Front space
  const frontLength = space.y + space.length - (placedBox.y + placedBox.length);
  if (frontLength > 0) {
    subSpaces.push({
      x: space.x,
      y: placedBox.y + placedBox.length,
      z: space.z,
      width: space.width,
      length: frontLength,
      height: space.height,
    });
  }

  // Top space
  const topHeight = space.z + space.height - (placedBox.z + placedBox.height);
  if (topHeight > 0) {
    subSpaces.push({
      x: space.x,
      y: space.y,
      z: placedBox.z + placedBox.height,
      width: space.width,
      length: space.length,
      height: topHeight,
    });
  }

  return subSpaces;
}

// Main 3D Bin Packing function
export function performBinPacking(
  cargoItems: CargoItem[],
  truck: TruckType
): BinPackingResult {
  const truckDimensions = truck.dimensions;

  // Convert truck dimensions from meters to centimeters for consistent units with cargo
  const truckW = truckDimensions.width * 100;
  const truckL = truckDimensions.length * 100;
  const truckH = truckDimensions.height * 100;

  // Apply usable space factor
  const usableFactor = truck.usableSpace / 100;
  const effectiveW = truckW * Math.cbrt(usableFactor);
  const effectiveL = truckL * Math.cbrt(usableFactor);
  const effectiveH = truckH * Math.cbrt(usableFactor);

  const truckCapacityCBM = (truckW * truckL * truckH) / 1000000;

  // Build list of all individual items to pack (expanding quantities)
  interface ItemToPack {
    cargoIndex: number;
    itemIndex: number;
    dimensions: Box3D;
    volume: number;
  }

  const itemsToPack: ItemToPack[] = [];
  cargoItems.forEach((item, cargoIdx) => {
    if (item.width <= 0 || item.length <= 0 || item.height <= 0) return;
    for (let i = 0; i < item.quantity; i++) {
      itemsToPack.push({
        cargoIndex: cargoIdx,
        itemIndex: i,
        dimensions: { width: item.width, length: item.length, height: item.height },
        volume: item.width * item.length * item.height,
      });
    }
  });

  // Sort by volume descending (First Fit Decreasing)
  itemsToPack.sort((a, b) => b.volume - a.volume);

  // ===== Process obstacles (wheel arches) =====
  // ซุ้มล้อจะถูกจำลองเป็น "กล่องที่วางอยู่ก่อนแล้ว" และพื้นที่รถจะถูกตัดรอบ ๆ ซุ้มล้อ
  const initialSpace: Space3D = { x: 0, y: 0, z: 0, width: effectiveW, length: effectiveL, height: effectiveH };
  const { spaces: initialSpaces, placedObstacles } = processObstacles(initialSpace, truck.obstacles || []);

  // Initialize available spaces (หลังตัดซุ้มล้อแล้ว)
  let availableSpaces: Space3D[] = initialSpaces;

  // placedBoxes เริ่มจาก obstacles ที่วางอยู่ก่อนแล้ว (ซุ้มล้อ)
  const placedBoxes: PlacedBox[] = [...placedObstacles];
  const packedItems: PackedItem[] = [];
  const unfittedItems: { cargoIndex: number; itemIndex: number; reason: string }[] = [];
  let utilizedCBM = 0;

  for (const item of itemsToPack) {
    const rotations = getRotations(item.dimensions);
    let placed = false;

    // Sort available spaces by volume (smallest first to find tightest fit)
    availableSpaces.sort((a, b) => {
      const volA = a.width * a.length * a.height;
      const volB = b.width * b.length * b.height;
      return volA - volB;
    });

    for (const rotation of rotations) {
      if (placed) break;

      for (const space of availableSpaces) {
        if (placed) break;

        if (!canFitInSpace(rotation, space)) continue;

        // Place the item at the corner of this space
        const newBox: PlacedBox = {
          x: space.x,
          y: space.y,
          z: space.z,
          width: rotation.width,
          length: rotation.length,
          height: rotation.height,
          cargoIndex: item.cargoIndex,
          itemIndex: item.itemIndex,
        };

        // Verify no overlap with existing boxes
        if (!hasNoOverlap(newBox, placedBoxes)) continue;

        // Place the box
        placedBoxes.push(newBox);
        utilizedCBM += item.volume;

        packedItems.push({
          itemIndex: item.itemIndex,
          cargoIndex: item.cargoIndex,
          position: { x: newBox.x, y: newBox.y, z: newBox.z },
          rotatedDimensions: rotation,
          fits: true,
        });

        // Generate new sub-spaces
        const subSpaces = generateSubSpaces(space, newBox);

        // Remove the used space and add sub-spaces
        availableSpaces = availableSpaces.filter(s => s !== space);
        availableSpaces.push(...subSpaces);

        // Clean up: remove spaces that are inside other spaces or overlap with placed boxes
        availableSpaces = deduplicateSpaces(availableSpaces).filter(space => {
          // Must not overlap any placed box (รวม obstacles)
          return hasNoOverlap(space, placedBoxes);
        });

        // Remove redundant spaces (spaces completely inside other spaces)
        availableSpaces = deduplicateSpaces(availableSpaces).filter((space, idx, arr) => {
          return !arr.some((other, otherIdx) =>
            otherIdx !== idx && isSpaceInside(space, other)
          );
        });

        // Cap available spaces to prevent unbounded growth (O(n²) cleanup)
        // Keep only the largest 50 spaces — sufficient for typical cargo scenarios
        if (availableSpaces.length > 50) {
          availableSpaces.sort((a, b) => (b.width * b.length * b.height) - (a.width * a.length * a.height));
          availableSpaces = availableSpaces.slice(0, 50);
        }

        placed = true;
      }
    }

    if (!placed) {
      unfittedItems.push({
        cargoIndex: item.cargoIndex,
        itemIndex: item.itemIndex,
        reason: `ไม่สามารถวางสินค้าได้ (ขนาด ${item.dimensions.width}×${item.dimensions.length}×${item.dimensions.height} ซม.)`,
      });
    }
  }

  const totalCBM = itemsToPack.reduce((sum, item) => sum + item.volume, 0) / 1000000;
  const utilizationPercent = truckCapacityCBM > 0 ? (utilizedCBM / (truckCapacityCBM * 1000000)) * 100 : 0;

  return {
    items: packedItems,
    utilizedCBM: utilizedCBM / 1000000,
    totalCBM,
    truckCapacityCBM,
    utilizationPercent,
    canFitAll: unfittedItems.length === 0,
    unfittedItems,
  };
}

/**
 * Check if a single item can dimensionally fit inside a truck.
 * Compares item dimensions (after rotation) against truck interior dimensions.
 */
export function canItemFitInTruck(item: CargoItem, truck: TruckType): boolean {
  const truckDimensions = truck.dimensions;
  const usableFactor = truck.usableSpace / 100;
  const effectiveW = truckDimensions.width * 100 * Math.cbrt(usableFactor);
  const effectiveL = truckDimensions.length * 100 * Math.cbrt(usableFactor);
  const effectiveH = truckDimensions.height * 100 * Math.cbrt(usableFactor);

  const rotations = getRotations({ width: item.width, length: item.length, height: item.height });
  return rotations.some(r =>
    r.width <= effectiveW && r.length <= effectiveL && r.height <= effectiveH
  );
}

/**
 * Apply weight constraint to bin packing result.
 * If the total weight of fitted items exceeds the truck's max weight,
 * remove the heaviest items that don't fit until under the limit.
 * Returns the modified BinPackingResult with unfitted items moved to unfittedItems.
 */
export function applyWeightConstraint(
  result: BinPackingResult,
  cargoItems: CargoItem[],
  maxWeight: number
): BinPackingResult {
  // Calculate total weight of fitted items
  let totalWeight = 0;
  const itemWeights = new Map<string, number>();

  for (const packed of result.items) {
    const key = `${packed.cargoIndex}-${packed.itemIndex}`;
    const cargo = cargoItems[packed.cargoIndex];
    const weight = cargo ? cargo.weight : 0;
    itemWeights.set(key, weight);
    totalWeight += weight;
  }

  // If within weight limit, return as-is
  if (totalWeight <= maxWeight) {
    return result;
  }

  // Sort fitted items by weight descending — remove heaviest first
  const sortedItems = [...result.items].sort((a, b) => {
    const wA = itemWeights.get(`${a.cargoIndex}-${a.itemIndex}`) || 0;
    const wB = itemWeights.get(`${b.cargoIndex}-${b.itemIndex}`) || 0;
    return wB - wA;
  });

  const keptItems: typeof result.items = [];
  const removedItems: typeof result.unfittedItems = [];
  let currentWeight = 0;

  // Re-add items from lightest to heaviest, skipping ones that would exceed maxWeight
  const lightestFirst = [...sortedItems].reverse();
  for (const packed of lightestFirst) {
    const weight = itemWeights.get(`${packed.cargoIndex}-${packed.itemIndex}`) || 0;
    if (currentWeight + weight <= maxWeight) {
      keptItems.push(packed);
      currentWeight += weight;
    } else {
      removedItems.push({
        cargoIndex: packed.cargoIndex,
        itemIndex: packed.itemIndex,
        reason: `น้ำหนักเกิน (${weight.toLocaleString()} kg ทำให้เกิน ${maxWeight.toLocaleString()} kg)`,
      });
    }
  }

  // Recalculate utilized CBM
  const keptCBM = keptItems.reduce((sum, packed) => {
    const cargo = cargoItems[packed.cargoIndex];
    if (!cargo) return sum;
    return sum + (cargo.width * cargo.length * cargo.height) / 1000000;
  }, 0);

  return {
    items: keptItems,
    utilizedCBM: keptCBM,
    totalCBM: result.totalCBM,
    truckCapacityCBM: result.truckCapacityCBM,
    utilizationPercent: result.truckCapacityCBM > 0 ? (keptCBM / result.truckCapacityCBM) * 100 : 0,
    canFitAll: result.unfittedItems.length === 0 && removedItems.length === 0,
    unfittedItems: [...result.unfittedItems, ...removedItems],
  };
}
