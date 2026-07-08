'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="تغییر حالت روشن/تیره"
      suppressHydrationWarning
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/70 transition hover:border-accent hover:text-accent"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
