import { useState } from 'react';
import { api } from '../../api/client.js';
import { Badge, Button, Input, Spinner, cx } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatMoney } from '../../utils/format.js';

const LOOKS_LIKE_CODE = /^[A-Za-z0-9._\-/]{4,48}$/;

export default function ProductSearch({ inputRef, onPick, onSubmitCode, onCamera }) {
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 250);
  const { data: results, loading } = useAsync(
    () => api.get('/products', { params: { q: debounced || undefined, limit: 12 } }).then((r) => r.data.data),
    [debounced]
  );

  // Enter works for typed AND scanned codes: try an exact barcode first, then fall back to the search results.
  const submit = async () => {
    const code = q.trim();
    if (!code) return;
    if (LOOKS_LIKE_CODE.test(code) && (await onSubmitCode(code, { quiet: true }))) {
      setQ('');
      return;
    }
    if (results?.length === 1 && debounced === code) {
      onPick(results[0]);
      setQ('');
    } else if (results?.length === 0 && debounced === code) {
      await onSubmitCode(code); // shows the "not found" notice
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
            placeholder="Scan a barcode or search by name / SKU…   (F2)"
            className="py-2.5 pr-9 text-base"
          />
          {loading && <Spinner className="absolute right-3 top-3 h-4 w-4" />}
        </div>
        <Button variant="secondary" onClick={onCamera} title="Scan with the camera">
          📷 Camera
        </Button>
      </div>

      {results && results.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((p) => {
            const out = p.stockQty <= 0;
            return (
              <button
                key={p._id}
                type="button"
                disabled={out}
                onClick={() => onPick(p)}
                className={cx(
                  'rounded-lg border bg-white p-2.5 text-left transition',
                  out ? 'cursor-not-allowed border-slate-200 opacity-50' : 'border-slate-200 hover:border-indigo-400 hover:shadow'
                )}
              >
                <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatMoney(p.sellingPricePaise)}</span>
                  {out ? <Badge color="red">Out</Badge> : p.isLowStock ? <Badge color="amber">{p.stockQty} left</Badge> : <span>{p.stockQty} {p.unit}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {results && results.length === 0 && !loading && <p className="text-sm text-slate-500">No products match “{debounced}”.</p>}
    </div>
  );
}