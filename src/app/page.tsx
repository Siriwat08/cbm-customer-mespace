'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { selectedTruck, FALLBACK_DIESEL_PRICE, LABOR_COST, CARGO_LIMITS } from '@/lib/truck-data';
import { performBinPacking } from '@/lib/bin-packing';
import { formatDisplayDate, getTodayISO } from '@/lib/date-utils';
import { getApplicableOilPrice } from '@/lib/oil-price-api';
import BinPackingVisualization from '@/components/BinPackingVisualization';
import { useToast } from '@/hooks/use-toast';
import type { OilPrice, RateData, CargoItem, BinPackingResult } from '@/lib/types';

export default function Home() {
  // ===== Tab State =====
  const [activeTab, setActiveTab] = useState<'cbm' | 'price'>('cbm');

  // ===== Oil Price State =====
  const [currentOilPrice, setCurrentOilPrice] = useState<number>(FALLBACK_DIESEL_PRICE);
  const [oilPriceHistory, setOilPriceHistory] = useState<OilPrice[]>([]);
  const [loadingOil, setLoadingOil] = useState(true);
  const [liveOilPrice, setLiveOilPrice] = useState<number | null>(null);

  // ===== Manual Oil Price Input (session-only) =====
  const [showOilPriceForm, setShowOilPriceForm] = useState(false);
  const [manualPrice, setManualPrice] = useState<string>('');
  const [usingManualPrice, setUsingManualPrice] = useState(false);
  const [originalOilPrice, setOriginalOilPrice] = useState<number>(FALLBACK_DIESEL_PRICE);

  // ===== Price Calculator State =====
  const [distance, setDistance] = useState<string>('');

  // ===== Labor State =====
  const [includeLabor, setIncludeLabor] = useState(false);

  // ===== CBM Calculator State =====
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([
    { id: '1', width: 0, length: 0, height: 0, quantity: 0, weight: 0 },
  ]);
  const [showPopup, setShowPopup] = useState(false);
  const [popupImage, setPopupImage] = useState('');

  // ===== Oil Price History Display =====
  const [showAllHistory, setShowAllHistory] = useState(false);

  // ===== Toast notifications =====
  const { toast } = useToast();

  // ===== Rate Data State =====
  const [rateData, setRateData] = useState<RateData | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);

  // ===== Derived State =====
  const truck = selectedTruck;
  const jobKey = truck.jobKey;

  const validationErrors = useMemo<Record<string, string>>(() => {
    const errors: Record<string, string> = {};
    cargoItems.forEach((item, index) => {
      if (item.width < 0) errors[index.toString()] = `รายการ ${index + 1}: ความกว้างต้องไม่ติดลบ`;
      else if (item.length < 0) errors[index.toString()] = `รายการ ${index + 1}: ความยาวต้องไม่ติดลบ`;
      else if (item.height < 0) errors[index.toString()] = `รายการ ${index + 1}: ความสูงต้องไม่ติดลบ`;
      else if (item.weight < 0) errors[index.toString()] = `รายการ ${index + 1}: น้ำหนักต้องไม่ติดลบ`;
      else if (item.width > CARGO_LIMITS.MAX_DIMENSION_CM) errors[index.toString()] = `รายการ ${index + 1}: ความกว้างเกิน ${CARGO_LIMITS.MAX_DIMENSION_CM.toLocaleString()} ซม.`;
      else if (item.length > CARGO_LIMITS.MAX_DIMENSION_CM) errors[index.toString()] = `รายการ ${index + 1}: ความยาวเกิน ${CARGO_LIMITS.MAX_DIMENSION_CM.toLocaleString()} ซม.`;
      else if (item.height > CARGO_LIMITS.MAX_DIMENSION_CM) errors[index.toString()] = `รายการ ${index + 1}: ความสูงเกิน ${CARGO_LIMITS.MAX_DIMENSION_CM.toLocaleString()} ซม.`;
      else if (item.weight > CARGO_LIMITS.MAX_WEIGHT_KG) errors[index.toString()] = `รายการ ${index + 1}: น้ำหนักเกิน ${CARGO_LIMITS.MAX_WEIGHT_KG.toLocaleString()} kg`;
      else if (item.quantity > CARGO_LIMITS.MAX_QUANTITY) errors[index.toString()] = `รายการ ${index + 1}: จำนวนเกิน ${CARGO_LIMITS.MAX_QUANTITY.toLocaleString()}`;
    });
    return errors;
  }, [cargoItems]);

  const binPackingResult = useMemo<BinPackingResult | null>(() => {
    const allValid = cargoItems.every(item => item.width > 0 && item.length > 0 && item.height > 0);
    if (!allValid) return null;
    return performBinPacking(cargoItems, truck);
  }, [cargoItems, truck]);

  // ===== Applicable Oil Price (กฎจันทร์→พุธ-อังคาร) =====
  const applicableOilInfo = useMemo(() => {
    if (usingManualPrice) {
      // ถ้าผู้ใช้กำหนดราคาเอง ใช้ราคานั้นเลย
      return {
        price: currentOilPrice,
        mondayDate: '',
        periodStart: '',
        periodEnd: '',
        isManual: true,
      };
    }
    const todayISO = getTodayISO();
    const applicable = getApplicableOilPrice(oilPriceHistory, todayISO);
    return { ...applicable, isManual: false };
  }, [oilPriceHistory, currentOilPrice, usingManualPrice]);

  // ราคาน้ำมันที่ใช้คิดค่าขนส่งจริง
  const applicableOilPrice = applicableOilInfo.price;

  const { calculatedPrice, priceDetails } = useMemo(() => {
    if (!rateData || !distance || applicableOilPrice == null) {
      return { calculatedPrice: null, priceDetails: null };
    }

    const jobData = rateData[jobKey];
    if (!jobData) {
      return { calculatedPrice: null, priceDetails: null };
    }

    const dist = parseFloat(distance);
    if (isNaN(dist) || dist <= 0) {
      return { calculatedPrice: null, priceDetails: null };
    }

    let oilIndex = -1;
    for (let i = 0; i < jobData.oil_ranges.length; i++) {
      const range = jobData.oil_ranges[i];
      if (applicableOilPrice >= range.min && applicableOilPrice <= range.max) {
        oilIndex = i;
        break;
      }
    }
    if (oilIndex === -1) oilIndex = jobData.oil_ranges.length - 1;

    let distIndex = -1;
    let distRange = '';

    if (jobData.data && jobData.data.length > 0) {
      for (let i = 0; i < jobData.data.length; i++) {
        const row = jobData.data[i];
        if (dist >= row.dist_min && dist <= row.dist_max) {
          distIndex = i;
          distRange = `${row.dist_min} - ${row.dist_max} กม.`;
          break;
        }
      }
      if (distIndex === -1) {
        if (dist < jobData.data[0].dist_min) {
          distIndex = 0;
          distRange = `0 - ${jobData.data[0].dist_max} กม.`;
        } else {
          distIndex = jobData.data.length - 1;
          const lastRow = jobData.data[distIndex];
          distRange = `${lastRow.dist_min}+ กม.`;
        }
      }
    }

    if (distIndex >= 0 && jobData.data[distIndex]?.prices?.[oilIndex] !== undefined) {
      const price = jobData.data[distIndex].prices[oilIndex];
      const oilRange = `${jobData.oil_ranges[oilIndex].min} - ${jobData.oil_ranges[oilIndex].max} บาท`;
      return { calculatedPrice: price, priceDetails: { oilRange, distRange } };
    }

    return { calculatedPrice: null, priceDetails: null };
  }, [rateData, jobKey, distance, applicableOilPrice]);

  // ===== Data Fetching Effects =====
  const applyOilPriceData = useCallback((data: { price?: number; livePrice?: { price?: number } | null; history?: OilPrice[] }) => {
    if (data.price !== undefined && data.price !== null) {
      setCurrentOilPrice(data.price);
      if (usingManualPrice) {
        setOriginalOilPrice(data.price);
      }
    }
    if (data.livePrice && typeof data.livePrice.price === 'number') {
      setLiveOilPrice(data.livePrice.price);
    }
    if (data.history && data.history.length > 0) {
      setOilPriceHistory(data.history);
    }
  }, [usingManualPrice]);

  useEffect(() => {
    let cancelled = false;
    fetch('/transport_rates.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: RateData) => {
        if (cancelled) return;
        setRateData(data);
      })
      .catch((err) => {
        console.error('Failed to load rate data:', err);
        toast({ title: 'โหลดข้อมูลล้มเหลว', description: 'ไม่สามารถโหลดอัตราค่าขนส่งได้', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoadingRates(false);
      });
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/oil-price')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        applyOilPriceData(data);
      })
      .catch((error) => {
        console.error('Failed to fetch oil price:', error);
        toast({ title: 'โหลดราคาน้ำมันล้มเหลว', description: 'ใช้ราคาสำรองชั่วคราว', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoadingOil(false);
      });
    return () => { cancelled = true; };
  }, [applyOilPriceData, toast]);

  const refreshOilPrice = useCallback(async () => {
    setLoadingOil(true);
    try {
      const res = await fetch('/api/oil-price');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      applyOilPriceData(data);
    } catch (error) {
      console.error('Failed to fetch oil price:', error);
      toast({ title: 'โหลดราคาน้ำมันล้มเหลว', description: 'ใช้ราคาสำรองชั่วคราว', variant: 'destructive' });
    } finally {
      setLoadingOil(false);
    }
  }, [applyOilPriceData, toast]);

  // ===== Handlers =====
  const calculateCBM = (item: CargoItem) => ((item.width * item.length * item.height) / 1000000) * item.quantity;
  const totalCBM = cargoItems.reduce((sum, item) => sum + calculateCBM(item), 0);
  const totalWeight = cargoItems.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const allItemsValid = cargoItems.every((item) => item.width > 0 && item.length > 0 && item.height > 0 && item.weight > 0 && item.quantity > 0);
  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  const addCargoItem = () => {
    setCargoItems([...cargoItems, { id: crypto.randomUUID(), width: 0, length: 0, height: 0, quantity: 0, weight: 0 }]);
  };

  const removeCargoItem = (id: string) => {
    if (cargoItems.length > 1) setCargoItems(cargoItems.filter((item) => item.id !== id));
  };

  const updateCargoItem = (id: string, field: keyof CargoItem, value: number) => {
    setCargoItems(cargoItems.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const resetForm = () => {
    setCargoItems([{ id: '1', width: 0, length: 0, height: 0, quantity: 0, weight: 0 }]);
  };

  const openPopup = (image: string) => { setPopupImage(image); setShowPopup(true); };

  const handleApplyManualPrice = () => {
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price <= 0 || price > 200) {
      alert('กรุณาใส่ราคาที่ถูกต้อง (0.01 - 200 บาท)');
      return;
    }
    if (!usingManualPrice) {
      setOriginalOilPrice(currentOilPrice);
    }
    setCurrentOilPrice(price);
    setUsingManualPrice(true);
    setShowOilPriceForm(false);
    setManualPrice('');
  };

  const handleClearManualPrice = () => {
    setCurrentOilPrice(originalOilPrice);
    setUsingManualPrice(false);
    setManualPrice('');
    setShowOilPriceForm(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-emerald-600 text-white py-4 px-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Image src="/images/mespace-logo-full.png" alt="MESPACE Self Storage" width={120} height={80} className="rounded bg-white/95 p-1.5" style={{ objectFit: 'contain' }} />
          <div>
            <h1 className="text-xl font-bold">MESPACE SELF STORAGE</h1>
            <p className="text-blue-100 text-sm">เครื่องมือช่วยคำนวณการรับ-ส่งของ (Door-to-Door Storage)</p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-4xl mx-auto px-4 pt-4 w-full">
        <div className="flex gap-2 bg-white rounded-lg shadow p-1">
          <button onClick={() => setActiveTab('cbm')} className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all text-sm ${activeTab === 'cbm' ? 'bg-blue-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            📦 คำนวณ CBM
          </button>
          <button onClick={() => setActiveTab('price')} className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all text-sm ${activeTab === 'price' ? 'bg-blue-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            💰 คำนวณราคา
          </button>
        </div>
      </div>

      {/* Loading Rates Banner */}
      {loadingRates && (
        <div className="max-w-4xl mx-auto px-4 mt-3 w-full">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
            กำลังโหลดข้อมูลอัตราค่าขนส่ง...
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
        {/* ===== CBM Calculator Tab ===== */}
        {activeTab === 'cbm' && (
          <div className="space-y-6">
            {/* Truck Info */}
            <section className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-6 py-4">
                <h2 className="text-lg font-bold">🚛 ข้อมูลรถ</h2>
                <p className="text-blue-100 text-sm">รถที่ใช้บริการ: {truck.name}</p>
              </div>
              <div className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative h-48 sm:w-1/2 overflow-hidden rounded-xl cursor-pointer" onClick={() => openPopup(truck.image)}>
                    <Image src={truck.image} alt={truck.name} fill className="object-cover object-top" style={{ objectPosition: 'top' }} />
                    <button onClick={(e) => { e.stopPropagation(); openPopup(truck.image); }} className="absolute bottom-2 left-2 bg-white text-blue-600 text-xs px-2 py-1 rounded shadow hover:bg-blue-50">
                      ดูข้อมูลเพิ่มเติม
                    </button>
                  </div>
                  <div className="sm:w-1/2 space-y-2">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-sm text-gray-600">CBM (ปริมาตรสูงสุด)</p>
                      <p className="text-xl font-bold text-emerald-600">{truck.cbm} ลบ.ม.</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-sm text-gray-600">น้ำหนักบรรทุกสูงสุด</p>
                      <p className="text-xl font-bold text-orange-600">{truck.maxWeight.toLocaleString()} kg</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-gray-600">ขนาดกระบะ (ก×ย×ส)</p>
                      <p className="text-base font-bold text-blue-600">{truck.dimensions.width}×{truck.dimensions.length}×{truck.dimensions.height} ม.</p>
                    </div>
                    {truck.obstacles && truck.obstacles.length > 0 && (
                      <div className="bg-gray-100 rounded-lg p-3">
                        <p className="text-sm text-gray-600">ซุ้มล้อ</p>
                        <p className="text-xs font-bold text-gray-700">{truck.obstacles.length} จุด (วางทับไม่ได้)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Cargo Items */}
            <section className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-lg font-bold">📦 รายการสินค้า</h2>
                  <p className="text-amber-100 text-xs">กดปุ่ม &quot;+ เพิ่มรายการ&quot; เพื่อเพิ่มรายการสินค้า</p>
                </div>
                <button onClick={addCargoItem} className="bg-white text-orange-600 px-3 py-1 rounded-lg font-medium hover:bg-orange-50">
                  + เพิ่มรายการ
                </button>
              </div>
              <div className="p-4 space-y-4">
                {cargoItems.map((item, index) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-gray-800 bg-emerald-100 px-3 py-1 rounded">รายการที่ {index + 1}</span>
                      {cargoItems.length > 1 && (
                        <button onClick={() => removeCargoItem(item.id)} className="text-red-500 hover:text-red-700 font-medium text-sm">✕ ลบ</button>
                      )}
                    </div>
                    {validationErrors[index.toString()] && (
                      <div className="mb-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">⚠️ {validationErrors[index.toString()]}</div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">กว้าง (ซม.) *</label>
                        <input type="number" value={item.width || ''} onChange={(e) => updateCargoItem(item.id, 'width', parseFloat(e.target.value) || 0)} inputMode="decimal" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none" placeholder="0" min="0.1" max={CARGO_LIMITS.MAX_DIMENSION_CM} step="0.1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">ยาว (ซม.) *</label>
                        <input type="number" value={item.length || ''} onChange={(e) => updateCargoItem(item.id, 'length', parseFloat(e.target.value) || 0)} inputMode="decimal" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none" placeholder="0" min="0.1" max={CARGO_LIMITS.MAX_DIMENSION_CM} step="0.1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">สูง (ซม.) *</label>
                        <input type="number" value={item.height || ''} onChange={(e) => updateCargoItem(item.id, 'height', parseFloat(e.target.value) || 0)} inputMode="decimal" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none" placeholder="0" min="0.1" max={CARGO_LIMITS.MAX_DIMENSION_CM} step="0.1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">จำนวน *</label>
                        <input type="number" value={item.quantity || ''} onChange={(e) => updateCargoItem(item.id, 'quantity', parseInt(e.target.value) || 0)} inputMode="numeric" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none" placeholder="1" min="1" max={CARGO_LIMITS.MAX_QUANTITY} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">น้ำหนัก (kg) *</label>
                        <input type="number" value={item.weight || ''} onChange={(e) => updateCargoItem(item.id, 'weight', parseFloat(e.target.value) || 0)} inputMode="decimal" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none" placeholder="0" min="0.1" max={CARGO_LIMITS.MAX_WEIGHT_KG} step="0.1" />
                      </div>
                    </div>
                    {item.width > 0 && item.length > 0 && item.height > 0 && (
                      <div className="mt-3 p-2 bg-emerald-50 rounded-lg">
                        <p className="text-sm text-emerald-700 font-medium">
                          📦 CBM: {calculateCBM(item).toFixed(4)} m³
                          {item.quantity > 1 && <span className="text-emerald-500 ml-1">({(item.width * item.length * item.height / 1000000).toFixed(4)} × {item.quantity})</span>}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Results - 3D Bin Packing */}
            {totalCBM > 0 && allItemsValid && !hasValidationErrors && (
              <section className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-6 py-4">
                  <h2 className="text-lg font-bold">📊 ผลการตรวจสอบ (3D Bin Packing)</h2>
                  <p className="text-teal-100 text-sm">ตรวจสอบการจัดวางสินค้าในรถแบบ 3 มิติ</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-gray-600 text-sm">ปริมาตรรวม</p>
                      <p className="text-2xl font-bold text-blue-600">{totalCBM.toFixed(4)} m³</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 text-center">
                      <p className="text-gray-600 text-sm">น้ำหนักรวม</p>
                      <p className="text-2xl font-bold text-orange-600">{totalWeight.toLocaleString()} kg</p>
                    </div>
                  </div>

                  {binPackingResult && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 rounded-lg p-4 text-center">
                          <p className="text-gray-600 text-sm">วางสินค้าได้</p>
                          <p className="text-2xl font-bold text-emerald-600">{binPackingResult.items.length} ชิ้น</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4 text-center">
                          <p className="text-gray-600 text-sm">วางไม่ได้</p>
                          <p className="text-2xl font-bold text-red-600">{binPackingResult.unfittedItems.length} ชิ้น</p>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>การใช้พื้นที่จริง (3D)</span>
                          <span>{binPackingResult.utilizationPercent.toFixed(1)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-3">
                          <div className={`h-3 rounded-full ${binPackingResult.utilizationPercent > 90 ? 'bg-red-500' : binPackingResult.utilizationPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(binPackingResult.utilizationPercent, 100)}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>การใช้น้ำหนัก</span>
                          <span>{((totalWeight / truck.maxWeight) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-3">
                          <div className={`h-3 rounded-full ${totalWeight > truck.maxWeight ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((totalWeight / truck.maxWeight) * 100, 100)}%` }} />
                        </div>
                      </div>

                      <BinPackingVisualization
                        result={binPackingResult}
                        truck={truck}
                        cargoItems={cargoItems}
                      />

                      {binPackingResult.canFitAll && totalWeight <= truck.maxWeight && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                          <p className="text-emerald-800 font-bold text-lg">✅ สินค้าทั้งหมดใส่รถ {truck.name} ได้!</p>
                          <p className="text-emerald-600 text-sm mt-1">ใช้พื้นที่ {binPackingResult.utilizationPercent.toFixed(1)}% | น้ำหนัก {((totalWeight / truck.maxWeight) * 100).toFixed(1)}%</p>
                        </div>
                      )}

                      {binPackingResult.unfittedItems.length > 0 && (() => {
                        const grouped = new Map<number, { count: number; reasons: Set<string> }>();
                        binPackingResult.unfittedItems.forEach((item) => {
                          const existing = grouped.get(item.cargoIndex);
                          if (existing) {
                            existing.count++;
                            existing.reasons.add(item.reason);
                          } else {
                            grouped.set(item.cargoIndex, { count: 1, reasons: new Set([item.reason]) });
                          }
                        });
                        return (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-red-800 font-medium">❌ มีสินค้าวางในรถไม่ได้ ({binPackingResult.unfittedItems.length} ชิ้น)</p>
                            <ul className="text-sm text-red-600 mt-1 space-y-1">
                              {Array.from(grouped.entries()).map(([cargoIndex, data]) => {
                                const cargo = cargoItems[cargoIndex];
                                const label = cargo ? `${cargo.width}×${cargo.length}×${cargo.height} ซม.` : `รายการ ${cargoIndex + 1}`;
                                return (
                                  <li key={cargoIndex}>
                                    • {label}{data.count > 1 ? ` × ${data.count} ชิ้น` : ''} — {Array.from(data.reasons).join(', ')}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })()}

                      {totalWeight > truck.maxWeight && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-red-800 font-medium">❌ น้ำหนักรวมเกินความจุรถ</p>
                          <p className="text-sm text-red-600">น้ำหนัก {totalWeight.toLocaleString()} kg เกิน {truck.maxWeight.toLocaleString()} kg</p>
                        </div>
                      )}

                      <button onClick={() => setActiveTab('price')} className="w-full py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-lg font-bold hover:from-blue-700 hover:to-emerald-600 transition">
                        💰 ไปคำนวณราคาค่าขนส่ง
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {hasValidationErrors && totalCBM > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800">⚠️ กรุณาแก้ไขข้อผิดพลาดในรายการสินค้าก่อนดูผลลัพธ์</div>
            )}

            <button onClick={resetForm} className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300">🔄 รีเซ็ตข้อมูล</button>
          </div>
        )}

        {/* ===== Price Calculator Tab ===== */}
        {activeTab === 'price' && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-6 py-4">
                <h2 className="text-lg font-bold">⛽ ราคาน้ำมันดีเซล</h2>
                <p className="text-emerald-100 text-sm">อ้างอิง: บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)</p>
                <p className="text-emerald-100 text-xs mt-0.5">ราคาขายปลีก กทม. และปริมณฑล (หน่วย: บาท/ลิตร)</p>
              </div>
              <div className="p-4">
                {loadingOil ? (
                  <div className="text-center py-4">
                    <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-gray-500 mt-2">กำลังโหลดราคาน้ำมัน...</p>
                  </div>
                ) : oilPriceHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left py-2 px-3 text-gray-600 font-medium w-1/4">วันที่</th>
                          <th className="text-center py-2 px-3 text-gray-600 font-medium w-1/5">สถานะ</th>
                          <th className="text-center py-2 px-3 text-gray-600 font-medium w-1/5">ใช้คำนวณ</th>
                          <th className="text-right py-2 px-3 text-gray-600 font-medium w-1/5">ราคา (บาท)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oilPriceHistory.slice(0, showAllHistory ? oilPriceHistory.length : 5).map((item, index) => {
                          let statusEmoji = '';
                          let statusText = '';
                          let statusColor = '';
                          if (index < oilPriceHistory.length - 1) {
                            const prevPrice = oilPriceHistory[index + 1].price;
                            const diff = item.price - prevPrice;
                            if (diff > 0) { statusEmoji = '🟢'; statusText = `▲ เพิ่มขึ้น +${diff.toFixed(2)}`; statusColor = 'text-emerald-600'; }
                            else if (diff < 0) { statusEmoji = '🔴'; statusText = `▼ ลดลง ${diff.toFixed(2)}`; statusColor = 'text-red-500'; }
                            else { statusEmoji = '⚪'; statusText = '➖ เท่าเดิม'; statusColor = 'text-gray-500'; }
                          }
                          const isCurrent = index === 0;
                          return (
                            <tr key={item.date} className={`border-b ${isCurrent ? 'bg-emerald-50 font-bold' : ''}`}>
                              <td className="py-2 px-3 text-left text-gray-700">{formatDisplayDate(item.date)}</td>
                              <td className={`py-2 px-3 text-center text-sm font-medium ${statusColor}`}>{statusEmoji} {statusText}</td>
                              <td className="py-2 px-3 text-center">{isCurrent && <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded">ใช้คำนวณ</span>}</td>
                              <td className={`py-2 px-3 text-right ${isCurrent ? 'text-emerald-600 text-lg' : 'text-gray-900'}`}>{item.price.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        {oilPriceHistory.length > 5 && (
                          <tr>
                            <td colSpan={4} className="text-center pt-2">
                              <button onClick={() => setShowAllHistory(!showAllHistory)} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                                {showAllHistory ? '▲ แสดงน้อยลง' : `▼ แสดงเพิ่มเติม (${oilPriceHistory.length - 5} รายการ)`}
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600 mb-2">ราคาน้ำมันดีเซล</p>
                    <p className="text-3xl font-bold text-orange-600">{currentOilPrice.toFixed(2)} บาท</p>
                    <p className="text-sm text-orange-500 mt-2">⚠️ ใช้ข้อมูลประมาณการ</p>
                    <button onClick={refreshOilPrice} className="mt-3 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">🔄 ลองโหลดใหม่</button>
                  </div>
                )}

                <div className="mt-3 border-t pt-4">
                  {usingManualPrice && (
                    <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                      <div className="text-sm text-blue-800">
                        <span className="font-medium">✏️ ใช้ราคาน้ำมันที่กำหนดเอง:</span> {currentOilPrice.toFixed(2)} บาท/ลิตร
                        <span className="text-blue-500 text-xs ml-1">(ใช้คำนวณเฉพาะรอบนี้เท่านั้น)</span>
                      </div>
                      <button onClick={handleClearManualPrice} className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 border border-red-200 rounded hover:bg-red-50">
                        ✕ กลับใช้ราคาจากระบบ
                      </button>
                    </div>
                  )}
                  {!showOilPriceForm ? (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setShowOilPriceForm(true); setManualPrice(''); }} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition">
                        ✏️ ใส่ราคาน้ำมันดีเซล
                      </button>
                      {liveOilPrice !== null && liveOilPrice !== currentOilPrice && (
                        <button onClick={() => setCurrentOilPrice(liveOilPrice)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition">
                          🔄 ใช้ราคาล่าสุดจากปตท. ({liveOilPrice.toFixed(2)} บาท)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <h3 className="font-bold text-amber-800">✏️ ใส่ราคาน้ำมันดีเซล</h3>
                      <p className="text-xs text-amber-600">⚠️ ราคานี้จะใช้คำนวณเฉพาะรอบนี้เท่านั้น จะไม่ถูกบันทึกลงระบบ</p>
                      <div>
                        <label className="text-xs text-gray-600 font-medium">ราคา (บาท/ลิตร)</label>
                        <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} inputMode="decimal" className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none" placeholder="เช่น 42.25" min="0.01" max="200" step="0.01" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleApplyManualPrice} disabled={!manualPrice} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 transition">
                          ✅ ใช้คำนวณ
                        </button>
                        <button onClick={() => setShowOilPriceForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition">ยกเลิก</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-6 py-4">
                <h2 className="text-lg font-bold">🧮 คำนวณราคาค่าขนส่ง</h2>
                <p className="text-slate-300 text-sm">ประเภทรถ: <span className="font-bold text-white">{truck.name}</span></p>
              </div>
              <div className="p-6 space-y-6">
                {/* แสดงรอบราคาน้ำมันที่ใช้คิดค่าขนส่ง */}
                {!applicableOilInfo.isManual && applicableOilInfo.mondayDate && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <p className="text-blue-800 font-medium">
                      📅 รอบราคาน้ำมัน: ใช้ราคา จันทร์ที่ {formatDisplayDate(applicableOilInfo.mondayDate)} ({applicableOilPrice.toFixed(2)} บาท)
                    </p>
                    <p className="text-blue-600 text-xs mt-0.5">
                      รอบ {formatDisplayDate(applicableOilInfo.periodStart)} - {formatDisplayDate(applicableOilInfo.periodEnd)} (พุธ - อังคาร)
                    </p>
                  </div>
                )}
                {applicableOilInfo.isManual && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="text-amber-800 font-medium">✏️ ใช้ราคาน้ำมันที่กำหนดเอง: {applicableOilPrice.toFixed(2)} บาท</p>
                  </div>
                )}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">ประเภทงาน</label>
                  <div className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 bg-gray-50 text-lg text-gray-700">
                    {jobKey}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">บริการ MESPACE ใช้รถ 4 ล้อ สำหรับรับ-ส่งของ Door-to-Door Storage</p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-2">ระยะทาง <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={distance} onChange={(e) => { const val = parseFloat(e.target.value); if (val < 0) return; if (val === 0 && e.target.value.includes('0') && !e.target.value.includes('.')) { setDistance(''); return; } setDistance(e.target.value); }} inputMode="decimal" placeholder="กรอกระยะทาง" className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none text-lg" min="1" aria-label="ระยะทางเป็นกิโลเมตร" />
                    <span className="text-gray-600 font-medium">กม.</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <button
                    onClick={() => setIncludeLabor(!includeLabor)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${includeLabor ? 'bg-amber-100 border-2 border-amber-400 shadow-md' : 'bg-white border-2 border-gray-200 hover:border-amber-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${includeLabor ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                        {includeLabor && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-800">👷 เพิ่มแรงงานยกสินค้า</p>
                        <p className="text-xs text-gray-500">ค่าแรงงานยกสินค้าขึ้น-ลงรถ</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-600 text-lg">+฿{LABOR_COST.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">ต่อเที่ยว</p>
                    </div>
                  </button>
                  {includeLabor && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                      ✅ เพิ่มค่าแรงงานยกสินค้า ฿{LABOR_COST.toLocaleString()} เข้าไปในยอดรวมแล้ว
                    </div>
                  )}
                </div>

                {calculatedPrice !== null && priceDetails ? (
                  <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-xl p-6 border-2 border-blue-200">
                    <div className="text-center">
                      <p className="text-gray-600 mb-2">ราคาค่าขนส่ง</p>
                      <p className="text-4xl font-bold text-blue-600">฿{calculatedPrice.toLocaleString()}</p>

                      {includeLabor && (
                        <div className="mt-3 bg-white/80 rounded-lg p-4 text-left space-y-2">
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>🚛 ค่าขนส่ง</span>
                            <span className="font-medium">฿{calculatedPrice.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm text-amber-700">
                            <span>👷 ค่าแรงงานยกสินค้า</span>
                            <span className="font-medium">฿{LABOR_COST.toLocaleString()}</span>
                          </div>
                          <div className="border-t border-blue-200 pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="font-bold text-gray-800">รวมทั้งหมด</span>
                              <span className="font-bold text-blue-600 text-2xl">฿{(calculatedPrice + LABOR_COST).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 text-sm text-gray-500 space-y-1">
                        <p>🚛 ประเภทรถ: {truck.name}</p>
                        <p>⛽ ช่วงราคาน้ำมัน: {priceDetails.oilRange}</p>
                        <p>📏 ช่วงระยะทาง: {priceDetails.distRange}</p>
                        <p>💵 ราคาน้ำมันที่ใช้คำนวณ: <span className="font-semibold text-blue-600">{applicableOilPrice.toFixed(2)} บาท</span></p>
                        {!applicableOilInfo.isManual && applicableOilInfo.mondayDate && (
                          <p className="text-blue-500">
                            📅 อ้างอิง: ราคาน้ำมัน จันทร์ที่ {formatDisplayDate(applicableOilInfo.mondayDate)} → ใช้รอบ {formatDisplayDate(applicableOilInfo.periodStart)} - {formatDisplayDate(applicableOilInfo.periodEnd)}
                          </p>
                        )}
                        {applicableOilInfo.isManual && (
                          <p className="text-amber-500">✏️ ใช้ราคาน้ำมันที่กำหนดเอง</p>
                        )}
                        {includeLabor && <p>👷 ค่าแรงงานยกสินค้า: ฿{LABOR_COST.toLocaleString()}</p>}
                      </div>
                    </div>
                  </div>
                ) : distance && loadingRates ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">⏳ กำลังโหลดข้อมูลอัตราค่าขนส่ง...</div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 px-4 mt-8">
        <p className="text-xs">MESPACE Self Storage | 36 ถนนกรุงเทพกรีฑา แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240 | โทร. 02-710-4088, 02-710-4090</p>
        <p className="text-[10px] mt-1 text-slate-500">บริการห้องเก็บของให้เช่ารายเดือน • เข้า-ออกได้ 24 ชม. • 11 สาขาทั่วกรุงเทพฯ พัทยา และภูเก็ต</p>
      </footer>

      {showPopup && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowPopup(false)}>
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 text-white text-2xl" onClick={() => setShowPopup(false)}>✕</button>
            <img src={popupImage} alt="truck" className="w-full h-auto rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
