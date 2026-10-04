import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { readBlobError, openPdf, printPdf } from '../../api/client.js';
import { Alert, Button, Modal } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format.js';
import { toast } from '../ui/uiSlice.js';

export default function SuccessModal({ invoice, change, replay, onNewBill }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);

  const run = (action, format) => async () => {
    setBusy(true);
    try {
      await action(`/invoices/${invoice._id}/pdf?format=${format}`);
    } catch (e) {
      dispatch(toast('error', await readBlobError(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Bill complete" onClose={onNewBill}>
      <div className="space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <div>
          <div className="text-lg font-semibold">{invoice.invoiceNo}</div>
          <div className="text-2xl font-bold">{formatMoney(invoice.totals.grandTotalPaise)}</div>
          {invoice.balanceDuePaise > 0 && <div className="text-sm text-amber-600">Balance due {formatMoney(invoice.balanceDuePaise)}</div>}
        </div>
        {change > 0 && <Alert type="success">Return {formatMoney(change)} to the customer</Alert>}
        {replay && <Alert type="info">This bill had already been saved, so nothing was charged twice.</Alert>}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={run(printPdf, 'thermal')}>🖨 Print receipt</Button>
          <Button variant="secondary" disabled={busy} onClick={run(printPdf, 'a4')}>🖨 Print A4</Button>
          <Button variant="secondary" disabled={busy} onClick={run(openPdf, 'a4')}>Open PDF</Button>
          <Button variant="secondary" disabled={busy} onClick={onNewBill}>New bill</Button>
        </div>
      </div>
    </Modal>
  );
}