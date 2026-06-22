'use client';

import { useState, useMemo } from 'react';
import type { BinPackingResult, TruckType, CargoItem } from '@/lib/types';

interface BinPackingVisualizationProps {
  result: BinPackingResult;
  truck: TruckType;
  cargoItems: CargoItem[];
}

// Color palette for different cargo items
const CARGO_COLORS = [
  { fill: '#3B82F6', stroke: '#1D4ED8', light: '#60A5FA', label: 'สินค้า 1' },   // blue
  { fill: '#10B981', stroke: '#047857', light: '#34D399', label: 'สินค้า 2' },   // emerald
  { fill: '#F59E0B', stroke: '#B45309', light: '#FBBF24', label: 'สินค้า 3' },    // amber
  { fill: '#EF4444', stroke: '#B91C1C', light: '#F87171', label: 'สินค้า 4' },    // red
  { fill: '#8B5CF6', stroke: '#6D28D9', light: '#A78BFA', label: 'สินค้า 5' },   // violet
  { fill: '#EC4899', stroke: '#BE185D', light: '#F472B6', label: 'สินค้า 6' },   // pink
  { fill: '#14B8A6', stroke: '#0D9488', light: '#2DD4BF', label: 'สินค้า 7' },   // teal
  { fill: '#F97316', stroke: '#C2410C', light: '#FB923C', label: 'สินค้า 8' },    // orange
];

type ViewMode = 'rear' | 'top' | 'side' | '3d';

export default function BinPackingVisualization({ result, truck, cargoItems }: BinPackingVisualizationProps) {
  const [viewAngle, setViewAngle] = useState<ViewMode>('rear');
  const [showLabels, setShowLabels] = useState(true);

  // Convert truck dimensions to cm
  const truckW = truck.dimensions.width * 100;  // left-right
  const truckL = truck.dimensions.length * 100;  // front-back (depth)
  const truckH = truck.dimensions.height * 100;  // top-bottom

  // Scale: fit into SVG viewport
  const maxDim = Math.max(truckW, truckL, truckH);
  const scale = 300 / maxDim;

  const sW = truckW * scale;
  const sL = truckL * scale;
  const sH = truckH * scale;

  // Group items by cargo index for coloring
  const cargoColorMap = useMemo(() => {
    const map = new Map<number, number>();
    let colorIdx = 0;
    result.items.forEach(item => {
      if (!map.has(item.cargoIndex)) {
        map.set(item.cargoIndex, colorIdx % CARGO_COLORS.length);
        colorIdx++;
      }
    });
    return map;
  }, [result.items]);

  // Build placement data — KEY CHANGE: flip Y axis so y=0 is the BACK (door)
  // In the algorithm, y=0 is the front. We flip so y=0 becomes the rear door.
  // This means: visualY = sL - algorithmY - itemLength
  // This simulates loading from the back: first items go deep (visual far from door),
  // last items are near the door (visual close to door = y≈0)
  interface PlacementInfo {
    x: number; y: number; z: number;          // visual position (y=0 is back/door)
    w: number; l: number; h: number;           // visual dimensions
    cargoIndex: number; colorIdx: number;
    label: string;
    origW: number; origL: number; origH: number;
    depthFromDoor: number; // cm from rear door
  }

  // ===== Wheel arch (obstacle) visual data =====
  // แปลง obstacles ให้เป็นพิกัดภาพ (Y flipped เหมือนสินค้า)
  interface ArchInfo {
    x: number; y: number; z: number;          // visual position
    w: number; l: number; h: number;
    label: string;
    origX: number; origY: number; origZ: number; // cm ก่อน scale (สำหรับแสดงใน top view)
    origW: number; origL: number; origH: number;
  }
  const arches: ArchInfo[] = (truck.obstacles || []).map(obs => {
    const visualY = (truckL - obs.y - obs.length) * scale;
    return {
      x: obs.x * scale,
      y: visualY,
      z: obs.z * scale,
      w: obs.width * scale,
      l: obs.length * scale,
      h: obs.height * scale,
      label: obs.label || 'ซุ้มล้อ',
      origX: obs.x, origY: obs.y, origZ: obs.z,
      origW: obs.width, origL: obs.length, origH: obs.height,
    };
  });
  const hasArches = arches.length > 0;

  const placements: PlacementInfo[] = result.items.map(item => {
    const cIdx = cargoColorMap.get(item.cargoIndex) ?? 0;
    const cargoItem = cargoItems[item.cargoIndex];
    // Flip Y: visual y = (truckL - algorithmY - itemLength) * scale
    const algY = item.position.y;
    const itemL = item.rotatedDimensions.length;
    const visualY = (truckL - algY - itemL) * scale;
    const depthFromDoor = truckL - algY - itemL; // cm from door
    return {
      x: item.position.x * scale,
      y: visualY,
      z: item.position.z * scale,
      w: item.rotatedDimensions.width * scale,
      l: item.rotatedDimensions.length * scale,
      h: item.rotatedDimensions.height * scale,
      cargoIndex: item.cargoIndex,
      colorIdx: cIdx,
      label: cargoItem ? `รายการ ${item.cargoIndex + 1}` : `ชิ้น ${item.itemIndex + 1}`,
      origW: item.rotatedDimensions.width,
      origL: item.rotatedDimensions.length,
      origH: item.rotatedDimensions.height,
      depthFromDoor,
    };
  });

  // Calculate remaining space info
  const totalItemsVolume = placements.reduce((sum, p) => sum + (p.w * p.l * p.h), 0);
  const truckVolume = sW * sL * sH;
  const usedPercent = truckVolume > 0 ? (totalItemsVolume / truckVolume * 100) : 0;
  const freePercent = 100 - usedPercent;

  // Calculate the depth of the deepest item from the door (how far items go into the truck)
  const deepestItemEnd = placements.reduce((max, p) => Math.max(max, p.y + p.l), 0);
  const remainingSpaceFromDoor = sL - deepestItemEnd; // This is now the space at the FRONT (cab side)
  const spaceNearDoor = placements.length === 0 ? sL : Math.min(...placements.map(p => p.y));

  // ============ SVG RENDERING ============
  // Common padding
  const pad = 30;

  // --- Rear View (looking from the back into the truck) ---
  // Shows: width (left-right) x height (bottom-top)
  // Items near the door (y ≈ 0) are more opaque (closer to viewer)
  // Items deep inside (y >> 0) are more transparent (further from viewer)
  const renderRearView = () => {
    const svgW = sW + pad * 2;
    const svgH = sH + pad * 2;
    // Sort by depth from door - items further from door (deeper) drawn first
    const sorted = [...placements].sort((a, b) => b.y - a.y);

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto">
        {/* Truck container (rear opening) */}
        <rect x={pad} y={pad} width={sW} height={sH}
          fill="rgba(241,245,249,0.5)" stroke="#64748B" strokeWidth="3" rx="4" strokeDasharray="8,4" />
        {/* Floor line */}
        <line x1={pad} y1={pad + sH} x2={pad + sW} y2={pad + sH} stroke="#94A3B8" strokeWidth="2" />
        {/* Door frame indicator */}
        <text x={pad + sW / 2} y={pad - 6} textAnchor="middle" className="text-[9px] fill-slate-500 font-bold">
          🚪 ประตูท้ายรถ (มองจากนอกเข้าไป)
        </text>
        {/* Dimension labels */}
        <text x={pad + sW / 2} y={pad + sH + 20} textAnchor="middle" className="text-[10px] fill-gray-400">
          กว้าง {truck.dimensions.width} ม.
        </text>
        <text x={pad - 8} y={pad + sH / 2} textAnchor="middle" transform={`rotate(-90, ${pad - 8}, ${pad + sH / 2})`} className="text-[10px] fill-gray-400">
          สูง {truck.dimensions.height} ม.
        </text>

        {/* Wheel arches (ซุ้มล้อ) — วาดก่อนสินค้าเพื่อให้สินค้าที่อยู่เหนือซุ้มล้อทับบน */}
        {hasArches && arches.map((arch, idx) => {
          const x = pad + arch.x;
          const y = pad + (sH - arch.z - arch.h); // SVG y is top-down, z is bottom-up
          return (
            <g key={`arch-${idx}`}>
              <rect x={x} y={y} width={arch.w} height={arch.h}
                fill="#9CA3AF" fillOpacity={0.85}
                stroke="#4B5563" strokeWidth="2" rx="2"
                strokeDasharray="3,2" />
              {/* Diagonal stripes pattern to indicate "no-place" zone */}
              <line x1={x} y1={y} x2={x + arch.w} y2={y + arch.h} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              <line x1={x + arch.w} y1={y} x2={x} y2={y + arch.h} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              {arch.w > 18 && arch.h > 12 && (
                <text x={x + arch.w / 2} y={y + arch.h / 2 + 2} textAnchor="middle"
                  className="text-[7px] font-bold fill-gray-700">
                  {arch.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Items - deeper items first, closer items overlay on top */}
        {sorted.map((p, idx) => {
          const color = CARGO_COLORS[p.colorIdx];
          // Depth-based opacity: items near the door (y ≈ 0) are more opaque
          const depthRatio = p.y / sL;
          const opacity = 0.4 + 0.6 * (1 - depthRatio); // closer to door = more opaque
          const x = pad + p.x;
          const y = pad + (sH - p.z - p.h); // SVG y is top-down, z is bottom-up
          return (
            <g key={idx}>
              <rect x={x} y={y} width={p.w} height={p.h}
                fill={color.fill} fillOpacity={opacity}
                stroke={color.stroke} strokeWidth="1.5" rx="2" />
              {/* Depth shading: items deep inside slightly darker */}
              {depthRatio > 0.3 && (
                <rect x={x} y={y} width={p.w} height={p.h}
                  fill="black" fillOpacity={depthRatio * 0.15} rx="2" />
              )}
              {showLabels && p.w > 28 && p.h > 14 && (
                <text x={x + p.w / 2} y={y + p.h / 2 + 3} textAnchor="middle"
                  className="text-[7px] font-bold fill-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Remaining space indicator - show free area near door */}
        {placements.length > 0 && spaceNearDoor > 5 && (
          <g>
            <rect x={pad} y={pad} width={sW} height={sH}
              fill="rgba(16, 185, 129, 0.08)" stroke="#10B981" strokeWidth="1" strokeDasharray="4,4" rx="4" />
            <text x={pad + sW / 2} y={pad + sH / 2} textAnchor="middle"
              className="text-[9px] fill-emerald-500 font-bold">
              พื้นที่ว่างด้านท้าย
            </text>
          </g>
        )}
      </svg>
    );
  };

  // --- Top View (looking down from above) ---
  // Shows: width (left-right) x length (top-bottom)
  // TOP of SVG = rear/door, BOTTOM of SVG = front/cab
  const renderTopView = () => {
    const svgW = sW + pad * 2;
    const svgH = sL + pad * 2;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto">
        {/* Truck container */}
        <rect x={pad} y={pad} width={sW} height={sL}
          fill="rgba(241,245,249,0.5)" stroke="#64748B" strokeWidth="3" rx="4" strokeDasharray="8,4" />

        {/* Door indicator (top = rear) */}
        <rect x={pad} y={pad} width={sW} height={3} fill="#3B82F6" rx="1" />
        <text x={pad + sW / 2} y={pad - 5} textAnchor="middle" className="text-[9px] fill-blue-500 font-bold">
          🚪 ท้ายรถ
        </text>
        <text x={pad + sW / 2} y={pad + sL + 18} textAnchor="middle" className="text-[10px] fill-gray-400">
          🚛 หน้ารถ (ยาว {truck.dimensions.length} ม.)
        </text>

        {/* Wheel arches (ซุ้มล้อ) — top view shows width × length */}
        {hasArches && arches.map((arch, idx) => {
          const x = pad + arch.x;
          const y = pad + arch.y;
          return (
            <g key={`arch-top-${idx}`}>
              <rect x={x} y={y} width={arch.w} height={arch.l}
                fill="#9CA3AF" fillOpacity={0.85}
                stroke="#4B5563" strokeWidth="2" rx="2"
                strokeDasharray="3,2" />
              <line x1={x} y1={y} x2={x + arch.w} y2={y + arch.l} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              <line x1={x + arch.w} y1={y} x2={x} y2={y + arch.l} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              {arch.w > 18 && arch.l > 18 && (
                <text x={x + arch.w / 2} y={y + arch.l / 2 + 2} textAnchor="middle"
                  className="text-[6px] font-bold fill-gray-700">
                  {arch.label}
                </text>
              )}
            </g>
          );
        })}

        {placements.map((p, idx) => {
          const color = CARGO_COLORS[p.colorIdx];
          // Height-based opacity: taller items more opaque
          const heightRatio = p.h / sH;
          const opacity = 0.5 + 0.5 * heightRatio;
          return (
            <g key={idx}>
              <rect x={pad + p.x} y={pad + p.y} width={p.w} height={p.l}
                fill={color.fill} fillOpacity={opacity}
                stroke={color.stroke} strokeWidth="1.5" rx="2" />
              {showLabels && p.w > 28 && p.l > 12 && (
                <text x={pad + p.x + p.w / 2} y={pad + p.y + p.l / 2 + 3} textAnchor="middle"
                  className="text-[7px] font-bold fill-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Remaining space at door area (top) */}
        {placements.length > 0 && spaceNearDoor > 5 && (
          <g>
            <rect x={pad} y={pad} width={sW} height={Math.min(spaceNearDoor, sL * 0.3)}
              fill="rgba(16, 185, 129, 0.1)" stroke="#10B981" strokeWidth="1" strokeDasharray="3,3" rx="2" />
            <text x={pad + sW / 2} y={pad + Math.min(spaceNearDoor, sL * 0.3) / 2 + 3} textAnchor="middle"
              className="text-[8px] fill-emerald-500 font-bold">
              พื้นที่ว่าง
            </text>
          </g>
        )}
      </svg>
    );
  };

  // --- Side View (looking from the side) ---
  // Shows: length (left-right) x height (bottom-top)
  // LEFT = rear/door, RIGHT = front/cab
  const renderSideView = () => {
    const svgW = sL + pad * 2;
    const svgH = sH + pad * 2;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto">
        {/* Truck container */}
        <rect x={pad} y={pad} width={sL} height={sH}
          fill="rgba(241,245,249,0.5)" stroke="#64748B" strokeWidth="3" rx="4" strokeDasharray="8,4" />

        {/* Door indicator (left = rear) */}
        <line x1={pad} y1={pad} x2={pad} y2={pad + sH} stroke="#3B82F6" strokeWidth="3" />
        <text x={pad - 5} y={pad + sH / 2} textAnchor="end" transform={`rotate(-90, ${pad - 5}, ${pad + sH / 2})`} className="text-[9px] fill-blue-500 font-bold">
          🚪 ท้าย
        </text>
        <text x={pad + sL + 5} y={pad + sH / 2} textAnchor="start" transform={`rotate(90, ${pad + sL + 5}, ${pad + sH / 2})`} className="text-[9px] fill-gray-400">
          หน้ารถ
        </text>
        <text x={pad + sL / 2} y={pad + sH + 20} textAnchor="middle" className="text-[10px] fill-gray-400">
          ยาว {truck.dimensions.length} ม.
        </text>

        {/* Wheel arches (ซุ้มล้อ) — side view shows length × height */}
        {/* หมายเหตุ: รถกระบะมี 2 ซุ้มล้อ (ซ้าย+ขวา) แต่ใน side view เห็นเป็น 1 กล่องเพราะทับซ้อนกันในแกน X */}
        {hasArches && arches.length > 0 && (() => {
          // ใช้ซุ้มล้ออันแรกเป็นตัวแทน (เพราะ side view มองเห็นเป็นเส้นเดียวกัน)
          const arch = arches[0];
          const x = pad + arch.y; // y=0 is the door (left side)
          const y = pad + (sH - arch.z - arch.h);
          return (
            <g key="arch-side">
              <rect x={x} y={y} width={arch.l} height={arch.h}
                fill="#9CA3AF" fillOpacity={0.85}
                stroke="#4B5563" strokeWidth="2" rx="2"
                strokeDasharray="3,2" />
              <line x1={x} y1={y} x2={x + arch.l} y2={y + arch.h} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              <line x1={x + arch.l} y1={y} x2={x} y2={y + arch.h} stroke="#6B7280" strokeWidth="1" opacity="0.5" />
              {arch.l > 28 && arch.h > 14 && (
                <text x={x + arch.l / 2} y={y + arch.h / 2 + 2} textAnchor="middle"
                  className="text-[6px] font-bold fill-gray-700">
                  ซุ้มล้อ (2 ข้าง)
                </text>
              )}
            </g>
          );
        })()}

        {placements.map((p, idx) => {
          const color = CARGO_COLORS[p.colorIdx];
          const x = pad + p.y; // y=0 is the door (left side)
          const y = pad + (sH - p.z - p.h);
          return (
            <g key={idx}>
              <rect x={x} y={y} width={p.l} height={p.h}
                fill={color.fill} fillOpacity={0.75}
                stroke={color.stroke} strokeWidth="1.5" rx="2" />
              {showLabels && p.l > 28 && p.h > 14 && (
                <text x={x + p.l / 2} y={y + p.h / 2 + 3} textAnchor="middle"
                  className="text-[7px] font-bold fill-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Remaining space at door area (left side) */}
        {placements.length > 0 && spaceNearDoor > 5 && (
          <g>
            <rect x={pad} y={pad} width={Math.min(spaceNearDoor, sL * 0.3)} height={sH}
              fill="rgba(16, 185, 129, 0.1)" stroke="#10B981" strokeWidth="1" strokeDasharray="3,3" rx="2" />
            <text x={pad + Math.min(spaceNearDoor, sL * 0.3) / 2} y={pad + sH / 2} textAnchor="middle"
              className="text-[8px] fill-emerald-500 font-bold">
              ว่าง
            </text>
          </g>
        )}
      </svg>
    );
  };

  // --- 3D Isometric View ---
  // Rear-left corner visible, door on the left side
  const render3DView = () => {
    // Isometric projection angles
    const angle = Math.PI / 6; // 30 degrees
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Project 3D point to 2D isometric
    // We rotate so that the rear (y=0) is on the left and front (y=max) is on the right
    const project = (x: number, y: number, z: number): [number, number] => {
      const px = (x - y) * cosA;
      const py = (x + y) * sinA - z;
      return [px, py];
    };

    // Calculate bounding box
    const corners = [
      project(0, 0, 0), project(sW, 0, 0), project(0, sL, 0), project(sW, sL, 0),
      project(0, 0, sH), project(sW, 0, sH), project(0, sL, sH), project(sW, sL, sH),
    ];
    const minX = Math.min(...corners.map(c => c[0]));
    const maxX = Math.max(...corners.map(c => c[0]));
    const minY = Math.min(...corners.map(c => c[1]));
    const maxY = Math.max(...corners.map(c => c[1]));

    const svgW = maxX - minX + pad * 2;
    const svgH = maxY - minY + pad * 2;
    const offsetX = -minX + pad;
    const offsetY = -minY + pad;

    // Draw truck wireframe
    const truckLines = [
      // Bottom face
      [project(0, 0, 0), project(sW, 0, 0)],
      [project(sW, 0, 0), project(sW, sL, 0)],
      [project(sW, sL, 0), project(0, sL, 0)],
      [project(0, sL, 0), project(0, 0, 0)],
      // Top face
      [project(0, 0, sH), project(sW, 0, sH)],
      [project(sW, 0, sH), project(sW, sL, sH)],
      [project(sW, sL, sH), project(0, sL, sH)],
      [project(0, sL, sH), project(0, 0, sH)],
      // Vertical edges
      [project(0, 0, 0), project(0, 0, sH)],
      [project(sW, 0, 0), project(sW, 0, sH)],
      [project(sW, sL, 0), project(sW, sL, sH)],
      [project(0, sL, 0), project(0, sL, sH)],
    ];

    // Sort items by depth for proper occlusion
    const sorted = [...placements].sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // Door lines (rear face - y=0 plane)
    const doorLines = [
      [project(0, 0, 0), project(sW, 0, 0)],
      [project(sW, 0, 0), project(sW, 0, sH)],
      [project(sW, 0, sH), project(0, 0, sH)],
      [project(0, 0, sH), project(0, 0, 0)],
    ];

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto">
        {/* Truck wireframe */}
        {truckLines.map(([from, to], idx) => (
          <line key={idx}
            x1={from[0] + offsetX} y1={from[1] + offsetY}
            x2={to[0] + offsetX} y2={to[1] + offsetY}
            stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="6,3" />
        ))}

        {/* Door face (rear - y=0) - highlighted */}
        <polygon
          points={[
            project(0, 0, 0), project(sW, 0, 0),
            project(sW, 0, sH), project(0, 0, sH),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ')}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="#3B82F6" strokeWidth="2" strokeDasharray="4,4"
        />
        <text x={project(sW / 2, 0, sH / 2)[0] + offsetX} y={project(sW / 2, 0, sH / 2)[1] + offsetY}
          textAnchor="middle" className="text-[8px] fill-blue-500 font-bold">
          🚪 ประตูท้าย
        </text>

        {/* Items as 3D boxes */}
        {sorted.map((p, idx) => {
          const color = CARGO_COLORS[p.colorIdx];
          const x = p.x, y = p.y, z = p.z, w = p.w, l = p.l, h = p.h;

          // Top face polygon
          const topFace = [
            project(x, y, z + h),
            project(x + w, y, z + h),
            project(x + w, y + l, z + h),
            project(x, y + l, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');

          // Left face polygon (facing viewer - rear face visible from this angle)
          const leftFace = [
            project(x, y, z),
            project(x + w, y, z),
            project(x + w, y, z + h),
            project(x, y, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');

          // Right face polygon
          const rightFace = [
            project(x + w, y, z),
            project(x + w, y + l, z),
            project(x + w, y + l, z + h),
            project(x + w, y, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');

          // Label position (center of top face)
          const labelPos = project(x + w / 2, y + l / 2, z + h);

          return (
            <g key={idx}>
              {/* Left face */}
              <polygon points={leftFace}
                fill={color.fill} fillOpacity={0.8}
                stroke={color.stroke} strokeWidth="1" />
              {/* Right face (darker) */}
              <polygon points={rightFace}
                fill={color.stroke} fillOpacity={0.5}
                stroke={color.stroke} strokeWidth="1" />
              {/* Top face (lighter) */}
              <polygon points={topFace}
                fill={color.light} fillOpacity={0.7}
                stroke={color.stroke} strokeWidth="1" />
              {/* Label */}
              {showLabels && w > 15 && l > 15 && (
                <text x={labelPos[0] + offsetX} y={labelPos[1] + offsetY - 2}
                  textAnchor="middle" className="text-[7px] font-bold fill-gray-800">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Wheel arches as 3D boxes (วาดหลังสินค้าเพื่อให้มองเห็นชัด) */}
        {hasArches && arches.map((arch, idx) => {
          const x = arch.x, y = arch.y, z = arch.z, w = arch.w, l = arch.l, h = arch.h;
          const topFace = [
            project(x, y, z + h),
            project(x + w, y, z + h),
            project(x + w, y + l, z + h),
            project(x, y + l, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');
          const leftFace = [
            project(x, y, z),
            project(x + w, y, z),
            project(x + w, y, z + h),
            project(x, y, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');
          const rightFace = [
            project(x + w, y, z),
            project(x + w, y + l, z),
            project(x + w, y + l, z + h),
            project(x + w, y, z + h),
          ].map(p => `${p[0] + offsetX},${p[1] + offsetY}`).join(' ');
          const labelPos = project(x + w / 2, y + l / 2, z + h);
          return (
            <g key={`arch-3d-${idx}`}>
              <polygon points={leftFace} fill="#9CA3AF" fillOpacity={0.9} stroke="#374151" strokeWidth="1.5" strokeDasharray="2,1" />
              <polygon points={rightFace} fill="#6B7280" fillOpacity={0.7} stroke="#374151" strokeWidth="1.5" strokeDasharray="2,1" />
              <polygon points={topFace} fill="#D1D5DB" fillOpacity={0.85} stroke="#374151" strokeWidth="1.5" strokeDasharray="2,1" />
              {showLabels && w > 8 && l > 8 && (
                <text x={labelPos[0] + offsetX} y={labelPos[1] + offsetY - 2}
                  textAnchor="middle" className="text-[6px] font-bold fill-gray-700">
                  {arch.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Dimension labels */}
        <text x={project(sW / 2, sL, -10)[0] + offsetX} y={project(sW / 2, sL, -10)[1] + offsetY}
          textAnchor="middle" className="text-[9px] fill-gray-400">
          กว้าง {truck.dimensions.width} ม.
        </text>
        <text x={project(-5, sL / 2, -10)[0] + offsetX} y={project(-5, sL / 2, -10)[1] + offsetY}
          textAnchor="middle" className="text-[9px] fill-blue-400">
          🚪 ท้าย ← → หน้า
        </text>
      </svg>
    );
  };

  // Legend data
  const uniqueCargos = Array.from(cargoColorMap.entries()).map(([cargoIndex, colorIdx]) => {
    const cargoItem = cargoItems[cargoIndex];
    const count = result.items.filter(i => i.cargoIndex === cargoIndex).length;
    return {
      cargoIndex, colorIdx,
      label: cargoItem ? `รายการ ${cargoIndex + 1}` : `ชิ้น ${cargoIndex}`,
      dimensions: cargoItem ? `${cargoItem.width}×${cargoItem.length}×${cargoItem.height} ซม.` : '',
      quantity: cargoItem?.quantity ?? 1,
      packed: count,
      color: CARGO_COLORS[colorIdx],
    };
  });

  return (
    <div className="space-y-4">
      {/* View Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {([
            { key: 'rear' as ViewMode, label: '🚪 ด้านท้ายรถ', desc: 'มองจากท้ายรถเข้าไป' },
            { key: 'top' as ViewMode, label: '⬆️ มุมบน', desc: 'มองจากด้านบนลงมา' },
            { key: 'side' as ViewMode, label: '👁️ ด้านข้าง', desc: 'มองจากด้านข้าง' },
            { key: '3d' as ViewMode, label: '🎲 3D', desc: 'มุมมอง 3 มิติ' },
          ]).map(view => (
            <button
              key={view.key}
              onClick={() => setViewAngle(view.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                viewAngle === view.key
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title={view.desc}
            >
              {view.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            showLabels ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🏷️ {showLabels ? 'ซ่อนชื่อ' : 'แสดงชื่อ'}
        </button>
      </div>

      {/* Visualization Area */}
      <div className="bg-gradient-to-b from-slate-100 to-slate-200 rounded-xl p-4 flex justify-center overflow-hidden">
        {viewAngle === 'rear' && renderRearView()}
        {viewAngle === 'top' && renderTopView()}
        {viewAngle === 'side' && renderSideView()}
        {viewAngle === '3d' && render3DView()}
      </div>

      {/* Space Usage Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-200">
          <p className="text-[10px] text-gray-500">ใช้แล้ว</p>
          <p className="text-sm font-bold text-emerald-600">{usedPercent.toFixed(1)}%</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
          <p className="text-[10px] text-gray-500">พื้นที่ว่าง</p>
          <p className="text-sm font-bold text-blue-600">{freePercent.toFixed(1)}%</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-200">
          <p className="text-[10px] text-gray-500">วางได้</p>
          <p className="text-sm font-bold text-emerald-600">{result.items.length} ชิ้น</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 text-center border border-red-200">
          <p className="text-[10px] text-gray-500">วางไม่ได้</p>
          <p className="text-sm font-bold text-red-600">{result.unfittedItems.length} ชิ้น</p>
        </div>
      </div>

      {/* Loading Direction Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <p className="text-sm font-medium text-blue-800">
          🚛 การบรรทุก: ใส่ของจาก <span className="text-blue-600 font-bold">ด้านท้ายรถ (ประตู)</span> เข้าไปข้างใน
        </p>
        <p className="text-xs text-blue-600 mt-1">
          สินค้าที่อยู่ใกล้ประตูท้าย = ใส่เข้าไปทีหลัง | สินค้าที่อยู่ลึกข้างใน = ใส่เข้าไปก่อน
        </p>
      </div>

      {/* View Description */}
      <div className="text-center text-xs text-gray-500">
        {viewAngle === 'rear' && '🚪 มุมมองจากด้านท้ายรถ — เหมือนเปิดประตูท้ายแล้วมองเข้าไป สินค้าที่อยู่ใกล้ประตูจะชัดกว่า'}
        {viewAngle === 'top' && '⬆️ มุมมองจากด้านบน — ด้านบน = ท้ายรถ (ประตู), ด้านล่าง = หน้ารถ'}
        {viewAngle === 'side' && '👁️ มุมมองจากด้านข้าง — ด้านซ้าย = ท้ายรถ (ประตู), ด้านขวา = หน้ารถ'}
        {viewAngle === '3d' && '🎲 มุมมอง 3 มิติ — ด้านซ้าย = ท้ายรถ (ประตู), ด้านขวา = หน้ารถ'}
        {' | '}🚛 {truck.name} — {truck.dimensions.width}×{truck.dimensions.length}×{truck.dimensions.height} ม. (กว้าง×ยาว×สูง)
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-bold text-gray-700 text-sm mb-2">📋 รายการสินค้าที่วางในรถ</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {uniqueCargos.map((cargo) => (
            <div key={cargo.cargoIndex} className="flex items-center gap-2 bg-white rounded-lg p-2 border">
              <div
                className="w-5 h-5 rounded flex-shrink-0"
                style={{ backgroundColor: cargo.color.fill, border: `2px solid ${cargo.color.stroke}` }}
              />
              <div className="text-xs">
                <div className="font-medium text-gray-800">{cargo.label}</div>
                <div className="text-gray-500">
                  {cargo.dimensions} × {cargo.quantity} ชิ้น → วางได้ {cargo.packed} ชิ้น
                </div>
              </div>
            </div>
          ))}
        </div>
        {result.unfittedItems.length > 0 && (
          <div className="mt-2 text-xs text-red-600">
            ❌ วางไม่ได้ {result.unfittedItems.length} ชิ้น
          </div>
        )}
      </div>

      {/* Algorithm Explanation */}
      <details className="bg-blue-50 border border-blue-200 rounded-lg">
        <summary className="p-3 text-sm font-medium text-blue-800 cursor-pointer">
          🔍 วิธีการคำนวณ 3D Bin Packing
        </summary>
        <div className="p-3 pt-0 text-xs text-blue-700 space-y-2">
          <p>
            <strong>อัลกอริทึม:</strong> First Fit Decreasing (FFD) พร้อมการหมุน 6 ทิศทาง
          </p>
          <p>
            <strong>ขั้นตอน:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>เรียงสินค้าจากขนาดใหญ่ไปเล็ก (ตามปริมาตร)</li>
            <li>ลองวางสินค้าแต่ละชิ้นในพื้นที่ว่างที่เล็กที่สุดที่ใส่ได้ (Best Fit)</li>
            <li>ลองหมุนสินค้า 6 แบบ (สลับ กว้าง×ยาว×สูง) เพื่อหาท่าวางที่ดีที่สุด</li>
            <li>เมื่อวางสินค้าได้ จะตัดพื้นที่เหลือออกเป็น 3 ส่วน (ขวา, หน้า, บน)</li>
            <li>ตรวจสอบว่าไม่มีสินค้าทับซ้อนกัน</li>
          </ol>
          <p>
            <strong>การบรรทุกจากด้านท้าย:</strong> ภาพแสดงการใส่ของจากประตูท้ายรถเข้าไปข้างใน
            — สินค้าที่อยู่ใกล้ประตู (ด้านท้าย) ใส่เข้าไปทีหลัง
            — สินค้าที่อยู่ลึกเข้าไปด้านใน ใส่เข้าไปก่อน
          </p>
          <p>
            <strong>พื้นที่ใช้ได้จริง:</strong> คูณด้วย usableSpace {truck.usableSpace}% (คิดจากทุกมิติ)
          </p>
          {hasArches && (
            <p>
              <strong>ซุ้มล้อ (Wheel Arch):</strong> มี {arches.length} จุด — ระบบจะไม่วางสินค้าทับซุ้มล้อ
              แต่วางเหนือซุ้มล้อได้ (ที่ความสูง ≥ {arches[0].origH} ซม. จากพื้น)
            </p>
          )}
          <p className="text-blue-500 italic">
            ⚠️ ผลลัพธ์เป็นการประมาณการ สินค้าจริงอาจวางได้ต่างเล็กน้อยขึ้นอยู่กับรูปทรงและการจัดเรียงจริง
          </p>
        </div>
      </details>
    </div>
  );
}
