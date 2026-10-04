import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api, errorMessage } from '../../api/client.js';
import { Alert, Badge, Button, Card, Field, Input, Modal } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatMoney } from '../../utils/format.js';
import { setCustomer } from './posSlice.js';

function NewCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', gstin: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
      onCreated((await api.post('/customers', body)).data.data);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New customer" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {error && <Alert type="error">{error}</Alert>}
        <Field label="Name">
          <Input autoFocus required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Mobile" hint="Optional, 10 digits">
          <Input inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="GSTIN" hint="Only for a business buyer (B2B invoice)">
          <Input maxLength={15} className="uppercase" value={form.gstin} onChange={set('gstin')} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save and select'}
        </Button>
      </form>
    </Modal>
  );
}

export default function CustomerPicker() {
  const dispatch = useDispatch();
  const customer = useSelector((s) => s.pos.customer);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(q.trim(), 250);
  const { data } = useAsync(
    () => (open ? api.get('/customers', { params: { q: debounced || undefined, limit: 6 } }).then((r) => r.data.data) : []),
    [debounced, open]
  );

  const choose = (c) => {
    dispatch(setCustomer(c));
    setOpen(false);
    setQ('');
  };

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Customer</span>
        <button type="button" className="text-sm font-medium text-indigo-600" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>

      {customer ? (
        <div className="flex items-start justify-between rounded-md bg-slate-50 p-2 text-sm">
          <div>
            <div className="font-medium">{customer.name}</div>
            <div className="text-xs text-slate-500">
              {[customer.phone, customer.gstin].filter(Boolean).join(' · ') || 'Walk-in details not recorded'}
            </div>
            {customer.outstandingPaise > 0 && <Badge color="amber">Owes {formatMoney(customer.outstandingPaise)}</Badge>}
          </div>
          <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => dispatch(setCustomer(null))} aria-label="Remove customer">
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input placeholder="Walk-in customer. Search to add one…" value={q} onFocus={() => setOpen(true)} onChange={(e) => (setQ(e.target.value), setOpen(true))} />
          {open && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
              {(data ?? []).map((c) => (
                <button key={c._id} type="button" onClick={() => choose(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                  {c.name} <span className="text-xs text-slate-400">{c.phone}</span>
                </button>
              ))}
              {data?.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No customers found</p>}
              <button type="button" onClick={() => setOpen(false)} className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs text-slate-500">
                Close
              </button>
            </div>
          )}
        </div>
      )}
      {creating && <NewCustomerModal onClose={() => setCreating(false)} onCreated={(c) => (setCreating(false), choose(c))} />}
    </Card>
  );
}