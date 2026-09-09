'use client';

import { useTheme } from './theme-provider';
import { Moon, Sun } from 'lucide-react';

export function ThemeSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const { theme, setTheme, themes } = useTheme();
  const isDark = theme === 'simple-dark';
  const nextTheme = isDark ? 'simple-light' : 'simple-dark';
  const activeMeta = themes.find((item) => item.id === theme) ?? themes[0];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-theme-toggle
        aria-label="حالت تیره"
        aria-pressed={isDark}
        title={isDark ? 'فعال‌کردن تم روشن' : 'فعال‌کردن تم تیره'}
        onClick={() => setTheme(nextTheme)}
        className={`inline-flex items-center gap-2 rounded-control border border-border bg-surface text-fg-muted transition-colors hover:border-border-strong hover:text-fg ${variant === 'compact' ? 'h-9 w-9 justify-center' : 'h-9 px-3 text-sm font-medium'}`}
      >
        {isDark ? <Sun className="icon-sm" aria-hidden="true" /> : <Moon className="icon-sm" aria-hidden="true" />}
        {variant === 'default' && <span>{activeMeta.label}</span>}
      </button>
    </div>
  );
}
