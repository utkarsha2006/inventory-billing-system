import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, downloadFile, readBlobError } from '../../api/client.js';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatMoney, formatNumber, monthStartIst, todayIst } from '../../utils/format.js';
import { toast } from '../ui/uiSlice.js';
import ReportViewer from './ReportViewer.jsx';

const REPORTS = [
  { id: 'sales-daily', label: 'Daily sales', path: '/reports/sales/daily', range: true, chart: true },
  { id: 'sales-monthly', label: 'Monthly sales', path: '/reports/sales/monthly', range: true, chart: true },
  { id: 'top-products', label: 'Top products', path: '/reports/top-products', range: true, option: { name: 'sortBy', choices: [['revenue', 'By revenue'], ['qty', 'By quantity']] } },
  { id: 'profit', label: 'Profit', path: '/reports/profit', range: true, option: { name: 'groupBy', choices: [['day', 'By day'], ['month', 'By month'], ['product', 'By product']] } },
  { id: 'stock', label: 'Stock valuation', path: '/reports/stock-valuation', range: false },
  { id: 'gstr1', label: 'GSTR-1', path: '/reports/gst/gstr1', range: true, gst: true },
  { id: 'gstr3b', label: 'GSTR-3B', path: '/reports/gst/gstr3b', range: true, gst: true },
  { id: 'hsn', label: 'HSN summary', path: '/reports/gst/hsn-summary', range: true, gst: true },
];

// Headline numbers per report: [label, key in report.summary, kind]
const KPIS = {
  'sales-daily': [['Sales', 'salesPaise', 'money'], ['Returns', 'returnsPaise', 'money'], ['Net sales', 'netSalesPaise', 'money'], ['Bills', 'invoices', 'int']],
  'sales-monthly': [['Sales', 'salesPaise', 'money'], ['Returns', 'returnsPaise', 'money'], ['Net sales', 'netSalesPaise', 'money'], ['Bills', 'invoices', 'int']],
  profit: [['Net taxable sales', 'revenuePaise', 'money'], ['Cost of goods', 'costPaise', 'money'], ['Profit', 'profitPaise', 'money'], ['Margin', 'marginPct', 'pct']],
  stock: [['Items', 'items', 'int'], ['Value at cost', 'totalCostPaise', 'money'], ['Value at selling price', 'totalRetailPaise', 'money']],
};

const show = (v, kind) => (v === null || v === undefined ? '–' : kind === 'money' ? formatMoney(v) : kind === 'pct' ? `${v}%` : formatNumber(v));

export default function ReportsPage() {
  const dispatch = useDispatch();
  const shop = useSelector((s) => s.auth.shop);
  const regular = shop?.gstRegistrationType === 'REGULAR';
  const available = REPORTS.filter((r) => !r.gst || regular);

  const [reportId, setReportId] = useState('sales-daily');
  const [from, setFrom] = useState(monthStartIst());
  const [to, setTo] = useState(todayIst());
  const [option, setOption] = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const def = REPORTS.find((r) => r.id === reportId);
  const optionValue = def.option ? option || def.option.choices[0][0] : undefined;
  const params = { ...(def.range && { from, to }), ...(def.option && { [def.option.name]: optionValue }) };

  const { data: report, loading, error } = useAsync(() => api.get(def.path, { params }).then((r) => r.data.data), [reportId, from, to, optionValue]);

  useEffect(() => setActiveKey(null), [reportId]);

  const download = async (format) => {
    setDownloading(true);
    try {
      const table = format === 'csv' && report.sheets.length > 1 ? (activeKey ?? report.sheets[0].key) : undefined;
      await downloadFile(def.path, { ...params, format, table });
    } catch (e) {
      dispatch(toast('error', await readBlobError(e)));
    } finally {
      setDownloading(false);
    }
  };

  const chartData = def.chart && report ? report.sheets[0].rows.map((r) => ({ label: r.period.length === 10 ? r.period.slice(5) : r.period, sales: r.netSalesPaise / 100 })) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {available.map((r) => (
          <Button key={r.id} size="sm" variant={r.id === reportId ? 'primary' : 'secondary'} onClick={() => (setReportId(r.id), setOption(''))}>
            {r.label}
          </Button>
        ))}
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        {def.range && (
          <>
            <Field label="From">
              <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </>
        )}
        {def.option && (
          <Field label="View">
            <Select value={optionValue} onChange={(e) => setOption(e.target.value)}>
              {def.option.choices.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" disabled={!report || downloading} onClick={() => download('csv')}>
            ⬇ CSV{report?.sheets.length > 1 ? ' (this table)' : ''}
          </Button>
          <Button variant="secondary" disabled={!report || downloading} onClick={() => download('xlsx')}>
            ⬇ Excel
          </Button>
        </div>
      </Card>

      {loading && <Spinner className="m-6" />}
      {error && <Alert type="error">{error}</Alert>}

      {report && !loading && (
        <>
          {KPIS[reportId] && report.summary && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {KPIS[reportId].map(([label, key, kind]) => (
                <Card key={key}>
                  <div className="text-sm text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-semibold">{show(report.summary[key], kind)}</div>
                </Card>
              ))}
            </div>
          )}

          {chartData && (
            <Card>
              <h2 className="mb-3 font-semibold">Net sales</h2>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => `₹${formatNumber(v)}`} width={70} />
                    <Tooltip formatter={(v) => formatMoney(Math.round(v * 100))} />
                    <Bar dataKey="sales" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <ReportViewer report={report} activeKey={activeKey} onActiveChange={setActiveKey} />
        </>
      )}
    </div>
  );
}