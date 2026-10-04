import { useDispatch, useSelector } from 'react-redux';
import { Alert, Badge, Button, Input, Select, Spinner } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format.js';
import { STATE_OPTIONS } from '../../utils/states.js';
import { setBillDiscount, setPlaceOfSupply } from './posSlice.js';

const Row = ({ label, value, strong, muted }) => (
  <div className={`flex justify-between py-0.5 ${strong ? 'text-lg font-semibold' : 'text-sm'} ${muted ? 'text-slate-500' : ''}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export default function Totals({ preview, issues }) {
  const dispatch = useDispatch();
  const billDiscount = useSelector((s) => s.pos.billDiscount);
  const placeOfSupply = useSelector((s) => s.pos.placeOfSupply);
  const t = preview.data?.totals;
  const hasLines = useSelector((s) => s.pos.lines.length > 0);

  return (
    <div className="space-y-3">
      {issues.length > 0 && (
        <Alert type="warn">
          <ul className="list-inside list-disc">
            {issues.slice(0, 3).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      {preview.error && <Alert type="error">{preview.error}</Alert>}

      <div className={preview.loading ? 'opacity-60 transition-opacity' : ''}>
        {t ? (
          <>
            <div className="mb-1 flex items-center gap-2 text-xs">
              <Badge color={preview.data.documentType === 'TAX_INVOICE' ? 'blue' : 'gray'}>
                {preview.data.documentType === 'TAX_INVOICE' ? 'Tax invoice' : 'Bill of supply'}
              </Badge>
              {preview.data.documentType === 'TAX_INVOICE' && (
                <Badge color="gray">{preview.data.supplyType === 'INTRA' ? 'CGST + SGST' : 'IGST'}</Badge>
              )}
              {preview.loading && <Spinner className="h-3 w-3" />}
            </div>
            <Row label="Subtotal" value={formatMoney(t.subtotalPaise)} muted />
            {t.itemDiscountPaise + t.billDiscountPaise > 0 && (
              <Row label="Discount" value={`− ${formatMoney(t.itemDiscountPaise + t.billDiscountPaise)}`} muted />
            )}
            <Row label="Taxable value" value={formatMoney(t.taxablePaise)} muted />
            {t.cgstPaise > 0 && <Row label="CGST" value={formatMoney(t.cgstPaise)} muted />}
            {t.sgstPaise > 0 && <Row label="SGST" value={formatMoney(t.sgstPaise)} muted />}
            {t.igstPaise > 0 && <Row label="IGST" value={formatMoney(t.igstPaise)} muted />}
            {t.roundOffPaise !== 0 && <Row label="Round off" value={formatMoney(t.roundOffPaise)} muted />}
            <div className="mt-1 border-t border-slate-200 pt-1">
              <Row label="Total" value={formatMoney(t.grandTotalPaise)} strong />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">{hasLines ? (preview.loading ? 'Calculating…' : 'Totals appear here.') : 'No items yet.'}</p>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Bill discount and place of supply</summary>
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder="Bill discount"
              value={billDiscount.value}
              onChange={(e) => dispatch(setBillDiscount({ value: e.target.value }))}
            />
            <div className="flex">
              {[['amount', '₹'], ['percent', '%']].map(([mode, label]) => (
                <Button key={mode} variant={billDiscount.mode === mode ? 'primary' : 'secondary'} size="sm" className="rounded-none first:rounded-l-md last:rounded-r-md" onClick={() => dispatch(setBillDiscount({ mode }))}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Select value={placeOfSupply} onChange={(e) => dispatch(setPlaceOfSupply(e.target.value))}>
            <option value="">Place of supply: automatic</option>
            {STATE_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </details>
    </div>
  );
}