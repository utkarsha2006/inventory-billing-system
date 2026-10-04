import { useDispatch } from 'react-redux';
import { Button, EmptyState, Input } from '../../components/ui.jsx';
import { formatMoney, paiseToInput } from '../../utils/format.js';
import { parseQty } from './cartMath.js';
import { removeLine, setLineField, setQtyText, stepQty } from './posSlice.js';

export default function Cart({ lines, computed, canOverridePrice, stale }) {
  const dispatch = useDispatch();

  if (lines.length === 0) {
    return <EmptyState title="The cart is empty" hint="Scan a barcode or pick a product to start a bill." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Price (₹)</th>
            <th className="px-3 py-2">Discount (₹)</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => {
            const q = parseQty(l.unit, l.qtyText);
            const over = !q.error && q.qty > l.stockQty;
            const line = computed?.[i];
            return (
              <tr key={l.productId} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-500">
                    {l.sku} · {l.unit}
                  </div>
                  {over && <div className="text-xs text-amber-600">Only {l.stockQty} in stock</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" onClick={() => dispatch(stepQty({ productId: l.productId, delta: -1 }))} aria-label="Decrease">
                      −
                    </Button>
                    <Input
                      inputMode="decimal"
                      value={l.qtyText}
                      invalid={!!q.error}
                      title={q.error}
                      onChange={(e) => dispatch(setQtyText({ productId: l.productId, text: e.target.value }))}
                      className="w-16 px-2 text-center"
                    />
                    <Button variant="secondary" size="sm" onClick={() => dispatch(stepQty({ productId: l.productId, delta: 1 }))} aria-label="Increase">
                      +
                    </Button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {canOverridePrice ? (
                    <Input
                      inputMode="decimal"
                      value={l.priceText !== '' ? l.priceText : paiseToInput(l.pricePaise)}
                      onChange={(e) => {
                        const text = e.target.value;
                        // typing the original price back removes the override
                        dispatch(setLineField({ productId: l.productId, field: 'priceText', text: text === paiseToInput(l.pricePaise) ? '' : text }));
                      }}
                      className="w-24 px-2"
                    />
                  ) : (
                    formatMoney(l.pricePaise)
                  )}
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={l.discountText}
                    onChange={(e) => dispatch(setLineField({ productId: l.productId, field: 'discountText', text: e.target.value }))}
                    className="w-20 px-2"
                  />
                </td>
                <td className={`px-3 py-2 text-right font-medium ${stale ? 'opacity-40' : ''}`}>{line ? formatMoney(line.lineTotalPaise) : '…'}</td>
                <td className="px-1 py-2">
                  <button type="button" onClick={() => dispatch(removeLine(l.productId))} aria-label={`Remove ${l.name}`} className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}