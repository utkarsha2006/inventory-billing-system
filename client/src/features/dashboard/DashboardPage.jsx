import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client.js';
import { Alert, Card, Spinner } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatMoney, formatNumber, ymdToDmy } from '../../utils/format.js';

const Stat = ({ label, value, hint, tone = 'text-slate-900' }) => (
  <Card>
    <div className="text-sm text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </Card>
);

export default function DashboardPage() {
  const { data: d, loading, error } = useAsync(() => api.get('/dashboard/summary').then((r) => r.data.data), []);

  if (loading) return <Spinner className="m-8" />;
  if (error) return <Alert type="error">{error}</Alert>;

  const chart = d.last7Days.map((x) => ({ day: ymdToDmy(x.date).slice(0, 5), sales: x.netSalesPaise / 100 })); // rupees, for the axis only
  const alerts = d.alerts;

  return (
    <div className="space-y-4">
      {(alerts.lowStockCount > 0 || alerts.expiringCount > 0) && (
        <Alert type="warn" className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {alerts.lowStockCount > 0 && `${alerts.lowStockCount} item(s) low on stock (${alerts.outOfStockCount} out). `}
            {alerts.expiringCount > 0 && `${alerts.expiringCount} batch(es) expiring soon or expired.`}
          </span>
          <Link to="/products?lowStock=true" className="font-medium text-indigo-700 underline">
            View low stock
          </Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's net sales" value={formatMoney(d.today.netSalesPaise)} hint={`${d.today.invoices} bills · returns ${formatMoney(d.today.returnsPaise)}`} />
        <Stat label="This month" value={formatMoney(d.month.netSalesPaise)} hint={`${d.month.invoices} bills`} />
        <Stat label="Customers owe you" value={formatMoney(d.receivables.totalPaise)} hint={`${d.receivables.customers} customer(s)`} tone={d.receivables.totalPaise > 0 ? 'text-amber-600' : undefined} />
        <Stat label="You owe suppliers" value={formatMoney(d.payables.totalPaise)} hint={`${d.payables.suppliers} supplier(s)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-3 font-semibold">Last 7 days (net sales)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" />
                <YAxis tickFormatter={(v) => `₹${formatNumber(v)}`} width={70} />
                <Tooltip formatter={(v) => formatMoney(Math.round(v * 100))} />
                <Bar dataKey="sales" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Collected today</h2>
          {d.collectionsToday.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing collected yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.collectionsToday.map((c) => (
                <li key={c.mode} className="flex justify-between">
                  <span>{c.mode}</span>
                  <span className="font-medium">{formatMoney(c.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Top products this month</h2>
        {d.topProducts.length === 0 ? (
          <p className="text-sm text-slate-400">No sales yet this month.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {d.topProducts.map((p) => (
                <tr key={p.productId}>
                  <td className="py-1.5 text-slate-400">{p.rank}</td>
                  <td className="py-1.5 font-medium">{p.name}</td>
                  <td className="py-1.5 text-right text-slate-500">
                    {formatNumber(p.netQty)} {p.unit}
                  </td>
                  <td className="py-1.5 text-right">{formatMoney(p.netRevenuePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}