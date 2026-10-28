'use client';

import Link from 'next/link';
import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Button, inputClass } from '@/components/ui';
import { formatNumber } from '@/lib/format';

export function Breadcrumbs({ items }: { items: ReadonlyArray<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="مسیر صفحه" className="mb-3 text-xs text-fg-subtle">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <Link href={item.href} className="hover:text-fg hover:underline">{item.label}</Link> : <span aria-current="page" className="font-medium text-fg-muted">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ListToolbar({ children }: { children: ReactNode }) {
  return <div role="search" className="mb-4 grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-3">{children}</div>;
}

export function SearchField({ value, onChange, label = 'جست‌وجو', placeholder = 'جست‌وجو...' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  return (
    <label className="text-xs font-medium text-fg-muted">
      {label}
      <input type="search" className={`${inputClass} mt-1`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" />
    </label>
  );
}

export function FilterSelect({ label, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <label className="text-xs font-medium text-fg-muted">
      {label}
      <select className={`${inputClass} mt-1`} {...props}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function SortSelect(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { options: ReadonlyArray<{ value: string; label: string }> }) {
  return <FilterSelect label="مرتب‌سازی" {...props} />;
}

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="صفحه‌بندی" className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>صفحه قبل</Button>
      <span aria-live="polite" className="text-sm text-fg-muted">صفحه {formatNumber(page)} از {formatNumber(totalPages)}</span>
      <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>صفحه بعد</Button>
    </nav>
  );
}

function closeActionMenu(details: HTMLDetailsElement | null, popup: HTMLDivElement | null) {
  if (details) details.open = false;
  if (popup?.hasAttribute('popover') && popup.matches(':popover-open')) popup.hidePopover();
}

export function ActionMenu({ label = 'اقدامات', children }: { label?: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    const popup = popupRef.current;
    if (!details || !popup) return;
    const summary = details.querySelector('summary');
    const supportsPopover = typeof popup.showPopover === 'function';
    let frame = 0;

    function positionPopup() {
      if (!supportsPopover || !details?.open || !summary || !popup) return;
      const anchor = summary.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (anchor.bottom < 0 || anchor.top > height) {
        closeActionMenu(details, popup);
        return;
      }
      Object.assign(popup.style, {
        position: 'fixed', inset: 'auto', margin: '0',
        maxWidth: `${Math.max(0, width - 16)}px`, maxHeight: `${Math.max(0, height - 16)}px`, overflowY: 'auto',
      });
      const size = popup.getBoundingClientRect();
      const below = height - anchor.bottom - 8;
      const above = anchor.top - 8;
      const top = size.height <= below || below >= above
        ? anchor.bottom + 4 : anchor.top - size.height - 4;
      popup.style.left = `${Math.max(8, Math.min(anchor.right - size.width, width - size.width - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(top, height - size.height - 8))}px`;
    }

    function syncPopup() {
      if (!supportsPopover || !details || !popup) return;
      if (details.open) {
        if (!popup.matches(':popover-open')) popup.showPopover();
        positionPopup();
      } else if (popup.matches(':popover-open')) popup.hidePopover();
    }

    function schedulePosition() {
      if (!details?.open || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; positionPopup(); });
    }

    // Progressive enhancement: without JavaScript/Popover support this remains
    // native details/summary. Top-layer rendering escapes table/card clipping.
    if (supportsPopover) popup.setAttribute('popover', 'manual');
    details.addEventListener('toggle', syncPopup);
    function closeOutside(event: PointerEvent) {
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        // Do not steal focus from the control the user is clicking.
        closeActionMenu(details, popup);
      }
    }
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    syncPopup();
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('scroll', schedulePosition, true);
      window.removeEventListener('resize', schedulePosition);
      details.removeEventListener('toggle', syncPopup);
      if (frame) cancelAnimationFrame(frame);
      if (supportsPopover) {
        if (popup.matches(':popover-open')) popup.hidePopover();
        popup.removeAttribute('popover');
        popup.removeAttribute('style');
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    const details = event.currentTarget;
    if (event.key !== 'Escape' || !details.open) return;
    event.preventDefault();
    event.stopPropagation();
    closeActionMenu(details, popupRef.current);
    details.querySelector('summary')?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDetailsElement>) {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
      closeActionMenu(event.currentTarget, popupRef.current);
    }
  }

  return (
    <details ref={detailsRef} data-action-menu className="group relative inline-block" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <summary className="control-density cursor-pointer list-none rounded-control border border-border bg-bg-subtle px-3 text-xs font-bold text-fg marker:hidden hover:border-border-strong">{label}</summary>
      <div ref={popupRef} data-action-menu-popup className="absolute left-0 z-dropdown mt-1 min-w-40 rounded-card border border-border bg-surface-raised p-1.5 text-sm shadow-elevation-3">
        {children}
      </div>
    </details>
  );
}

export const actionMenuItemClass = 'block w-full rounded-control px-3 py-2 text-right text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg';
