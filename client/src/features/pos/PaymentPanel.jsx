import { useDispatch, useSelector } from 'react-redux';
import { Alert, Button, Card, Input, cx } from '../../components/ui.jsx';
import { formatMoney, parseMoney } from '../../utils/format.js';
import { PAYMENT_MODES } from '../../utils/constants.js';
import { setPayments } from './posSlice.js';

const LABEL = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', CREDIT: 'Credit' };

export default function PaymentPanel({ totalPaise, issues, cashReceived, onCashReceived }) {
  const dispatch = useDispatch();
  const payments = useSelector((s) => s.pos.payments);
  const split = payments.length > 1;

  const update = (index, patch) => dispatch(setPayments(payments.map((p, i) => (i === index ? { ...p, ...patch } : p))));
  const received = parseMoney(cashReceived);
  const change = payments[0].mode === 'CASH' && received.valid && !received.empty && totalPaise ? received.paise - totalPaise : null;
  const paidSoFar = payments.reduce((sum, p) => sum + (parseMoney(p.amount).valid ? parseMoney(p.amount).paise : 0), 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Payment</span>
        <button
          type="button"
          className="text-sm font-medium text-indigo-600"
          onClick={() => dispatch(setPayments(split ? [{ ...payments[0], amount: '' }] : [...payments, { mode: 'UPI', amount: '', reference: '' }]))}
        >
          {split ? 'Single payment' : 'Split payment'}
        </button>
      </div>

      {payments.map((p, i) => (
        <div key={i} className="space-y-2">
          <div className="flex gap-1">
            {PAYMENT_MODES.map((m) => (
              <Button key={m} size="sm" variant={p.mode === m ? 'primary' : 'secondary'} className="flex-1" onClick={() => update(i, { mode: m })}>
                {LABEL[m]}
              </Button>
            ))}
          </div>
          {split && (
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder="Amount ₹" value={p.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              <Button variant="ghost" size="sm" onClick={() => dispatch(setPayments(payments.filter((_, j) => j !== i)))} aria-label="Remove payment" disabled={payments.length < 2}>
                ✕
              </Button>
            </div>
          )}
          {(p.mode === 'UPI' || p.mode === 'CARD') && (
            <Input placeholder="Reference / UTR (optional)" value={p.reference} onChange={(e) => update(i, { reference: e.target.value })} />
          )}
        </div>
      ))}

      {split && totalPaise !== null && (
        <p className={cx('text-sm', paidSoFar === totalPaise ? 'text-emerald-600' : 'text-slate-500')}>
          Entered {formatMoney(paidSoFar)} of {formatMoney(totalPaise)}
        </p>
      )}

      {!split && payments[0].mode === 'CASH' && (
        <div className="flex items-center gap-3">
          <Input inputMode="decimal" placeholder="Cash received ₹" value={cashReceived} onChange={(e) => onCashReceived(e.target.value)} />
          {change !== null && (
            <span className={cx('whitespace-nowrap text-sm font-semibold', change < 0 ? 'text-red-600' : 'text-emerald-600')}>
              {change < 0 ? `Short ${formatMoney(-change)}` : `Change ${formatMoney(change)}`}
            </span>
          )}
        </div>
      )}

      {issues.map((m) => (
        <Alert key={m} type="warn">
          {m}
        </Alert>
      ))}
    </Card>
  );
}