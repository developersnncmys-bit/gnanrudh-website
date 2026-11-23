'use client';

import { useEffect } from 'react';
import { useScrollLock } from '@/lib/scroll-lock';

// Small branded confirm modal. Centered card with a title, a body line,
// and Cancel / Confirm buttons. Esc and backdrop-click dismiss. Intended
// for low-stakes confirmations like sign-out; heavier flows (checkout,
// address picker) have their own full modals.

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      data-lenis-prevent
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm bg-bone shadow-2xl p-6">
        <h2 id="confirm-title" className="text-lg font-bold text-ink">
          {title}
        </h2>
        {message && (
          <p className="mt-2 text-sm text-ink/70 leading-relaxed">{message}</p>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-ink border border-ink/20 hover:border-ink transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={
              danger
                ? 'px-4 py-2 text-sm font-semibold text-ivory bg-maroon-deep hover:bg-maroon transition-colors'
                : 'px-4 py-2 text-sm font-semibold text-ivory bg-ink hover:bg-maroon-deep transition-colors'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
