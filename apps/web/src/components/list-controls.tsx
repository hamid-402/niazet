'use client';

import Link from 'next/link';
import type { ReactNode, SelectHTMLAttributes } from 'react';
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

export function ActionMenu({ label = 'اقدامات', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group relative inline-block">
      <summary className="control-density cursor-pointer list-none rounded-control border border-border bg-bg-subtle px-3 text-xs font-bold text-fg marker:hidden hover:border-border-strong">{label}</summary>
      <div className="absolute left-0 z-dropdown mt-1 min-w-40 rounded-card border border-border bg-surface-raised p-1.5 text-sm shadow-elevation-3">
        {children}
      </div>
    </details>
  );
}

export const actionMenuItemClass = 'block w-full rounded-control px-3 py-2 text-right text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg';
