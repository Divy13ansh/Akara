import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight
} from 'lucide-react';
import { 
  activityCalendarService, 
  CalendarDay, 
  getSystemNow,
  SmileyType 
} from '../services/activityCalendarService';
import { UserProfile } from '../services/api';

/**
 * 1. Broad Smile Face (> 1 hr active study)
 * Extracted from image.png: Golden yellow, open happy smile, warm peach blush cheeks
 */
export function BroadSmileFace({ size = 38 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 44 44" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-200 hover:scale-110 select-none pointer-events-none drop-shadow-2xs"
    >
      {/* Face Body */}
      <circle cx="22" cy="22" r="20" fill="#F8D668" />
      {/* Rosy Cheeks */}
      <ellipse cx="11" cy="23" rx="3.5" ry="2.2" fill="#EDB54B" />
      <ellipse cx="33" cy="23" rx="3.5" ry="2.2" fill="#EDB54B" />
      {/* Dark Eyes */}
      <circle cx="15.5" cy="18" r="2.1" fill="#1C1C1C" />
      <circle cx="28.5" cy="18" r="2.1" fill="#1C1C1C" />
      {/* Broad Open Smile */}
      <path 
        d="M 16 23 C 16 30 28 30 28 23 Z" 
        fill="#1C1C1C" 
      />
    </svg>
  );
}

/**
 * 2. Normal Smile Face (1 - 59 mins active study)
 * Extracted from image.png: Light spring green, gentle curved smile, soft blush cheeks
 */
export function NormalSmileFace({ size = 38 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 44 44" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-200 hover:scale-110 select-none pointer-events-none drop-shadow-2xs"
    >
      {/* Face Body */}
      <circle cx="22" cy="22" r="20" fill="#A8D98C" />
      {/* Rosy Cheeks */}
      <ellipse cx="11" cy="22.5" rx="3.5" ry="2.2" fill="#8FC971" />
      <ellipse cx="33" cy="22.5" rx="3.5" ry="2.2" fill="#8FC971" />
      {/* Dark Eyes */}
      <circle cx="15.5" cy="18" r="2.1" fill="#1C1C1C" />
      <circle cx="28.5" cy="18" r="2.1" fill="#1C1C1C" />
      {/* Gentle Curved Smile */}
      <path 
        d="M 17 23 Q 22 28 27 23" 
        stroke="#1C1C1C" 
        strokeWidth="2.4" 
        strokeLinecap="round" 
        fill="none" 
      />
    </svg>
  );
}

/**
 * 3. Sad / Inactive Face (0 mins - did not open the application)
 * Extracted from image.png: Muted forest/sage green, neutral/flat line mouth, deadpan look
 */
export function SadInactiveFace({ size = 38 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 44 44" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-200 hover:scale-110 select-none pointer-events-none drop-shadow-2xs"
    >
      {/* Face Body */}
      <circle cx="22" cy="22" r="20" fill="#52A974" />
      {/* Darker Green Cheeks */}
      <ellipse cx="11" cy="23" rx="3.5" ry="2.2" fill="#429361" />
      <ellipse cx="33" cy="23" rx="3.5" ry="2.2" fill="#429361" />
      {/* Dark Eyes */}
      <circle cx="15.5" cy="18.5" r="2.1" fill="#1C1C1C" />
      <circle cx="28.5" cy="18.5" r="2.1" fill="#1C1C1C" />
      {/* Flat/Neutral Line Mouth */}
      <line 
        x1="18" 
        y1="23.5" 
        x2="26" 
        y2="23.5" 
        stroke="#1C1C1C" 
        strokeWidth="2.4" 
        strokeLinecap="round" 
      />
    </svg>
  );
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ActivityHabitCalendarProps {
  user: UserProfile | null;
}

export function ActivityHabitCalendar({ user }: ActivityHabitCalendarProps) {
  const systemNow = getSystemNow();
  const [currentYear, setCurrentYear] = useState<number>(systemNow.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(systemNow.getMonth());

  // Build the calendar month model
  const calendarData = activityCalendarService.buildMonthGrid(currentYear, currentMonth, user);

  const handlePrevMonth = () => {
    if (!calendarData.canGoPrev) return;
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!calendarData.canGoNext) return;
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  return (
    <div className="bg-[#FAF8F5] rounded-3xl sm:rounded-[32px] border border-stone-200/90 p-5 sm:p-7 shadow-[0_4px_24px_rgb(0,0,0,0.03)] flex flex-col max-w-lg mx-auto lg:mx-0 w-full">
      {/* 1. TOP HEADER - Clean Month Navigator */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-200/70">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={!calendarData.canGoPrev}
          aria-label="Previous month"
          className={`p-2 rounded-xl transition-colors ${
            calendarData.canGoPrev
              ? 'text-stone-700 hover:bg-white hover:text-stone-900 cursor-pointer shadow-2xs'
              : 'text-stone-300 cursor-not-allowed'
          }`}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="font-bold text-stone-900 text-base sm:text-lg tracking-tight select-none">
          <span>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          disabled={!calendarData.canGoNext}
          aria-label="Next month"
          className={`p-2 rounded-xl transition-colors ${
            calendarData.canGoNext
              ? 'text-stone-700 hover:bg-white hover:text-stone-900 cursor-pointer shadow-2xs'
              : 'text-stone-300 cursor-not-allowed'
          }`}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 2. WEEKDAYS HEADER (Sun Mon Tue Wed Thu Fri Sat) */}
      <div className="grid grid-cols-7 gap-1 text-center py-3 text-xs sm:text-sm font-semibold text-stone-500 select-none">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* 3. CALENDAR DAYS GRID (Matching image.png layout) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {calendarData.days.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="h-14 sm:h-16" />;
          }

          // Case A: Uncovered dates (before join date or future dates)
          if (!day.isCovered) {
            return (
              <div
                key={day.dateStr}
                className="h-14 sm:h-16 flex flex-col items-center justify-start pt-1.5 text-stone-400 select-none"
              >
                <span className="text-xs sm:text-sm font-medium opacity-70">
                  {day.date}
                </span>
              </div>
            );
          }

          // Case B: Covered dates (from join date up to today)
          return (
            <div
              key={day.dateStr}
              className="relative h-14 sm:h-16 flex flex-col items-center justify-between py-1 select-none"
            >
              {/* Top: Date Number */}
              <div className="flex items-center justify-center">
                {day.isToday ? (
                  <span className="w-5 h-5 rounded-full bg-[#52A974] text-white text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-xs">
                    {day.date}
                  </span>
                ) : (
                  <span className="text-xs sm:text-sm font-semibold text-stone-700">
                    {day.date}
                  </span>
                )}
              </div>

              {/* Bottom: Extracted Smiley Face Shape */}
              <div className="flex items-center justify-center">
                {day.smileyType === 'broad' && <BroadSmileFace size={34} />}
                {day.smileyType === 'normal' && <NormalSmileFace size={34} />}
                {day.smileyType === 'sad' && <SadInactiveFace size={34} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
