'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from './theme-provider';

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M10 2.5v1.6M10 15.9v1.6M17.5 10h-1.6M4.1 10H2.5M15.1 4.9l-1.1 1.1M6 14l-1.1 1.1M15.1 15.1 14 14M6 6 4.9 4.9"
      />
    </svg>
  );
}

export function ThemeSwitcher({
  variant = 'default',
}: {
  variant?: 'default' | 'compact';
}) {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const activeMeta = themes.find((t) => t.id === theme) ?? themes[0];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`انتخاب پوسته؛ پوسته فعلی: ${activeMeta.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-control border border-border bg-surface text-fg-muted transition-colors hover:border-border-strong hover:text-fg ${
          variant === 'compact'
            ? 'h-9 w-9 justify-center'
            : 'h-9 px-3 text-sm font-medium'
        }`}
      >
        <SunIcon />
        {variant === 'default' && <span>{activeMeta.label}</span>}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-dropdown mt-2 w-56 origin-top-left rounded-card border border-border bg-surface-raised p-1.5 shadow-elevation-3"
        >
          {themes.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={t.id === theme}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start gap-0.5 rounded-[calc(var(--radius-card)-0.375rem)] px-3 py-2 text-right transition-colors ${
                  t.id === theme
                    ? 'bg-accent-subtle text-accent'
                    : 'text-fg hover:bg-bg-subtle'
                }`}
              >
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-xs text-fg-subtle">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
