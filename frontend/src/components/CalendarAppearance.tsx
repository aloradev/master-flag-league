import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { calendarTheme } from '../lib/calendarTheme';

const CalendarContext = createContext<ReturnType<typeof calendarTheme>>('invierno');

export function CalendarAppearance({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<ReturnType<typeof calendarTheme>>(calendarTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.calendarTheme = season;
    return () => { delete document.documentElement.dataset.calendarTheme; };
  }, [season]);
  useEffect(() => {
    const refresh = () => setSeason(calendarTheme());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return <CalendarContext.Provider value={season}>{children}</CalendarContext.Provider>;
}

export const useCalendarAppearance = () => useContext(CalendarContext);
