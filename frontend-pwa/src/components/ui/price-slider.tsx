import React, { useState, useEffect, useRef } from 'react';

interface PriceSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  onChangeEnd: (value: [number, number]) => void;
}

export function PriceSlider({ min, max, step, value, onChange, onChangeEnd }: PriceSliderProps) {
  const [minVal, setMinVal] = useState(value[0]);
  const [maxVal, setMaxVal] = useState(value[1]);
  
  // Local input string states for typing
  const [minInputStr, setMinInputStr] = useState(value[0].toLocaleString('vi-VN'));
  const [maxInputStr, setMaxInputStr] = useState(value[1].toLocaleString('vi-VN'));

  const trackRef = useRef<HTMLDivElement>(null);
  
  // Drag state
  const dragRef = useRef<{
    type: 'min' | 'max' | null;
    startX: number;
    startMin: number;
    startMax: number;
    trackWidth: number;
  }>({
    type: null,
    startX: 0,
    startMin: value[0],
    startMax: value[1],
    trackWidth: 1,
  });

  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);

  useEffect(() => {
    setMinVal(value[0]);
    setMaxVal(value[1]);
    setMinInputStr(value[0].toLocaleString('vi-VN'));
    setMaxInputStr(value[1].toLocaleString('vi-VN'));
  }, [value]);

  const minPercent = Math.max(0, Math.min(100, ((minVal - min) / (max - min)) * 100));
  const maxPercent = Math.max(0, Math.min(100, ((maxVal - min) / (max - min)) * 100));

  const handlePointerDown = (type: 'min' | 'max', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    
    dragRef.current = {
      type,
      startX: e.clientX,
      startMin: minVal,
      startMax: maxVal,
      trackWidth: rect.width || 1,
    };
    
    setActiveThumb(type);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.type) return;

    const { type, startX, startMin, startMax, trackWidth } = dragRef.current;
    const deltaX = e.clientX - startX;
    const deltaRatio = deltaX / trackWidth;
    const rawDeltaPrice = deltaRatio * (max - min);
    const stepDeltaPrice = Math.round(rawDeltaPrice / step) * step;

    if (type === 'min') {
      const newMin = Math.max(min, Math.min(startMax - step, startMin + stepDeltaPrice));
      setMinVal(newMin);
      setMinInputStr(newMin.toLocaleString('vi-VN'));
      onChange([newMin, maxVal]);
    } else if (type === 'max') {
      const newMax = Math.min(max, Math.max(startMin + step, startMax + stepDeltaPrice));
      setMaxVal(newMax);
      setMaxInputStr(newMax.toLocaleString('vi-VN'));
      onChange([minVal, newMax]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.type) return;
    
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if capture wasn't held
    }

    dragRef.current.type = null;
    setActiveThumb(null);
    onChangeEnd([minVal, maxVal]);
  };

  // Input editing handlers
  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const rawNumbers = e.target.value.replace(/\D/g, '');
    if (!rawNumbers) {
      setMinInputStr('');
      return;
    }
    const num = parseInt(rawNumbers, 10);
    setMinInputStr(num.toLocaleString('vi-VN'));
  };

  const handleMinInputBlur = () => {
    const rawNumbers = minInputStr.replace(/\D/g, '');
    let num = rawNumbers ? parseInt(rawNumbers, 10) : min;
    // Bound between min and maxVal - step
    num = Math.max(min, Math.min(maxVal - step, num));
    // Round to step
    num = Math.round(num / step) * step;

    setMinVal(num);
    setMinInputStr(num.toLocaleString('vi-VN'));
    onChange([num, maxVal]);
    onChangeEnd([num, maxVal]);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawNumbers = e.target.value.replace(/\D/g, '');
    if (!rawNumbers) {
      setMaxInputStr('');
      return;
    }
    const num = parseInt(rawNumbers, 10);
    setMaxInputStr(num.toLocaleString('vi-VN'));
  };

  const handleMaxInputBlur = () => {
    const rawNumbers = maxInputStr.replace(/\D/g, '');
    let num = rawNumbers ? parseInt(rawNumbers, 10) : max;
    // Bound between minVal + step and max
    num = Math.min(max, Math.max(minVal + step, num));
    // Round to step
    num = Math.round(num / step) * step;

    setMaxVal(num);
    setMaxInputStr(num.toLocaleString('vi-VN'));
    onChange([minVal, num]);
    onChangeEnd([minVal, num]);
  };

  // Quick preset ranges
  const applyPreset = (presetMin: number, presetMax: number) => {
    setMinVal(presetMin);
    setMaxVal(presetMax);
    setMinInputStr(presetMin.toLocaleString('vi-VN'));
    setMaxInputStr(presetMax.toLocaleString('vi-VN'));
    onChange([presetMin, presetMax]);
    onChangeEnd([presetMin, presetMax]);
  };

  return (
    <div className="flex flex-col w-full select-none pt-1">
      {/* Main Track Container */}
      <div 
        ref={trackRef}
        className="relative w-full h-8 flex items-center cursor-pointer touch-none"
      >
        {/* Background Track */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          {/* Active Range Highlight */}
          <div
            className="h-full bg-gradient-to-r from-[var(--color-primary,#0a7d64)] to-[var(--color-secondary,#06b6d4)] transition-none"
            style={{
              marginLeft: `${minPercent}%`,
              width: `${Math.max(0, maxPercent - minPercent)}%`,
            }}
          />
        </div>

        {/* 1. Left Circle (Min Handle) */}
        <div
          role="slider"
          aria-label="Giá tối thiểu"
          aria-valuenow={minVal}
          tabIndex={0}
          onPointerDown={(e) => handlePointerDown('min', e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-[var(--color-primary,#0a7d64)] shadow-md flex items-center justify-center cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-20 ${
            activeThumb === 'min' ? 'ring-4 ring-[var(--color-primary-100,#d1f6ec)] scale-115' : ''
          }`}
          style={{ left: `${minPercent}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-[var(--color-primary,#0a7d64)]" />
        </div>

        {/* 2. Right Circle (Max Handle) */}
        <div
          role="slider"
          aria-label="Giá tối đa"
          aria-valuenow={maxVal}
          tabIndex={0}
          onPointerDown={(e) => handlePointerDown('max', e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-[var(--color-primary,#0a7d64)] shadow-md flex items-center justify-center cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-20 ${
            activeThumb === 'max' ? 'ring-4 ring-[var(--color-primary-100,#d1f6ec)] scale-115' : ''
          }`}
          style={{ left: `${maxPercent}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-[var(--color-primary,#0a7d64)]" />
        </div>
      </div>

      {/* Range Caption / Helper Text */}
      <div className="flex justify-between items-center text-[11px] text-[var(--color-muted,#59766e)] mt-1 px-1">
        <span>Kéo 2 nút ở 2 đầu để chỉnh khoảng giá</span>
        <span className="font-semibold text-[var(--color-primary,#0a7d64)]">
          {minVal.toLocaleString('vi-VN')}đ – {maxVal.toLocaleString('vi-VN')}đ
        </span>
      </div>

      {/* 2 Editable Input Boxes: Tối thiểu & Tối đa */}
      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        {/* Min Input Box */}
        <div className="bg-gray-50/90 border border-gray-200 rounded-md p-2 transition-all focus-within:border-[var(--color-primary,#0a7d64)] focus-within:bg-white focus-within:ring-1 focus-within:ring-[var(--color-primary,#0a7d64)]">
          <label 
            htmlFor="price-filter-min-input"
            className="block text-[11px] font-semibold text-[var(--color-muted,#59766e)] uppercase tracking-wider mb-0.5"
          >
            Tối thiểu
          </label>
          <div className="flex items-center gap-1">
            <input
              id="price-filter-min-input"
              type="text"
              inputMode="numeric"
              value={minInputStr}
              onChange={handleMinInputChange}
              onBlur={handleMinInputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleMinInputBlur();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full bg-transparent text-sm font-bold text-[var(--color-ink-deep,#0a2e26)] focus:outline-none"
              placeholder="200.000"
            />
            <span className="text-xs font-semibold text-gray-400 select-none">đ</span>
          </div>
        </div>

        {/* Max Input Box */}
        <div className="bg-gray-50/90 border border-gray-200 rounded-md p-2 transition-all focus-within:border-[var(--color-primary,#0a7d64)] focus-within:bg-white focus-within:ring-1 focus-within:ring-[var(--color-primary,#0a7d64)]">
          <label 
            htmlFor="price-filter-max-input"
            className="block text-[11px] font-semibold text-[var(--color-muted,#59766e)] uppercase tracking-wider mb-0.5"
          >
            Tối đa
          </label>
          <div className="flex items-center gap-1">
            <input
              id="price-filter-max-input"
              type="text"
              inputMode="numeric"
              value={maxInputStr}
              onChange={handleMaxInputChange}
              onBlur={handleMaxInputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleMaxInputBlur();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full bg-transparent text-sm font-bold text-[var(--color-ink-deep,#0a2e26)] focus:outline-none"
              placeholder="4.000.000"
            />
            <span className="text-xs font-semibold text-gray-400 select-none">đ</span>
          </div>
        </div>
      </div>

      {/* Quick Budget Presets */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {[
          { label: '< 500k', minP: 200000, maxP: 500000 },
          { label: '500k - 1tr', minP: 500000, maxP: 1000000 },
          { label: '1tr - 2tr', minP: 1000000, maxP: 2000000 },
          { label: 'Tất cả', minP: min, maxP: max },
        ].map((preset) => {
          const isSelected = minVal === preset.minP && maxVal === preset.maxP;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.minP, preset.maxP)}
              className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${
                isSelected
                  ? 'bg-[var(--color-primary-50,#edfbf7)] text-[var(--color-primary,#0a7d64)] border-[var(--color-primary,#0a7d64)] font-semibold shadow-2xs'
                  : 'bg-white text-[var(--color-ink,#1f2937)] border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
