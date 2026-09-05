'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, inputClass } from '@/components/ui';

type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  impacts?: string[];
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  noteLabel?: string;
  notePlaceholder?: string;
  requireNote?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
};

export function ConfirmationModal({
  open,
  title,
  description,
  impacts = [],
  confirmLabel,
  tone = 'danger',
  noteLabel = 'یادداشت تصمیم',
  notePlaceholder = 'علت و مستند این اقدام را بنویسید',
  requireNote = true,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => noteRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onCancel();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
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
  }, [open, onCancel, submitting]);

  if (!open) return null;
  const noteValid = !requireNote || note.trim().length >= 3;

  async function confirm() {
    if (!noteValid || submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm(note.trim());
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-overlay p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onCancel(); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" className="w-full max-w-lg rounded-modal border border-border bg-surface p-5 shadow-elevation-4">
        <h2 id="confirmation-title" className="text-lg font-extrabold text-fg">{title}</h2>
        <p id="confirmation-description" className="mt-2 text-sm leading-7 text-fg-muted">{description}</p>
        {impacts.length > 0 && <div className="mt-4 rounded-control border border-warning-border bg-warning-subtle p-3"><p className="text-sm font-bold text-warning">اثر این اقدام</p><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-fg-muted">{impacts.map((impact) => <li key={impact}>{impact}</li>)}</ul></div>}
        <label className="mt-4 block text-sm font-medium text-fg-muted">{noteLabel}{requireNote && <span className="text-danger"> *</span>}<textarea ref={noteRef} className={`${inputClass} mt-1 min-h-24`} value={note} onChange={(event) => setNote(event.target.value)} placeholder={notePlaceholder} disabled={submitting} /></label>
        {requireNote && note.length > 0 && !noteValid && <p className="mt-1 text-xs text-danger">یادداشت باید حداقل ۳ نویسه باشد.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onCancel}>انصراف</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={!noteValid || submitting} onClick={() => void confirm()}>{submitting ? 'در حال ثبت...' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
