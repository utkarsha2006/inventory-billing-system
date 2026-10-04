import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { api, openPdf, printPdf, readBlobError } from '../../api/client.js';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Pagination, Select, Spinner } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';
import { toast } from '../ui/uiSlice.js';

const STATUS_COLOR = { PAID: 'green', PARTIAL: 'amber', UNPAID: 'red' };

export default function InvoicesPage() {
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(q.trim(), 300);

  const { data, loading, error } = useAsync(
    () =>
      api
        .get('/invoices', { params: { q: debounced || undefined, from: from || undefined, to: to || undefined, paymentStatus: status || undefined, page, limit: 20 } })
        .then((r) => r.data),
    [debounced, from, to, status, page]
  );

  const pdf = (action, id, format) => async () => {
    try {
      await action(`/invoices/${id}/pdf?format=${format}`);
    } catch (e) {
      dispatch(toast('error', await readBlobError(e)));
    }
  };

  const invoices = data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Invoice no.">
          <Input placeholder="e.g. 0042" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
        </Field>
        <Field label="Payment">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Part paid</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
        </Field>
      </Card>

      {error && <Alert type="error">{error}</Alert>}

      <Card className="overflow-x-auto p-0">
        {loading && !data ? (
          <Spinner className="m-6" />
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices found" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td className="px-3 py-2 font-medium">
                    {inv.invoiceNo} {inv.invoiceType === 'B2B' && <Badge color="blue">B2B</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDateTime(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 text-slate-600">{inv.customerSnapshot?.name ?? 'Walk-in'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(inv.totals.grandTotalPaise)}</td>
                  <td className="px-3 py-2">
                    <Badge color={STATUS_COLOR[inv.paymentStatus]}>{inv.paymentStatus}</Badge>
                    {inv.balanceDuePaise > 0 && <span className="ml-1 text-xs text-slate-500">due {formatMoney(inv.balanceDuePaise)}</span>}
                  </td>
                  <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={pdf(printPdf, inv._id, 'thermal')}>🖨 Receipt</Button>
                    <Button size="sm" variant="secondary" onClick={pdf(printPdf, inv._id, 'a4')}>🖨 A4</Button>
                    <Button size="sm" variant="ghost" onClick={pdf(openPdf, inv._id, 'a4')}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pagination page={page} totalPages={data?.meta?.totalPages} onChange={setPage} />
    </div>
  );
}