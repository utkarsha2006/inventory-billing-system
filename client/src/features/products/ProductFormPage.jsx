import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDispatch } from 'react-redux';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '../../components/ui.jsx';
import { FRACTIONAL_UNITS, GST_RATES, UNITS } from '../../utils/constants.js';
import { paiseToInput, parseMoney } from '../../utils/format.js';
import { toast } from '../ui/uiSlice.js';

const money = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an amount like 99.50');
const optionalMoney = z.string().trim().regex(/^(\d{1,9}(\.\d{1,2})?)?$/, 'Enter an amount like 99.50');
const optionalQty = z.string().trim().regex(/^(\d{1,7}(\.\d{1,3})?)?$/, 'Enter a number (up to 3 decimals)');

const schema = z
  .object({
    name: z.string().trim().min(1, 'Required').max(120),
    sku: z.string().trim().min(1, 'Required').max(40).regex(/^[A-Za-z0-9._\-/]+$/, 'Letters, digits and . _ - / only'),
    barcode: z.string().trim().regex(/^([A-Za-z0-9._\-/]{4,48})?$/, '4-48 characters: letters, digits and . _ - /'),
    hsnCode: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})?$/, 'HSN must be 4, 6 or 8 digits'),
    category: z.string().trim().max(60),
    unit: z.enum(UNITS),
    purchasePrice: optionalMoney,
    sellingPrice: money,
    mrp: optionalMoney,
    gstRate: z.enum(GST_RATES.map(String)),
    priceIncludesGst: z.boolean(),
    openingStock: optionalQty,
    reorderLevel: optionalQty,
    trackBatches: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    const selling = parseMoney(v.sellingPrice);
    const mrp = parseMoney(v.mrp);
    if (selling.valid && mrp.valid && !mrp.empty && selling.paise > mrp.paise) add('sellingPrice', 'Selling price cannot exceed the MRP');
    if (!FRACTIONAL_UNITS.includes(v.unit)) {
      if (v.openingStock.includes('.')) add('openingStock', `Whole numbers only for ${v.unit}`);
      if (v.reorderLevel.includes('.')) add('reorderLevel', `Whole numbers only for ${v.unit}`);
    }
    if (v.trackBatches && Number(v.openingStock) > 0) add('openingStock', 'For batch products, add stock as a batch after saving');
  });

const EMPTY = {
  name: '', sku: '', barcode: '', hsnCode: '', category: 'General', unit: 'PCS', purchasePrice: '', sellingPrice: '', mrp: '',
  gstRate: '5', priceIncludesGst: true, openingStock: '', reorderLevel: '', trackBatches: false,
};

export default function ProductFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(editing);
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { ...EMPTY, barcode: searchParams.get('barcode') ?? '' } });

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/products/${id}`)
      .then(({ data }) => {
        const p = data.data;
        reset({
          name: p.name, sku: p.sku, barcode: p.barcode ?? '', hsnCode: p.hsnCode ?? '', category: p.category, unit: p.unit,
          purchasePrice: paiseToInput(p.purchasePricePaise), sellingPrice: paiseToInput(p.sellingPricePaise), mrp: paiseToInput(p.mrpPaise),
          gstRate: String(p.gstRate), priceIncludesGst: p.priceIncludesGst, openingStock: '', reorderLevel: String(p.reorderLevel), trackBatches: p.trackBatches,
        });
      })
      .catch((e) => setServerError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [editing, id, reset]);

  const onSubmit = async (v) => {
    setBusy(true);
    setServerError(null);
    const body = {
      name: v.name,
      sku: v.sku,
      hsnCode: v.hsnCode || (editing ? null : undefined), // null clears it on edit
      barcode: v.barcode || (editing ? null : undefined),
      category: v.category || 'General',
      purchasePricePaise: parseMoney(v.purchasePrice).paise,
      sellingPricePaise: parseMoney(v.sellingPrice).paise,
      mrpPaise: v.mrp ? parseMoney(v.mrp).paise : editing ? null : undefined,
      gstRate: Number(v.gstRate),
      priceIncludesGst: v.priceIncludesGst,
      reorderLevel: Number(v.reorderLevel || 0),
      // unit, trackBatches and opening stock are fixed at creation
      ...(!editing && { unit: v.unit, trackBatches: v.trackBatches, openingStock: Number(v.openingStock || 0) }),
    };
    try {
      await (editing ? api.patch(`/products/${id}`, body) : api.post('/products', body));
      dispatch(toast('success', editing ? 'Product updated' : 'Product added'));
      navigate('/products');
    } catch (e) {
      setServerError(errorMessage(e));
      setBusy(false);
    }
  };

  if (loading) return <Spinner className="m-8" />;

  return (
    <Card className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{editing ? 'Edit product' : 'Add product'}</h1>
        <Link to="/products" className="text-sm text-slate-500">← Back</Link>
      </div>
      {serverError && <Alert type="error">{serverError}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
          <Input autoFocus invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="SKU" error={errors.sku?.message}>
          <Input className="uppercase" invalid={!!errors.sku} {...register('sku')} />
        </Field>
        <Field label="Barcode" error={errors.barcode?.message} hint="Click here and scan with a USB scanner">
          <Input invalid={!!errors.barcode} {...register('barcode')} />
        </Field>
        <Field label="HSN code" error={errors.hsnCode?.message} hint="4, 6 or 8 digits (required for B2B sales)">
          <Input inputMode="numeric" invalid={!!errors.hsnCode} {...register('hsnCode')} />
        </Field>
        <Field label="Category" error={errors.category?.message}>
          <Input {...register('category')} />
        </Field>
        <Field label="Unit" hint={editing ? 'Cannot be changed after creation' : undefined}>
          <Select disabled={editing} {...register('unit')}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="GST rate">
          <Select {...register('gstRate')}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase price (₹)" error={errors.purchasePrice?.message} hint="Cost per unit, excluding GST">
          <Input inputMode="decimal" invalid={!!errors.purchasePrice} {...register('purchasePrice')} />
        </Field>
        <Field label="Selling price (₹)" error={errors.sellingPrice?.message}>
          <Input inputMode="decimal" invalid={!!errors.sellingPrice} {...register('sellingPrice')} />
        </Field>
        <Field label="MRP (₹)" error={errors.mrp?.message} hint="Optional. You cannot sell above it.">
          <Input inputMode="decimal" invalid={!!errors.mrp} {...register('mrp')} />
        </Field>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" {...register('priceIncludesGst')} /> Selling price includes GST
        </label>
        {!editing && (
          <Field label="Opening stock" error={errors.openingStock?.message}>
            <Input inputMode="decimal" invalid={!!errors.openingStock} {...register('openingStock')} />
          </Field>
        )}
        <Field label="Reorder level" error={errors.reorderLevel?.message} hint="You get a low-stock alert at or below this">
          <Input inputMode="decimal" invalid={!!errors.reorderLevel} {...register('reorderLevel')} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" disabled={editing} {...register('trackBatches')} /> Track batches and expiry dates (food, medicines)
        </label>
        <Button type="submit" className="sm:col-span-2" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
        </Button>
      </form>
    </Card>
  );
}