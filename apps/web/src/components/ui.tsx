'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-5 shadow-elevation-1 transition-colors ${className}`}
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
  danger: 'bg-danger text-fg-on-accent hover:opacity-90',
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
      className="rounded-control border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger"
    >
      {message}
    </div>
  );
}

export function SectionTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-heading-lg font-bold leading-heading text-fg">
        {children}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'control-density w-full rounded-control border border-form-border bg-surface text-body-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent';
