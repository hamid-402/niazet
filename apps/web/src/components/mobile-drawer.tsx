'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function MobileDrawer({
  open,
  onClose,
  title,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  id: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-overlay md:hidden">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-overlay"
        aria-label="بستن منو"
        onClick={onClose}
      />
      <aside
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="absolute inset-y-0 right-0 z-modal flex w-[min(20rem,88vw)] flex-col overflow-y-auto border-l border-border bg-surface p-5 shadow-elevation-4"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="font-extrabold text-fg">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            className="rounded-control p-2 text-fg-muted hover:bg-bg-subtle"
          >
            <svg viewBox="0 0 20 20" fill="none" className="icon-md" aria-hidden="true">
              <path stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
