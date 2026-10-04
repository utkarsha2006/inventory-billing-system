import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { Alert, Button, Card } from '../../components/ui.jsx';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner.js';
import { formatMoney, parseMoney } from '../../utils/format.js';
import { isStaff } from '../../utils/roles.js';
import { toast } from '../ui/uiSlice.js';
import { buildInvoicePayload, buildPayments, cartIssues, paymentIssues } from './cartMath.js';
import Cart from './Cart.jsx';
import CameraScanner from './CameraScanner.jsx';
import CustomerPicker from './CustomerPicker.jsx';
import PaymentPanel from './PaymentPanel.jsx';
import ProductSearch from './ProductSearch.jsx';
import SuccessModal from './SuccessModal.jsx';
import Totals from './Totals.jsx';
import { addProduct, clearBill } from './posSlice.js';
import { usePreview } from './usePreview.js';

export default function PosPage() {
  const dispatch = useDispatch();
  const pos = useSelector((s) => s.pos);
  const role = useSelector((s) => s.auth.user.role);
  const staff = isStaff(role);
  const searchRef = useRef(null);

  const [notFound, setNotFound] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(null);

  const issues = useMemo(() => cartIssues(pos), [pos]);
  const payload = useMemo(() => (pos.lines.length > 0 && issues.length === 0 ? buildInvoicePayload(pos) : null), [pos, issues]);
  const preview = usePreview(payload);
  const totalPaise = preview.fresh ? preview.data.totals.grandTotalPaise : null;
  const payIssues = useMemo(() => paymentIssues(pos, totalPaise), [pos, totalPaise]);
  const canPay = preview.fresh && payIssues.length === 0 && !submitting;

  const handlePick = useCallback(
    (product) => {
      dispatch(addProduct(product));
      setNotFound(null);
      searchRef.current?.focus(); // keep the scan field ready for the next item
    },
    [dispatch]
  );

  // Barcode -> product. Returns true if a product was added.
  const addByCode = useCallback(
    async (raw, { quiet = false } = {}) => {
      const code = String(raw ?? '').trim();
      if (!code) return false;
      try {
        const res = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
        handlePick(res.data.data.product);
        return true;
      } catch (e) {
        const info = e.response?.status === 404 ? e.response.data?.data : null;
        if (info?.found === false) {
          if (!quiet) setNotFound({ code, inactive: Boolean(info.inactive) });
        } else if (e.response?.status === 400) {
          if (!quiet) setNotFound({ code, invalid: true });
        } else if (!quiet) {
          dispatch(toast('error', errorMessage(e)));
        }
        return false;
      }
    },
    [dispatch, handlePick]
  );

  useBarcodeScanner((code) => addByCode(code), { enabled: !cameraOpen && !done });

  const checkout = useCallback(async () => {
    if (!payload || !canPay) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post('/invoices', { ...payload, clientRequestId: pos.requestId, payments: buildPayments(pos) });
      const received = parseMoney(cashReceived);
      const change = pos.payments.length === 1 && pos.payments[0].mode === 'CASH' && received.valid && !received.empty ? Math.max(received.paise - res.data.data.totals.grandTotalPaise, 0) : 0;
      setDone({ invoice: res.data.data, change, replay: Boolean(res.data.meta?.idempotentReplay) });
      dispatch(clearBill());
      setCashReceived('');
    } catch (e) {
      // The bill is kept as is. Pressing Pay again re-sends the SAME request id, so it can't double-bill.
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [payload, canPay, pos, cashReceived, dispatch]);

  // Keyboard shortcuts: F2 = scan field, F9 = pay
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') (e.preventDefault(), searchRef.current?.focus());
      if (e.key === 'F9') (e.preventDefault(), checkout());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checkout]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-4">
        <ProductSearch inputRef={searchRef} onPick={handlePick} onSubmitCode={addByCode} onCamera={() => setCameraOpen(true)} />

        {notFound && (
          <Alert type="warn" className="flex items-center justify-between gap-3">
            <span>
              {notFound.invalid
                ? `“${notFound.code}” is not a valid barcode.`
                : notFound.inactive
                  ? `Barcode ${notFound.code} belongs to a deactivated product.`
                  : `No product found for barcode ${notFound.code}.`}
              {!staff && ' Ask a manager to add it.'}
            </span>
            <span className="flex gap-2">
              {staff && !notFound.invalid && (
                <Link to={`/products/new?barcode=${encodeURIComponent(notFound.code)}`} className="font-medium text-indigo-700 underline">
                  {notFound.inactive ? 'Open products' : 'Add product'}
                </Link>
              )}
              <button type="button" onClick={() => setNotFound(null)} className="text-slate-500">
                Dismiss
              </button>
            </span>
          </Alert>
        )}

        <Card className="overflow-hidden p-0">
          <Cart lines={pos.lines} computed={preview.fresh ? preview.data.items : null} canOverridePrice={staff} stale={preview.loading} />
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <CustomerPicker />
        <Card>
          <Totals preview={preview} issues={issues} />
        </Card>
        <PaymentPanel totalPaise={totalPaise} issues={payIssues} cashReceived={cashReceived} onCashReceived={setCashReceived} />
        {submitError && <Alert type="error">{submitError}</Alert>}
        <Button size="lg" className="w-full" disabled={!canPay} onClick={checkout}>
          {submitting ? 'Saving…' : totalPaise !== null ? `Pay ${formatMoney(totalPaise)}  (F9)` : 'Pay'}
        </Button>
        {pos.lines.length > 0 && (
          <Button variant="ghost" className="w-full" onClick={() => dispatch(clearBill())}>
            Clear bill
          </Button>
        )}
      </div>

      {cameraOpen && <CameraScanner onClose={() => setCameraOpen(false)} onScan={(code) => addByCode(code)} />}
      {done && (
        <SuccessModal
          invoice={done.invoice}
          change={done.change}
          replay={done.replay}
          onNewBill={() => {
            setDone(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}