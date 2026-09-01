'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTheme } from './theme-provider';

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="icon-sm" aria-hidden="true">
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `theme-options-${useId().replaceAll(':', '')}`;

  function focusOption(index: number) {
    const safeIndex = (index + themes.length) % themes.length;
    optionRefs.current[safeIndex]?.focus();
  }

  function openAndFocus(index: number) {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  }

  function closeAndRestore() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const activeIndex = Math.max(0, themes.findIndex((item) => item.id === theme));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAndFocus(activeIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAndFocus(themes.length - 1);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = themes.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRestore();
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    focusOption(nextIndex);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const activeMeta = themes.find((t) => t.id === theme) ?? themes[0];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`انتخاب پوسته؛ پوسته فعلی: ${activeMeta.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        title={`پوسته فعلی: ${activeMeta.label}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
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
          id={listboxId}
          role="listbox"
          aria-label="پوسته‌های قابل انتخاب"
          className="absolute left-0 z-dropdown mt-2 w-56 origin-top-left rounded-card border border-border bg-surface-raised p-1.5 shadow-elevation-3"
        >
          {themes.map((t, index) => (
            <li key={t.id}>
              <button
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={t.id === theme}
                tabIndex={t.id === theme ? 0 : -1}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => {
                  setTheme(t.id);
                  closeAndRestore();
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
