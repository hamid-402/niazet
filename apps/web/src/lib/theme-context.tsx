'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'niazat_theme';

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  // یک اسکریپت inline در layout قبل از هیدریت، کلاس dark را روی <html> تنظیم می‌کند
  // (برای جلوگیری از پرش رنگ)؛ اینجا فقط همان مقدار را می‌خوانیم.
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme باید داخل ThemeProvider استفاده شود.');
  return ctx;
}

/** برای جلوگیری از پرش رنگ (FOUC) پیش از هیدریت شدن React، در layout به‌صورت inline اجرا می‌شود. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
