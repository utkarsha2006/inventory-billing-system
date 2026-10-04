import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { api, errorMessage } from '../../api/client.js';
import { Alert, Badge, Button, Field, Input, Modal, Select } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ADJUSTMENT_TYPES, FRACTIONAL_UNITS } from '../../utils/constants.js';
import { formatDateTime, formatNumber, ymdToDmy } from '../../utils/format.js';
import { toast } from '../ui/uiSlice.js';

const MUST_REMOVE = ['DAMAGE', 'EXPIRED'];

export default function StockModal({ product, onClose, onChanged }) {
  const dispatch = useDispatch();
  const [tab, setTab] = useState(null); // null = pick automatically
  const [type, setType] = useState('ADJUSTMENT');
  const [direction, setDirection] = useState('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [batchId, setBatchId] = useState('');
  const [batch, setBatch] = useState({ batchNo: '', expiryDate: '', qty: '', cost: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(product.stockQty);

  const { data: history, reload: reloadHistory } = useAsync(
    () => api.get(`/products/${product._id}/stock-movements`, { params: { limit: 8 } }).then((r) => r.data.data),
    [product._id]
  );
  const { data: batches, reload: reloadBatches } = useAsync(
    () => (product.trackBatches ? api.get(`/products/${product._id}/batches`).then((r) => r.data.data) : []),
    [product._id]
  );

  // A batch product with no batches can't be adjusted yet: open "Add batch" instead.
  const noBatches = product.trackBatches && batches !== null && batches.length === 0;
  const activeTab = tab ?? (noBatches ? 'batch' : 'adjust');

  const effective = MUST_REMOVE.includes(type) ? 'remove' : type === 'OPENING' ? 'add' : direction;
  const fractional = FRACTIONAL_UNITS.includes(product.unit);
  const validQty = fractional ? /^\d{1,7}(\.\d{1,3})?$/ : /^\d{1,7}$/;

  const run = async (request, message) => {
    setBusy(true);
    setError(null);
    try {
      const res = await request();
      setCurrent(res.data.data.product.stockQty);
      dispatch(toast('success', message));
      onChanged();
      reloadHistory();
      reloadBatches();
      setQty('');
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const adjust = (e) => {
    e.preventDefault();
    if (!validQty.test(qty) || Number(qty) <= 0) {
      return setError(fractional ? 'Enter a quantity (up to 3 decimals)' : 'Enter a whole number');
    }
    const qtyChange = (effective === 'remove' ? -1 : 1) * Number(qty);
    return run(
      () =>
        api.post(`/products/${product._id}/stock-adjustments`, {
          type,
          qtyChange,
          reason,
          ...(product.trackBatches && { batchId }),
        }),
      'Stock updated'
    );
  };

  const addBatch = (e) => {
    e.preventDefault();
    const cost = batch.cost.trim();
    run(
      () =>
        api.post(`/products/${product._id}/batches`, {
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          qty: Number(batch.qty),
          ...(cost && { purchasePricePaise: Math.round(Number(cost) * 100) }),
        }),
      'Batch added'
    );
  };

  return (
    <Modal title={`Stock: ${product.name}`} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm">
            In stock: <span className="text-lg font-semibold">{formatNumber(current)}</span> {product.unit}
          </div>

          {product.trackBatches && (
            <div className="flex gap-1">
              <Button size="sm" variant={activeTab === 'adjust' ? 'primary' : 'secondary'} onClick={() => setTab('adjust')}>
                Adjust
              </Button>
              <Button size="sm" variant={activeTab === 'batch' ? 'primary' : 'secondary'} onClick={() => setTab('batch')}>
                Add batch
              </Button>
            </div>
          )}

          {error && <Alert type="error">{error}</Alert>}

          {activeTab === 'adjust' ? (
            <form onSubmit={adjust} className="space-y-3">
              {noBatches && (
                <Alert type="info">
                  This product tracks batches and has none yet. Use <b>Add batch</b> to bring in stock first.
                </Alert>
              )}

              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>

              <div className="flex items-end gap-2">
                <div className="flex">
                  {['add', 'remove'].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={effective === d ? 'primary' : 'secondary'}
                      disabled={MUST_REMOVE.includes(type) || type === 'OPENING'}
                      className="rounded-none first:rounded-l-md last:rounded-r-md"
                      onClick={() => setDirection(d)}
                    >
                      {d === 'add' ? '+ Add' : '− Remove'}
                    </Button>
                  ))}
                </div>
                <Input
                  inputMode="decimal"
                  placeholder={`Quantity (${product.unit})`}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>

              {product.trackBatches && (
                <Field label="Batch">
                  <Select required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                    <option value="">Choose a batch…</option>
                    {(batches ?? []).map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.batchNo} · exp {ymdToDmy(b.expiryDate.slice(0, 10))} · {b.qtyRemaining} left
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Reason" hint="Recorded with your name in the stock history">
                <Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>

              <Button type="submit" className="w-full" disabled={busy || noBatches}>
                {busy ? 'Saving…' : 'Save adjustment'}
              </Button>
            </form>
          ) : (
            <form onSubmit={addBatch} className="space-y-3">
              <Field label="Batch number">
                <Input required value={batch.batchNo} onChange={(e) => setBatch({ ...batch, batchNo: e.target.value })} />
              </Field>
              <Field label="Expiry date">
                <Input
                  required
                  type="date"
                  value={batch.expiryDate}
                  onChange={(e) => setBatch({ ...batch, expiryDate: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Quantity (${product.unit})`}>
                  <Input
                    required
                    inputMode="decimal"
                    value={batch.qty}
                    onChange={(e) => setBatch({ ...batch, qty: e.target.value })}
                  />
                </Field>
                <Field label="Cost per unit ₹">
                  <Input
                    inputMode="decimal"
                    value={batch.cost}
                    onChange={(e) => setBatch({ ...batch, cost: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Saving…' : 'Add batch'}
              </Button>
            </form>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Recent changes</h3>
          <ul className="space-y-2 text-sm">
            {(history ?? []).map((m) => (
              <li key={m._id} className="rounded-md bg-slate-50 p-2">
                <div className="flex items-center justify-between">
                  <Badge color={m.qtyChange < 0 ? 'red' : 'green'}>
                    {m.qtyChange > 0 ? '+' : ''}
                    {m.qtyChange} · {m.type}
                  </Badge>
                  <span className="text-xs text-slate-500">→ {m.qtyAfter}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.reason} · {m.performedBy?.name ?? 'unknown'} · {formatDateTime(m.createdAt)}
                </div>
              </li>
            ))}
            {history?.length === 0 && <li className="text-slate-400">No movements yet.</li>}
          </ul>
        </div>
      </div>
    </Modal>
  );
}