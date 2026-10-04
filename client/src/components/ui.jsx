import { forwardRef, useEffect } from 'react';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

const BUTTON = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};
const SIZE = { sm: 'px-2.5 py-1.5 text-sm', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-3 text-base' };

export function Button({ variant = 'primary', size = 'md', className, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        SIZE[size],
        BUTTON[variant],
        className
      )}
      {...props}
    />
  );
}

const FIELD = 'w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100';

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cx(FIELD, invalid ? 'border-red-400' : 'border-slate-300', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(FIELD, invalid ? 'border-red-400' : 'border-slate-300', className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, error, hint, className, children }) {
  return (
    <label className={cx('block text-sm', className)}>
      {label && <span className="mb-1 block font-medium text-slate-700">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Card({ className, children }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
}

const BADGE = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-indigo-100 text-indigo-700',
};
export const Badge = ({ color = 'gray', children }) => (
  <span className={cx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', BADGE[color])}>{children}</span>
);

export const Spinner = ({ className }) => (
  <span className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600', className)} />
);

export const FullPageSpinner = () => (
  <div className="flex h-screen items-center justify-center">
    <Spinner className="h-8 w-8" />
  </div>
);

const ALERT = {
  info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};
export const Alert = ({ type = 'info', className, children }) => (
  <div role="alert" className={cx('rounded-md border px-3 py-2 text-sm', ALERT[type], className)}>
    {children}
  </div>
);

export const EmptyState = ({ title, hint }) => (
  <div className="px-4 py-10 text-center">
    <p className="font-medium text-slate-600">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
  </div>
);

export function Modal({ title, onClose, wide, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={cx('mt-8 w-full rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 text-slate-500 hover:bg-slate-100">
              ✕
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-slate-600">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}