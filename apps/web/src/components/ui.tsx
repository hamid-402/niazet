'use client';

import Link from 'next/link';
import { useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode, type TableHTMLAttributes } from 'react';

export function TabList({ items, value, onChange, label, idPrefix, variant = 'underline' }: { items: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (value: string) => void; label: string; idPrefix: string; variant?: 'underline' | 'pill' }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = document.documentElement.dir === 'rtl';
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + items.length) % items.length;
    else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + items.length) % items.length;
    else return;
    event.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  }
  return <div role="tablist" aria-label={label} className={`mb-4 flex gap-1 overflow-x-auto ${variant === 'pill' ? 'rounded-card border border-border bg-surface p-2' : 'border-b border-border'}`}>
    {items.map((item, index) => {
      const active = item.value === value;
      return <button key={item.value} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" id={`${idPrefix}-tab-${item.value}`} aria-controls={`${idPrefix}-panel-${item.value}`} aria-selected={active} tabIndex={active ? 0 : -1} onKeyDown={(event) => navigate(event, index)} onClick={() => onChange(item.value)} className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-bold transition-colors ${variant === 'pill' ? `rounded-control ${active ? 'bg-accent text-fg-on-accent' : 'text-fg-muted hover:bg-bg-subtle hover:text-fg'}` : `border-b-2 ${active ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-fg'}`}`}>{item.label}</button>;
    })}
  </div>;
}

export function ResponsiveTable({ children, className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const labels = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.children].forEach((cell, index) => {
        if (cell instanceof HTMLTableCellElement) cell.dataset.label = labels[index] ?? '';
      });
    }
  }, [children]);
  return <table ref={tableRef} className={`responsive-table ${className}`} {...props}>{children}</table>;
}

export function Card({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-5 shadow-elevation-1 transition-colors ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

const BUTTON_BASE =
  'control-density inline-flex items-center justify-center gap-2 rounded-control text-body-sm font-bold transition-colors duration-150';

const BUTTON_VARIANTS: Record<string, string> = {
  primary:
    'bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active shadow-elevation-1',
  secondary:
    'bg-bg-subtle text-fg border border-border hover:border-border-strong hover:bg-surface-sunken',
  danger: 'bg-danger text-fg-on-danger hover:opacity-90',
  ghost: 'text-fg-muted hover:bg-bg-subtle hover:text-fg',
};

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

const BADGE_COLORS: Record<string, string> = {
  gray: 'bg-bg-subtle text-fg-muted border border-border',
  blue: 'bg-info-subtle text-info border border-info-border',
  yellow: 'bg-warning-subtle text-warning border border-warning-border',
  green: 'bg-success-subtle text-success border border-success-border',
  red: 'bg-danger-subtle text-danger border border-danger-border',
  purple: 'bg-purple-subtle text-purple border border-purple-border',
};

export function Badge({
  children,
  color = 'gray',
}: {
  children: ReactNode;
  color?: keyof typeof BADGE_COLORS;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium ${BADGE_COLORS[color]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong bg-bg-subtle px-6 py-14 text-center">
      <p className="text-base font-medium text-fg">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className={`h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-accent ${className}`}
    />
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-control border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger"
    >
      {message}
    </div>
  );
}

export function SectionTitle({
  children,
  subtitle,
  as: Heading = 'h1',
}: {
  children: ReactNode;
  subtitle?: string;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="mb-4">
      <Heading className="text-heading-lg font-bold leading-heading text-fg">
        {children}
      </Heading>
      {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {error && (
        <span role="alert" aria-live="polite" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'control-density w-full rounded-control border border-form-border bg-surface text-body-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent';
