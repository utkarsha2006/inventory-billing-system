import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { Alert, Badge, Button, Card, EmptyState, Input, Pagination, Select, Spinner } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatMoney } from '../../utils/format.js';
import { isStaff } from '../../utils/roles.js';
import CameraScanner from '../pos/CameraScanner.jsx';
import { toast } from '../ui/uiSlice.js';
import StockModal from './StockModal.jsx';

export default function ProductsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const role = useSelector((s) => s.auth.user.role);
  const staff = isStaff(role);
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') ?? 1);
  const lowStock = params.get('lowStock') === 'true';
  const category = params.get('category') ?? '';
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 300);
  const [stockFor, setStockFor] = useState(null);
  const [camera, setCamera] = useState(false);

  const setParam = (key, value) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });

  const { data, loading, error, reload } = useAsync(
    () =>
      api
        .get('/products', { params: { q: debounced || undefined, category: category || undefined, lowStock: lowStock || undefined, includeInactive: staff || undefined, page, limit: 20 } })
        .then((r) => r.data),
    [debounced, category, lowStock, page, staff]
  );
  const { data: categories } = useAsync(() => api.get('/products/categories').then((r) => r.data.data), []);

  // Scan to find a product: open its stock screen, or offer to create it.
  const onScan = useCallback(
    async (code) => {
      setCamera(false);
      try {
        const res = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
        if (staff) setStockFor(res.data.data.product);
        else setQ(res.data.data.product.name);
      } catch (e) {
        if (e.response?.status === 404 && staff) {
          dispatch(toast('info', `Barcode ${code} is new. Add it as a product.`));
          navigate(`/products/new?barcode=${encodeURIComponent(code)}`);
        } else {
          dispatch(toast('error', e.response?.status === 404 ? `No product has barcode ${code}` : errorMessage(e)));
        }
      }
    },
    [dispatch, navigate, staff]
  );
  useBarcodeScanner(onScan, { enabled: !stockFor && !camera });

  const deactivate = async (p) => {
    if (!window.confirm(`Deactivate “${p.name}”? It disappears from the POS but old invoices keep it.`)) return;
    try {
      await api.delete(`/products/${p._id}`);
      dispatch(toast('success', 'Product deactivated'));
      reload();
    } catch (e) {
      dispatch(toast('error', errorMessage(e)));
    }
  };

  const products = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search name, SKU or barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-[12rem]" value={category} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowStock} onChange={(e) => setParam('lowStock', e.target.checked ? 'true' : '')} />
          Low stock only
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setCamera(true)}>📷 Scan</Button>
          {staff && (
            <Link to="/products/new" className="inline-flex items-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              + Add product
            </Link>
          )}
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <Card className="overflow-x-auto p-0">
        {loading && !data ? (
          <Spinner className="m-6" />
        ) : products.length === 0 ? (
          <EmptyState title="No products found" hint={staff ? 'Add your first product, or scan a barcode.' : undefined} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Barcode</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">GST</th>
                <th className="px-3 py-2 text-right">Stock</th>
                {staff && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p._id} className={p.isActive ? '' : 'opacity-50'}>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {p.name} {!p.isActive && <Badge>inactive</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">{p.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{p.barcode ?? '–'}</td>
                  <td className="px-3 py-2 text-slate-500">{p.category}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(p.sellingPricePaise)}</td>
                  <td className="px-3 py-2 text-right">{p.gstRate}%</td>
                  <td className="px-3 py-2 text-right">
                    <Badge color={p.stockQty <= 0 ? 'red' : p.isLowStock ? 'amber' : 'green'}>
                      {p.stockQty} {p.unit}
                    </Badge>
                  </td>
                  {staff && (
                    <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setStockFor(p)}>Stock</Button>
                      <Link to={`/products/${p._id}`} className="inline-block rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Edit</Link>
                      {p.isActive && <Button size="sm" variant="ghost" onClick={() => deactivate(p)}>Deactivate</Button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pagination page={page} totalPages={data?.meta?.totalPages} onChange={(n) => setParam('page', String(n))} />

      {stockFor && <StockModal product={stockFor} onClose={() => setStockFor(null)} onChanged={reload} />}
      {camera && <CameraScanner onClose={() => setCamera(false)} onScan={onScan} />}
    </div>
  );
}