import React, { useState, useRef, useEffect, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

interface PartnerDateRangePickerProps {
  checkInFrom: string;
  checkInTo: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

export default function PartnerDateRangePicker({ checkInFrom, checkInTo, onChange }: PartnerDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const parseDate = (dStr: string) => {
    if (!dStr) return null;
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0] ?? '', 10);
      const month = parseInt(parts[1] ?? '', 10);
      const day = parseInt(parts[2] ?? '', 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return { year, month, day };
      }
    }
    return null;
  };

  const toDateStr = (dateObj: { year: number, month: number, day: number } | null) => {
    if (!dateObj) return "";
    return `${dateObj.year}-${String(dateObj.month).padStart(2, '0')}-${String(dateObj.day).padStart(2, '0')}`;
  };

  const [checkInDate, setCheckInDate] = useState(parseDate(checkInFrom));
  const [checkOutDate, setCheckOutDate] = useState(parseDate(checkInTo));
  const [calendarTarget, setCalendarTarget] = useState<'checkIn' | 'checkOut'>('checkIn');
  
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    setCheckInDate(parseDate(checkInFrom));
    setCheckOutDate(parseDate(checkInTo));
  }, [checkInFrom, checkInTo, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node) &&
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const displayDate = useMemo(() => {
    if (!checkInFrom && !checkInTo) return "Tất cả ngày";
    const inDate = parseDate(checkInFrom);
    const outDate = parseDate(checkInTo);
    
    if (inDate && !outDate) return `Từ ${inDate.day}/${inDate.month}`;
    if (!inDate && outDate) return `Đến ${outDate.day}/${outDate.month}`;
    if (inDate && outDate) {
      if (inDate.month === outDate.month && inDate.year === outDate.year) {
        return `${inDate.day} - ${outDate.day} Th${inDate.month}`;
      }
      return `${inDate.day}/${inDate.month} - ${outDate.day}/${outDate.month}`;
    }
    return "Tất cả ngày";
  }, [checkInFrom, checkInTo]);

  const handleApply = () => {
    onChange(toDateStr(checkInDate), toDateStr(checkOutDate));
    setIsOpen(false);
  };

  const handleClear = () => {
    setCheckInDate(null);
    setCheckOutDate(null);
    onChange('', '');
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const month2 = calendarMonth === 12 ? 1 : calendarMonth + 1;
    const year2  = calendarMonth === 12 ? calendarYear + 1 : calendarYear;

    const handlePrevMonth = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (calendarMonth === 1) {
        setCalendarMonth(12);
        setCalendarYear(prev => prev - 1);
      } else {
        setCalendarMonth(prev => prev - 1);
      }
    };

    const handleNextMonth = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (calendarMonth === 12) {
        setCalendarMonth(1);
        setCalendarYear(prev => prev + 1);
      } else {
        setCalendarMonth(prev => prev + 1);
      }
    };

    const renderMonthGrid = (mon: number, yr: number) => {
      const daysInMonth = new Date(yr, mon, 0).getDate();
      const rawFirstDay = new Date(yr, mon - 1, 1).getDay();
      const firstDayIndex = (rawFirstDay + 6) % 7; // Monday first

      return (
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="text-center font-bold text-sm text-ink-deep py-0.5">
            Tháng {mon}, {yr}
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-muted">
            {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="py-1.5" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const thisDate  = new Date(yr, mon - 1, d);
              
              // Only disable if we wanted to prevent past dates, but for filtering we might want past dates!
              // Since it's a filter, users should be able to select past dates.
              
              const isCheckIn  = checkInDate?.day === d && checkInDate?.month === mon && checkInDate?.year === yr;
              const isCheckOut = checkOutDate?.day === d && checkOutDate?.month === mon && checkOutDate?.year === yr;
              const isToday   = currentDay === d && currentMonth === mon && currentYear === yr;

              let inBetween = false;
              if (checkInDate && checkOutDate) {
                const start = new Date(checkInDate.year, checkInDate.month - 1, checkInDate.day);
                const end   = new Date(checkOutDate.year, checkOutDate.month - 1, checkOutDate.day);
                if (thisDate > start && thisDate < end) inBetween = true;
                if (thisDate < start && thisDate > end) inBetween = true; // Handle reverse selection visually
              }

              const handleDayClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                
                if (calendarTarget === 'checkIn') {
                  if (checkOutDate) {
                    const selectedIn = new Date(yr, mon - 1, d);
                    const currentOut = new Date(checkOutDate.year, checkOutDate.month - 1, checkOutDate.day);
                    if (selectedIn >= currentOut) {
                      setCheckInDate({ day: d, month: mon, year: yr });
                      const nextD = new Date(selectedIn);
                      nextD.setDate(nextD.getDate() + 1);
                      setCheckOutDate({ day: nextD.getDate(), month: nextD.getMonth() + 1, year: nextD.getFullYear() });
                    } else {
                      setCheckInDate({ day: d, month: mon, year: yr });
                    }
                  } else {
                    setCheckInDate({ day: d, month: mon, year: yr });
                  }
                  setCalendarTarget('checkOut');
                } else {
                  if (checkInDate) {
                    const selectedOut = new Date(yr, mon - 1, d);
                    const currentIn = new Date(checkInDate.year, checkInDate.month - 1, checkInDate.day);
                    if (selectedOut <= currentIn) {
                      setCheckInDate({ day: d, month: mon, year: yr });
                      const nextD = new Date(selectedOut);
                      nextD.setDate(nextD.getDate() + 1);
                      setCheckOutDate({ day: nextD.getDate(), month: nextD.getMonth() + 1, year: nextD.getFullYear() });
                      setCalendarTarget('checkOut');
                      return;
                    }
                  }
                  setCheckOutDate({ day: d, month: mon, year: yr });
                  setCalendarTarget('checkIn');
                }
              };

              return (
                <button
                  key={d}
                  type="button"
                  onClick={handleDayClick}
                  className={`py-1.5 text-xs sm:text-sm font-bold rounded-md border transition-all ${
                    isCheckIn || isCheckOut
                      ? 'bg-primary text-white border-primary shadow-xs scale-105 cursor-pointer z-10'
                      : inBetween
                        ? 'bg-primary-50 text-primary border-transparent font-semibold cursor-pointer'
                        : isToday
                          ? 'border-2 border-primary text-primary hover:bg-primary-50 cursor-pointer'
                          : 'border-transparent text-ink hover:bg-canvas hover:border-border cursor-pointer'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-3 p-3 w-[600px] max-sm:w-full max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-1 bg-canvas rounded-lg">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCalendarTarget('checkIn'); }}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
              calendarTarget === 'checkIn'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase">Từ ngày</span>
            <span>{checkInDate ? `${checkInDate.day} Th${checkInDate.month}, ${checkInDate.year}` : 'Chọn ngày'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCalendarTarget('checkOut'); }}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
              calendarTarget === 'checkOut'
                ? 'bg-surface text-primary shadow-xs border border-border'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase">Đến ngày</span>
            <span>{checkOutDate ? `${checkOutDate.day} Th${checkOutDate.month}, ${checkOutDate.year}` : 'Chọn ngày'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between px-1 mt-1">
          <button type="button" onClick={handlePrevMonth}
            className="w-7 h-7 rounded-md border border-border hover:border-primary flex items-center justify-center text-muted hover:text-primary cursor-pointer transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-ink font-semibold">
            <span className="md:hidden">Tháng {calendarMonth}/{calendarYear}</span>
            <span className="hidden md:inline">Tháng {calendarMonth}/{calendarYear} – Tháng {month2}/{year2}</span>
          </span>
          <button type="button" onClick={handleNextMonth}
            className="w-7 h-7 rounded-md border border-border hover:border-primary flex items-center justify-center text-muted hover:text-primary cursor-pointer transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 md:divide-x md:divide-border pt-2 border-b border-border pb-3">
          {renderMonthGrid(calendarMonth, calendarYear)}
          <div className="hidden md:block md:pl-4">{renderMonthGrid(month2, year2)}</div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={handleClear} className="text-sm font-medium text-muted hover:text-danger cursor-pointer px-2 py-1 rounded-md transition-colors">
            Xóa bộ lọc
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-canvas transition-colors cursor-pointer text-ink">
              Hủy
            </button>
            <button type="button" onClick={handleApply} className="px-5 py-2 bg-primary text-white rounded-md text-sm font-bold shadow-xs hover:bg-primary-hover transition-colors cursor-pointer">
              Áp dụng
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-11 shrink-0 flex items-center justify-between gap-2 px-3 rounded-md border bg-white text-sm transition-all focus:outline-none cursor-pointer ${
          isOpen ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/50'
        }`}
      >
        <div className="flex items-center gap-2 text-ink">
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium whitespace-nowrap">{displayDate}</span>
        </div>
        {checkInFrom || checkInTo ? (
          <X 
            className="w-3.5 h-3.5 text-muted hover:text-danger cursor-pointer shrink-0 ml-2" 
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }} 
          />
        ) : null}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9997] bg-black/20 sm:hidden" onClick={() => setIsOpen(false)} />
          <div 
            ref={popoverRef}
            className="absolute z-[9998] top-full mt-2 right-0 max-sm:fixed max-sm:inset-x-4 max-sm:top-1/2 max-sm:-translate-y-1/2 max-sm:mt-0 bg-surface border border-border shadow-[var(--shadow-card)] rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right max-sm:origin-center"
          >
            {renderCalendar()}
          </div>
        </>
      )}
    </div>
  );
}
