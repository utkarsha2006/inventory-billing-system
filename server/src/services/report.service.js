import { Invoice, CreditNote, Customer, Supplier, Product, ProductBatch } from '../models/index.js';
import { istYmd } from '../utils/financialYear.js';
import { mulDiv } from '../utils/money.js';
import { addDays, eachDay, eachMonth, periodRange, resolvePeriod } from '../utils/period.js';
import { fromMilli } from '../utils/quantity.js';
import { collectShopAlerts } from './alert.service.js';
import { C, makeReport, oid, sumRows } from './reportKit.js';

const TZ = '+05:30';

// Groups by IST calendar day or month, whatever the server's timezone.
const bucketExpr = (field, granularity) => ({
  $dateToString: { format: granularity === 'month' ? '%Y-%m' : '%Y-%m-%d', date: `$${field}`, timezone: TZ },
});

// Profit margin in percent, from integer maths (basis points), 2 decimals.
function marginPct(profitPaise, revenuePaise) {
  if (revenuePaise <= 0) return null;
  const bp = mulDiv(Math.abs(profitPaise), 10000, revenuePaise);
  return (profitPaise < 0 ? -bp : bp) / 100;
}

// ---------------------------------------------------------------------------
// Sales (invoices minus credit notes), per IST day or month. Zero-filled for charts.
// ---------------------------------------------------------------------------
const TOTAL_FIELDS = [
  'subtotalPaise',
  'itemDiscountPaise',
  'billDiscountPaise',
  'taxablePaise',
  'cgstPaise',
  'sgstPaise',
  'igstPaise',
  'grandTotalPaise',
];

const groupByBucket = (field, granularity) => ({
  $group: {
    _id: bucketExpr(field, granularity),
    count: { $sum: 1 },
    ...Object.fromEntries(TOTAL_FIELDS.map((k) => [k, { $sum: `$totals.${k}` }])),
  },
});

export async function salesRows(shopId, period, granularity) {
  const { start, end } = periodRange(period);
  const sid = oid(shopId);

  const [sales, returns] = await Promise.all([
    Invoice.aggregate([
      { $match: { shopId: sid, status: 'COMPLETED', invoiceDate: { $gte: start, $lte: end } } },
      groupByBucket('invoiceDate', granularity),
    ]),
    CreditNote.aggregate([
      { $match: { shopId: sid, creditNoteDate: { $gte: start, $lte: end } } },
      groupByBucket('creditNoteDate', granularity),
    ]),
  ]);

  const soldBy = new Map(sales.map((r) => [r._id, r]));
  const returnedBy = new Map(returns.map((r) => [r._id, r]));
  const keys = granularity === 'month' ? eachMonth(period.from, period.to) : eachDay(period.from, period.to);

  return keys.map((key) => {
    const s = soldBy.get(key) ?? {};
    const r = returnedBy.get(key) ?? {};
    return {
      period: key,
      invoices: s.count ?? 0,
      grossPaise: s.subtotalPaise ?? 0,
      discountPaise: (s.itemDiscountPaise ?? 0) + (s.billDiscountPaise ?? 0),
      taxablePaise: s.taxablePaise ?? 0,
      taxPaise: (s.cgstPaise ?? 0) + (s.sgstPaise ?? 0) + (s.igstPaise ?? 0),
      salesPaise: s.grandTotalPaise ?? 0,
      creditNotes: r.count ?? 0,
      returnsPaise: r.grandTotalPaise ?? 0,
      netTaxablePaise: (s.taxablePaise ?? 0) - (r.taxablePaise ?? 0),
      netSalesPaise: (s.grandTotalPaise ?? 0) - (r.grandTotalPaise ?? 0),
    };
  });
}

const SALES_KEYS = [
  'invoices',
  'grossPaise',
  'discountPaise',
  'taxablePaise',
  'taxPaise',
  'salesPaise',
  'creditNotes',
  'returnsPaise',
  'netTaxablePaise',
  'netSalesPaise',
];

export async function salesReport(shopId, query, granularity) {
  const period = resolvePeriod(query);
  const rows = await salesRows(shopId, period, granularity);
  const totals = sumRows(rows, SALES_KEYS);

  const columns = [
    granularity === 'month' ? C.text('period', 'Month') : C.date('period', 'Date'),
    C.int('invoices', 'Invoices'),
    C.money('grossPaise', 'Gross (before discount)'),
    C.money('discountPaise', 'Discount'),
    C.money('taxablePaise', 'Taxable value'),
    C.money('taxPaise', 'GST'),
    C.money('salesPaise', 'Sales (incl. GST)'),
    C.int('creditNotes', 'Credit notes'),
    C.money('returnsPaise', 'Returns (incl. GST)'),
    C.money('netTaxablePaise', 'Net taxable'),
    C.money('netSalesPaise', 'Net sales (incl. GST)'),
  ];

  return makeReport({
    title: granularity === 'month' ? 'Monthly sales' : 'Daily sales',
    period,
    summary: totals,
    sheets: [{ key: 'sales', name: 'Sales', columns, rows, totals }],
  });
}

// ---------------------------------------------------------------------------
// Top-selling products
// ---------------------------------------------------------------------------
export async function topProductRows(shopId, period, { limit = 10, sortBy = 'revenue' } = {}) {
  const { start, end } = periodRange(period);
  const sid = oid(shopId);

  const [sold, back] = await Promise.all([
    Invoice.aggregate([
      { $match: { shopId: sid, status: 'COMPLETED', invoiceDate: { $gte: start, $lte: end } } },
      { $sort: { invoiceDate: -1 } }, // so $first below is the most recent name
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          sku: { $first: '$items.sku' },
          unit: { $first: '$items.unit' },
          qtyMilli: { $sum: '$items.qtyMilli' },
          taxablePaise: { $sum: '$items.taxablePaise' },
          timesSold: { $sum: 1 },
        },
      },
    ]).allowDiskUse(true),
    CreditNote.aggregate([
      { $match: { shopId: sid, creditNoteDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', qtyMilli: { $sum: '$items.qtyMilli' }, taxablePaise: { $sum: '$items.taxablePaise' } } },
    ]),
  ]);

  const returned = new Map(back.map((b) => [String(b._id), b]));
  const metric = sortBy === 'qty' ? 'netQtyMilli' : 'netRevenuePaise';

  return sold
    .map((s) => {
      const r = returned.get(String(s._id)) ?? { qtyMilli: 0, taxablePaise: 0 };
      return {
        productId: s._id,
        sku: s.sku,
        name: s.name,
        unit: s.unit,
        qtySold: fromMilli(s.qtyMilli),
        qtyReturned: fromMilli(r.qtyMilli),
        netQty: fromMilli(s.qtyMilli - r.qtyMilli),
        netQtyMilli: s.qtyMilli - r.qtyMilli,
        revenuePaise: s.taxablePaise,
        returnedPaise: r.taxablePaise,
        netRevenuePaise: s.taxablePaise - r.taxablePaise,
        timesSold: s.timesSold,
      };
    })
    .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ netQtyMilli, ...row }, i) => ({ rank: i + 1, ...row }));
}

export async function topProductsReport(shopId, query) {
  const period = resolvePeriod(query);
  const rows = await topProductRows(shopId, period, { limit: query.limit, sortBy: query.sortBy });
  const columns = [
    C.int('rank', '#'),
    C.text('sku', 'SKU'),
    C.text('name', 'Product', 30),
    C.text('unit', 'Unit'),
    C.qty('qtySold', 'Qty sold'),
    C.qty('qtyReturned', 'Qty returned'),
    C.qty('netQty', 'Net qty'),
    C.money('revenuePaise', 'Taxable sales'),
    C.money('returnedPaise', 'Returned (taxable)'),
    C.money('netRevenuePaise', 'Net taxable sales'),
    C.int('timesSold', 'Times sold'),
  ];
  return makeReport({ title: 'Top-selling products', period, sheets: [{ key: 'products', name: 'Top products', columns, rows }] });
}

// ---------------------------------------------------------------------------
// Profit = net taxable sales - cost of goods sold. Returned goods that went back on the shelf
// reverse their cost; goods that did not (damaged) stay a cost, so they reduce profit.
// ---------------------------------------------------------------------------
async function profitBuckets(shopId, period, groupBy) {
  const { start, end } = periodRange(period);
  const sid = oid(shopId);

  const pipeline = (match, dateField) => [
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: groupBy === 'product' ? '$items.productId' : bucketExpr(dateField, groupBy),
        sku: { $first: '$items.sku' },
        name: { $first: '$items.name' },
        revenuePaise: { $sum: '$items.taxablePaise' },
        costPaise: { $sum: '$items.costPaise' },
      },
    },
  ];

  const [sold, back] = await Promise.all([
    Invoice.aggregate(pipeline({ shopId: sid, status: 'COMPLETED', invoiceDate: { $gte: start, $lte: end } }, 'invoiceDate')),
    CreditNote.aggregate(pipeline({ shopId: sid, creditNoteDate: { $gte: start, $lte: end } }, 'creditNoteDate')),
  ]);
  return { sold, back };
}

export async function profitReport(shopId, query) {
  const period = resolvePeriod(query);
  const { groupBy } = query;
  const { sold, back } = await profitBuckets(shopId, period, groupBy);

  const soldBy = new Map(sold.map((r) => [String(r._id), r]));
  const backBy = new Map(back.map((r) => [String(r._id), r]));

  const keys =
    groupBy === 'day'
      ? eachDay(period.from, period.to)
      : groupBy === 'month'
        ? eachMonth(period.from, period.to)
        : [...new Set([...soldBy.keys(), ...backBy.keys()])];

  let rows = keys.map((key) => {
    const s = soldBy.get(key) ?? { revenuePaise: 0, costPaise: 0 };
    const b = backBy.get(key) ?? { revenuePaise: 0, costPaise: 0 };
    const revenuePaise = s.revenuePaise - b.revenuePaise;
    const costPaise = s.costPaise - b.costPaise;
    const profitPaise = revenuePaise - costPaise;
    return {
      period: key,
      sku: s.sku ?? b.sku,
      name: s.name ?? b.name,
      revenuePaise,
      costPaise,
      profitPaise,
      marginPct: marginPct(profitPaise, revenuePaise),
    };
  });

  if (groupBy === 'product') {
    rows = rows.sort((a, b) => b.profitPaise - a.profitPaise || (a.name ?? '').localeCompare(b.name ?? '')).slice(0, query.limit);
  }

  const totals = sumRows(rows, ['revenuePaise', 'costPaise', 'profitPaise']);
  totals.marginPct = marginPct(totals.profitPaise, totals.revenuePaise);

  const money = [
    C.money('revenuePaise', 'Net taxable sales'),
    C.money('costPaise', 'Cost of goods'),
    C.money('profitPaise', 'Profit'),
    C.pct('marginPct', 'Margin %'),
  ];
  const columns =
    groupBy === 'product'
      ? [C.text('sku', 'SKU'), C.text('name', 'Product', 30), ...money]
      : [groupBy === 'month' ? C.text('period', 'Month') : C.date('period', 'Date'), ...money];

  return makeReport({
    title: `Profit by ${groupBy}`,
    period,
    summary: totals,
    warnings: ['Cost is the purchase cost recorded when each sale was made. Excludes GST where input tax credit is claimed.'],
    sheets: [{ key: 'profit', name: 'Profit', columns, rows, totals }],
  });
}

// ---------------------------------------------------------------------------
// Stock valuation (as of now). Batch products are valued batch by batch at each batch's own cost.
// ---------------------------------------------------------------------------
export async function stockValuationReport(shopId, query, now = new Date()) {
  const filter = { shopId, isActive: true };
  if (query.category) filter.category = query.category;
  if (!query.includeZero) filter.stockMilli = { $gt: 0 };

  const products = await Product.find(filter)
    .sort({ category: 1, name: 1 })
    .select('sku name category unit stockMilli purchasePricePaise sellingPricePaise trackBatches')
    .lean();

  const batchProductIds = products.filter((p) => p.trackBatches).map((p) => p._id);
  const batches = batchProductIds.length
    ? await ProductBatch.find({ shopId, productId: { $in: batchProductIds }, qtyRemainingMilli: { $gt: 0 } })
        .select('productId qtyRemainingMilli purchasePricePaise')
        .lean()
    : [];
  const batchesOf = new Map();
  for (const b of batches) {
    const list = batchesOf.get(String(b.productId)) ?? [];
    list.push(b);
    batchesOf.set(String(b.productId), list);
  }

  const rows = products.map((p) => {
    const costValuePaise = p.trackBatches
      ? (batchesOf.get(String(p._id)) ?? []).reduce((a, b) => a + mulDiv(b.qtyRemainingMilli, b.purchasePricePaise, 1000), 0)
      : mulDiv(p.stockMilli, p.purchasePricePaise, 1000);
    return {
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      stockQty: fromMilli(p.stockMilli),
      unitCostPaise: p.stockMilli > 0 ? mulDiv(costValuePaise, 1000, p.stockMilli) : 0,
      costValuePaise,
      retailValuePaise: mulDiv(p.stockMilli, p.sellingPricePaise, 1000), // at the selling price as entered
    };
  });

  const byCategory = new Map();
  for (const r of rows) {
    const c = byCategory.get(r.category) ?? { category: r.category, items: 0, costValuePaise: 0, retailValuePaise: 0 };
    c.items += 1;
    c.costValuePaise += r.costValuePaise;
    c.retailValuePaise += r.retailValuePaise;
    byCategory.set(r.category, c);
  }

  const totals = sumRows(rows, ['costValuePaise', 'retailValuePaise']);
  const asOf = istYmd(now);
  const columns = [
    C.text('sku', 'SKU'),
    C.text('name', 'Product', 30),
    C.text('category', 'Category'),
    C.text('unit', 'Unit'),
    C.qty('stockQty', 'In stock'),
    C.money('unitCostPaise', 'Avg unit cost'),
    C.money('costValuePaise', 'Value at cost'),
    C.money('retailValuePaise', 'Value at selling price'),
  ];

  return makeReport({
    title: 'Stock valuation',
    asOf,
    fileStamp: asOf,
    summary: {
      items: rows.length,
      totalCostPaise: totals.costValuePaise,
      totalRetailPaise: totals.retailValuePaise,
      byCategory: [...byCategory.values()],
    },
    sheets: [{ key: 'stock', name: 'Stock valuation', columns, rows, totals }],
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function collectionsByMode(shopId, ymd) {
  const { start, end } = periodRange({ from: ymd, to: ymd });
  const within = { $gte: start, $lte: end };
  const rows = await Invoice.aggregate([
    { $match: { shopId: oid(shopId), 'payments.receivedAt': within } },
    { $unwind: '$payments' },
    { $match: { 'payments.receivedAt': within, 'payments.mode': { $ne: 'CREDIT' } } }, // credit is not money received
    { $group: { _id: '$payments.mode', amountPaise: { $sum: '$payments.amountPaise' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ mode: r._id, amountPaise: r.amountPaise }));
}

const owedTotal = async (Model, shopId) => {
  const [r] = await Model.aggregate([
    { $match: { shopId: oid(shopId), outstandingPaise: { $gt: 0 } } },
    { $group: { _id: null, totalPaise: { $sum: '$outstandingPaise' }, parties: { $sum: 1 } } },
  ]);
  return { totalPaise: r?.totalPaise ?? 0, parties: r?.parties ?? 0 };
};

export async function dashboardSummary(shopId, now = new Date()) {
  const today = istYmd(now);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [dayRows, monthRows, weekRows, receivable, payable, collections, topProducts, alerts] = await Promise.all([
    salesRows(shopId, { from: today, to: today }, 'day'),
    salesRows(shopId, { from: monthStart, to: today }, 'month'),
    salesRows(shopId, { from: addDays(today, -6), to: today }, 'day'),
    owedTotal(Customer, shopId),
    owedTotal(Supplier, shopId),
    collectionsByMode(shopId, today),
    topProductRows(shopId, { from: monthStart, to: today }, { limit: 5, sortBy: 'revenue' }),
    collectShopAlerts(shopId, { now, limit: 1 }),
  ]);

  const pick = (r) => ({ invoices: r.invoices, salesPaise: r.salesPaise, returnsPaise: r.returnsPaise, netSalesPaise: r.netSalesPaise });

  return {
    asOf: today,
    today: pick(dayRows[0]),
    month: pick(monthRows[0]),
    last7Days: weekRows.map((r) => ({ date: r.period, salesPaise: r.salesPaise, netSalesPaise: r.netSalesPaise })),
    collectionsToday: collections,
    receivables: { totalPaise: receivable.totalPaise, customers: receivable.parties },
    payables: { totalPaise: payable.totalPaise, suppliers: payable.parties },
    alerts: {
      lowStockCount: alerts.lowStockCount,
      outOfStockCount: alerts.outOfStockCount,
      expiringCount: alerts.expiringCount,
    },
    topProducts,
  };
}