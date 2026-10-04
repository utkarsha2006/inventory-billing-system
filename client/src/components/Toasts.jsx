import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissToast } from '../features/ui/uiSlice.js';
import { cx } from './ui.jsx';

const COLORS = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800' };

function Toast({ toast }) {
  const dispatch = useDispatch();
  useEffect(() => {
    const t = setTimeout(() => dispatch(dismissToast(toast.id)), 4500);
    return () => clearTimeout(t);
  }, [dispatch, toast.id]);

  return (
    <button
      type="button"
      onClick={() => dispatch(dismissToast(toast.id))}
      className={cx('block w-full rounded-md px-4 py-2.5 text-left text-sm text-white shadow-lg', COLORS[toast.type] ?? COLORS.info)}
    >
      {toast.message}
    </button>
  );
}

export default function Toasts() {
  const toasts = useSelector((s) => s.ui.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-80 space-y-2 [&>*]:pointer-events-auto">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}