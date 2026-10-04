import { Shop, Invoice, CreditNote, Purchase } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { istYmd } from '../utils/financialYear.js';
import { classifyB2C, computeSetOff, uqcOf } from '../utils/gstr.js';
import { periodRange, resolvePeriod } from '../utils/period.js';
import { fromMilli } from '../utils/quantity.js';
import { stateLabel } from '../pdf/helpers.js';
import { C, makeReport, oid, sumRows } from './reportKit.js';

const DISCLAIMER = 'Working summary to help you prepare the return. Check it against the GST portal or with your accountant before filing.';

async function requireRegularShop(shopId) {
  const shop = await Shop.findById(shopId).select('gstRegistrationType').lean();
  if (!shop) throw ApiError.notFound('Shop not found');
  if (shop.gstRegistrationType !== 'REGULAR') {
    throw ApiError.conflict(
      'GST return reports are for regular taxpayers. Composition dealers file CMP-08, and unregistered shops file no GST returns.'
    );
  }
}

const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const addInto = (bucket, it, sign = 1) => {
  bucket.taxable += sign * it.taxablePaise;
  bucket.igst += sign * it.igstPaise;
  bucket.cgst += sign * it.cgstPaise;
  bucket.sgst += sign * it.sgstPaise;
};

// Taxable (rate > 0) amounts of a document's items, grouped by GST rate. 0% lines belong to Table 8.
function ratesOf(items) {
  const byRate = new Map();
  for (const it of items) {
    if (it.gstRate === 0) continue;
    const bucket = byRate.get(it.gstRate) ?? zero();
    addInto(bucket, it);
    byRate.set(it.gstRate, bucket);
  }
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]);
}

const ITEM_FIELDS =
  'items.hsnCode items.unit items.qtyMilli items.gstRate items.taxablePaise items.cgstPaise items.sgstPaise items.igstPaise items.lineTotalPaise';

async function loadOutward(shopId, period) {
  const { start, end } = periodRange(period);

  const invoices = await Invoice.find({
    shopId,
    status: 'COMPLETED',
    documentType: 'TAX_INVOICE',
    invoiceDate: { $gte: start, $lte: end },
  })
    .select(`invoiceNo invoiceDate invoiceType supplyType placeOfSupplyStateCode customerSnapshot totals.grandTotalPaise ${ITEM_FIELDS}`)
    .sort({ invoiceDate: 1, seq: 1 })
    .lean();

  const notes = await CreditNote.find({
    shopId,
    originalDocumentType: 'TAX_INVOICE',
    creditNoteDate: { $gte: start, $lte: end },
  })
    .select(
      `creditNoteNo creditNoteDate invoiceId invoiceNo originalInvoiceDate invoiceType supplyType placeOfSupplyStateCode customerSnapshot totals.grandTotalPaise taxReductionBarred ${ITEM_FIELDS}`
    )
    .sort({ creditNoteDate: 1, seq: 1 })
    .lean();

  // A credit note for an inter-state B2C sale follows its original invoice: B2CL or B2CS.
  const ids = notes.filter((n) => n.invoiceType === 'B2C' && n.supplyType === 'INTER').map((n) => n.invoiceId);
  const originals = ids.length ? await Invoice.find({ _id: { $in: ids } }).select('totals.grandTotalPaise').lean() : [];
  const originalValue = new Map(originals.map((o) => [String(o._id), o.totals.grandTotalPaise]));

  return { invoices, notes, originalValue };
}

const invoiceSegment = (inv) =>
  inv.invoiceType === 'B2B' ? 'B2B' : classifyB2C({ supplyType: inv.supplyType, grandTotalPaise: inv.totals.grandTotalPaise });

const noteSegment = (note, originalValue) =>
  note.invoiceType === 'B2B'
    ? 'B2B'
    : classifyB2C({ supplyType: note.supplyType, grandTotalPaise: originalValue.get(String(note.invoiceId)) ?? 0 });

function addB2cs(map, state, ratePct, v, sign) {
  const key = `${state}|${ratePct}`;
  const row = map.get(key) ?? { state, ratePct, taxablePaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0 };
  row.taxablePaise += sign * v.taxable;
  row.igstPaise += sign * v.igst;
  row.cgstPaise += sign * v.cgst;
  row.sgstPaise += sign * v.sgst;
  map.set(key, row);
}

function addHsn(map, segment, it, sign) {
  const hsnCode = it.hsnCode ?? '';
  const uqc = uqcOf(it.unit);
  const key = `${segment}|${hsnCode}|${uqc}|${it.gstRate}`;
  const row =
    map.get(key) ?? { segment, hsnCode, uqc, ratePct: it.gstRate, qtyMilli: 0, totalValuePaise: 0, taxablePaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0 };
  row.qtyMilli += sign * it.qtyMilli;
  row.totalValuePaise += sign * it.lineTotalPaise;
  row.taxablePaise += sign * it.taxablePaise;
  row.igstPaise += sign * it.igstPaise;
  row.cgstPaise += sign * it.cgstPaise;
  row.sgstPaise += sign * it.sgstPaise;
  map.set(key, row);
}

const nonZero = (r) => r.taxablePaise || r.igstPaise || r.cgstPaise || r.sgstPaise;

/**
 * Single pass over the period's invoices and credit notes. GSTR-1, the HSN summary and GSTR-3B all
 * read from this one result, so they can never disagree with each other.
 */
async function buildOutwardTables(shopId, period) {
  const { invoices, notes, originalValue } = await loadOutward(shopId, period);

  const tables = { b2b: [], b2cl: [], cdnr: [], cdnur: [], barred: [] };
  const b2cs = new Map();
  const hsn = new Map();
  const nil = { 'INTER|B2B': 0, 'INTRA|B2B': 0, 'INTER|B2C': 0, 'INTRA|B2C': 0 };
  const net = zero(); // GSTR-3B 3.1(a): taxable outward supplies, net of credit notes
  const interUnreg = new Map(); // GSTR-3B 3.2: inter-state supplies to unregistered persons, by state
  const b2csInvoices = new Set();
  const b2csNotes = new Set();
  let missingHsn = 0;

  const addNet = (doc, it, sign) => {
    if (it.gstRate === 0) return;
    addInto(net, it, sign);
    if (doc.invoiceType === 'B2C' && doc.supplyType === 'INTER') {
      const bucket = interUnreg.get(doc.placeOfSupplyStateCode) ?? zero();
      addInto(bucket, it, sign);
      interUnreg.set(doc.placeOfSupplyStateCode, bucket);
    }
  };

  for (const inv of invoices) {
    const segment = invoiceSegment(inv);
    const customer = inv.customerSnapshot ?? {};
    const common = {
      invoiceNo: inv.invoiceNo,
      invoiceDate: istYmd(inv.invoiceDate),
      invoiceValuePaise: inv.totals.grandTotalPaise,
      placeOfSupply: stateLabel(inv.placeOfSupplyStateCode),
    };

    for (const [ratePct, v] of ratesOf(inv.items)) {
      const amounts = { ratePct, taxablePaise: v.taxable, igstPaise: v.igst, cgstPaise: v.cgst, sgstPaise: v.sgst, cessPaise: 0 };
      if (segment === 'B2B') {
        tables.b2b.push({ gstin: customer.gstin, receiverName: customer.name, ...common, reverseCharge: 'N', invoiceType: 'Regular', ...amounts });
      } else if (segment === 'B2CL') {
        tables.b2cl.push({ ...common, ...amounts });
      } else {
        addB2cs(b2cs, inv.placeOfSupplyStateCode, ratePct, v, 1);
        b2csInvoices.add(inv.invoiceNo);
      }
    }

    for (const it of inv.items) {
      if (!it.hsnCode) missingHsn += 1;
      addHsn(hsn, inv.invoiceType === 'B2B' ? 'B2B' : 'B2C', it, 1);
      if (it.gstRate === 0) nil[`${inv.supplyType}|${inv.invoiceType}`] += it.taxablePaise;
      addNet(inv, it, 1);
    }
  }

  for (const note of notes) {
    // Past the Section 34 deadline the tax can no longer be reduced: keep it out of every figure.
    if (note.taxReductionBarred) {
      tables.barred.push({
        noteNo: note.creditNoteNo,
        noteDate: istYmd(note.creditNoteDate),
        invoiceNo: note.invoiceNo,
        noteValuePaise: note.totals.grandTotalPaise,
        taxablePaise: note.items.reduce((a, it) => a + it.taxablePaise, 0),
        igstPaise: note.items.reduce((a, it) => a + it.igstPaise, 0),
        cgstPaise: note.items.reduce((a, it) => a + it.cgstPaise, 0),
        sgstPaise: note.items.reduce((a, it) => a + it.sgstPaise, 0),
      });
      continue;
    }

    const segment = noteSegment(note, originalValue);
    const customer = note.customerSnapshot ?? {};
    const common = {
      noteNo: note.creditNoteNo,
      noteDate: istYmd(note.creditNoteDate),
      noteType: 'C',
      originalInvoiceNo: note.invoiceNo,
      originalInvoiceDate: istYmd(note.originalInvoiceDate),
      placeOfSupply: stateLabel(note.placeOfSupplyStateCode),
      noteValuePaise: note.totals.grandTotalPaise,
    };

    for (const [ratePct, v] of ratesOf(note.items)) {
      const amounts = { ratePct, taxablePaise: v.taxable, igstPaise: v.igst, cgstPaise: v.cgst, sgstPaise: v.sgst, cessPaise: 0 };
      if (segment === 'B2B') {
        tables.cdnr.push({ gstin: customer.gstin, receiverName: customer.name, ...common, reverseCharge: 'N', ...amounts });
      } else if (segment === 'B2CL') {
        tables.cdnur.push({ urType: 'B2CL', ...common, ...amounts });
      } else {
        addB2cs(b2cs, note.placeOfSupplyStateCode, ratePct, v, -1); // small B2C returns net off Table 7
        b2csNotes.add(note.creditNoteNo);
      }
    }

    for (const it of note.items) {
      addHsn(hsn, note.invoiceType === 'B2B' ? 'B2B' : 'B2C', it, -1);
      if (it.gstRate === 0) nil[`${note.supplyType}|${note.invoiceType}`] -= it.taxablePaise;
      addNet(note, it, -1);
    }
  }

  const b2csRows = [...b2cs.values()]
    .filter(nonZero)
    .sort((a, b) => a.state.localeCompare(b.state) || a.ratePct - b.ratePct)
    .map(({ state, ...r }) => ({ type: 'OE', placeOfSupply: stateLabel(state), ...r, cessPaise: 0 }));

  const hsnRows = (segment) =>
    [...hsn.values()]
      .filter((r) => r.segment === segment && (r.qtyMilli || r.totalValuePaise || r.taxablePaise))
      .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.ratePct - b.ratePct)
      .map(({ segment: _segment, qtyMilli, ...r }) => ({ ...r, quantity: fromMilli(qtyMilli), cessPaise: 0 }));

  const nilRows = [
    { description: 'Inter-State supplies to registered persons', nilRatedPaise: nil['INTER|B2B'], exemptedPaise: 0, nonGstPaise: 0 },
    { description: 'Intra-State supplies to registered persons', nilRatedPaise: nil['INTRA|B2B'], exemptedPaise: 0, nonGstPaise: 0 },
    { description: 'Inter-State supplies to unregistered persons', nilRatedPaise: nil['INTER|B2C'], exemptedPaise: 0, nonGstPaise: 0 },
    { description: 'Intra-State supplies to unregistered persons', nilRatedPaise: nil['INTRA|B2C'], exemptedPaise: 0, nonGstPaise: 0 },
  ];

  const warnings = [DISCLAIMER];
  if (missingHsn > 0) warnings.push(`${missingHsn} invoice line(s) have no HSN code. HSN is mandatory for B2B supplies.`);
  if (tables.barred.length > 0) {
    warnings.push(
      `${tables.barred.length} credit note(s) were issued after the Section 34 deadline and are excluded from the tax figures (see the Excluded notes table).`
    );
  }
  warnings.push('All 0% supplies are shown as nil-rated. Split out exempted and non-GST supplies yourself if you have any.');

  return {
    tables: { ...tables, b2cs: b2csRows, nil: nilRows, hsnB2b: hsnRows('B2B'), hsnB2c: hsnRows('B2C') },
    counts: {
      b2b: new Set(tables.b2b.map((r) => r.invoiceNo)).size,
      b2cl: new Set(tables.b2cl.map((r) => r.invoiceNo)).size,
      b2cs: b2csInvoices.size,
      cdnr: new Set(tables.cdnr.map((r) => r.noteNo)).size,
      cdnur: new Set(tables.cdnur.map((r) => r.noteNo)).size,
    },
    net,
    nilTotal: Object.values(nil).reduce((a, b) => a + b, 0),
    interUnreg,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Column sets
// ---------------------------------------------------------------------------
const AMT_KEYS = ['taxablePaise', 'igstPaise', 'cgstPaise', 'sgstPaise', 'cessPaise'];
const amountCols = [
  C.pct('ratePct', 'Rate %'),
  C.money('taxablePaise', 'Taxable value'),
  C.money('igstPaise', 'IGST'),
  C.money('cgstPaise', 'CGST'),
  C.money('sgstPaise', 'SGST'),
  C.money('cessPaise', 'Cess'),
];
const sheet = (key, name, columns, rows, totalKeys) => ({
  key,
  name,
  columns,
  rows,
  ...(totalKeys && rows.length > 0 && { totals: sumRows(rows, totalKeys) }),
});

function hsnSheets(tables) {
  const columns = [
    C.text('hsnCode', 'HSN', 12),
    C.text('uqc', 'UQC'),
    C.qty('quantity', 'Total quantity'),
    C.money('totalValuePaise', 'Total value'),
    ...amountCols,
  ];
  const totalKeys = ['totalValuePaise', ...AMT_KEYS];
  return [
    sheet('hsn_b2b', 'HSN-B2B', columns, tables.hsnB2b, totalKeys),
    sheet('hsn_b2c', 'HSN-B2C', columns, tables.hsnB2c, totalKeys),
  ];
}

// ---------------------------------------------------------------------------
// GSTR-1 (outward supplies)
// ---------------------------------------------------------------------------
export async function gstr1Report(shopId, query) {
  await requireRegularShop(shopId);
  const period = resolvePeriod(query);
  const { tables, counts, net, nilTotal, warnings } = await buildOutwardTables(shopId, period);

  const sumOf = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
  const line = (table, description, documents, rows) => ({
    table,
    description,
    documents,
    taxablePaise: sumOf(rows, 'taxablePaise'),
    igstPaise: sumOf(rows, 'igstPaise'),
    cgstPaise: sumOf(rows, 'cgstPaise'),
    sgstPaise: sumOf(rows, 'sgstPaise'),
  });

  const summaryRows = [
    line('4', 'B2B invoices (registered buyers)', counts.b2b, tables.b2b),
    line('5', 'B2C large invoices (inter-state, above Rs 1 lakh)', counts.b2cl, tables.b2cl),
    line('7', 'B2C small (net of credit notes)', counts.b2cs, tables.b2cs),
    { table: '8', description: 'Nil-rated supplies (0% GST)', taxablePaise: nilTotal, igstPaise: 0, cgstPaise: 0, sgstPaise: 0 },
    line('9B', 'Credit notes to registered buyers', counts.cdnr, tables.cdnr),
    line('9B', 'Credit notes to unregistered buyers (large B2C)', counts.cdnur, tables.cdnur),
  ];

  const recipient = [C.text('gstin', 'GSTIN/UIN of recipient', 20), C.text('receiverName', 'Receiver name', 24)];
  const invoiceCols = [
    C.text('invoiceNo', 'Invoice number', 18),
    C.date('invoiceDate', 'Invoice date'),
    C.money('invoiceValuePaise', 'Invoice value'),
    C.text('placeOfSupply', 'Place of supply', 22),
  ];
  const noteCols = [
    C.text('noteNo', 'Note number', 18),
    C.date('noteDate', 'Note date'),
    C.text('noteType', 'Note type'),
    C.text('originalInvoiceNo', 'Against invoice', 18),
    C.date('originalInvoiceDate', 'Invoice date'),
    C.text('placeOfSupply', 'Place of supply', 22),
    C.money('noteValuePaise', 'Note value'),
  ];

  const sheets = [
    {
      key: 'summary',
      name: 'Summary',
      columns: [
        C.text('table', 'Table'),
        C.text('description', 'Description', 46),
        C.int('documents', 'Documents'),
        C.money('taxablePaise', 'Taxable value'),
        C.money('igstPaise', 'IGST'),
        C.money('cgstPaise', 'CGST'),
        C.money('sgstPaise', 'SGST'),
      ],
      rows: summaryRows,
    },
    sheet('b2b', 'B2B', [...recipient, ...invoiceCols, C.text('reverseCharge', 'Reverse charge'), C.text('invoiceType', 'Invoice type'), ...amountCols], tables.b2b, AMT_KEYS),
    sheet('b2cl', 'B2CL', [...invoiceCols, ...amountCols], tables.b2cl, AMT_KEYS),
    sheet('b2cs', 'B2CS', [C.text('type', 'Type'), C.text('placeOfSupply', 'Place of supply', 22), ...amountCols], tables.b2cs, AMT_KEYS),
    sheet('cdnr', 'CDNR', [...recipient, ...noteCols, C.text('reverseCharge', 'Reverse charge'), ...amountCols], tables.cdnr, AMT_KEYS),
    sheet('cdnur', 'CDNUR', [C.text('urType', 'UR type'), ...noteCols, ...amountCols], tables.cdnur, AMT_KEYS),
    sheet(
      'nil_exempt',
      'Nil-Exempt',
      [C.text('description', 'Description', 46), C.money('nilRatedPaise', 'Nil rated'), C.money('exemptedPaise', 'Exempted'), C.money('nonGstPaise', 'Non-GST')],
      tables.nil,
      ['nilRatedPaise', 'exemptedPaise', 'nonGstPaise']
    ),
    ...hsnSheets(tables),
  ];

  if (tables.barred.length > 0) {
    sheets.push(
      sheet(
        'excluded',
        'Excluded notes',
        [
          C.text('noteNo', 'Note number', 18),
          C.date('noteDate', 'Note date'),
          C.text('invoiceNo', 'Against invoice', 18),
          C.money('noteValuePaise', 'Note value'),
          C.money('taxablePaise', 'Taxable value'),
          C.money('igstPaise', 'IGST'),
          C.money('cgstPaise', 'CGST'),
          C.money('sgstPaise', 'SGST'),
        ],
        tables.barred
      )
    );
  }

  return makeReport({
    title: 'GSTR-1 summary',
    period,
    summary: { netTaxablePaise: net.taxable, netIgstPaise: net.igst, netCgstPaise: net.cgst, netSgstPaise: net.sgst, nilRatedPaise: nilTotal },
    warnings,
    sheets,
  });
}

// ---------------------------------------------------------------------------
// HSN-wise summary (Table 12, split into B2B and B2C)
// ---------------------------------------------------------------------------
export async function hsnSummaryReport(shopId, query) {
  await requireRegularShop(shopId);
  const period = resolvePeriod(query);
  const { tables, warnings } = await buildOutwardTables(shopId, period);
  return makeReport({ title: 'HSN-wise summary of outward supplies', period, warnings, sheets: hsnSheets(tables) });
}

// ---------------------------------------------------------------------------
// GSTR-3B (output tax vs input tax)
// ---------------------------------------------------------------------------
export async function gstr3bReport(shopId, query) {
  await requireRegularShop(shopId);
  const period = resolvePeriod(query);
  const { start, end } = periodRange(period);
  const { net, nilTotal, interUnreg, warnings } = await buildOutwardTables(shopId, period);

  const [itc] = await Purchase.aggregate([
    { $match: { shopId: oid(shopId), itcEligible: true, purchaseDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        igst: { $sum: '$totals.igstPaise' },
        cgst: { $sum: '$totals.cgstPaise' },
        sgst: { $sum: '$totals.sgstPaise' },
      },
    },
  ]);
  const itcAvailable = { igst: itc?.igst ?? 0, cgst: itc?.cgst ?? 0, sgst: itc?.sgst ?? 0 };

  // Credit notes can exceed sales in a period. A negative liability is carried, not paid out.
  const liability = { igst: Math.max(net.igst, 0), cgst: Math.max(net.cgst, 0), sgst: Math.max(net.sgst, 0) };
  if (net.igst < 0 || net.cgst < 0 || net.sgst < 0) {
    warnings.push('Credit notes exceed sales for at least one tax head in this period. The excess is not refunded here; adjust it in a later period.');
  }
  warnings.push('Only input tax from purchases in this period is counted. Opening ITC balance, reversals and reverse-charge purchases are not included.');

  const { cashPayable, creditCarriedForward, utilised } = computeSetOff(liability, itcAvailable);
  const paidThroughItc = {
    igst: utilised.igst.igst + utilised.cgst.igst + utilised.sgst.igst,
    cgst: utilised.igst.cgst + utilised.cgst.cgst,
    sgst: utilised.igst.sgst + utilised.sgst.sgst,
  };

  const heads = (section, description, v) => ({
    section,
    description,
    igstPaise: v.igst,
    cgstPaise: v.cgst,
    sgstPaise: v.sgst,
    cessPaise: 0,
  });

  const rows = [
    {
      section: '3.1(a)',
      description: 'Outward taxable supplies (other than zero rated, nil rated and exempted)',
      taxablePaise: net.taxable,
      igstPaise: net.igst,
      cgstPaise: net.cgst,
      sgstPaise: net.sgst,
      cessPaise: 0,
    },
    { section: '3.1(c)', description: 'Other outward supplies (nil rated, exempted)', taxablePaise: nilTotal, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, cessPaise: 0 },
    ...[...interUnreg.entries()]
      .filter(([, v]) => v.taxable || v.igst)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([state, v]) => ({
        section: '3.2',
        description: `Inter-state supplies to unregistered persons - ${stateLabel(state)}`,
        taxablePaise: v.taxable,
        igstPaise: v.igst,
        cgstPaise: 0,
        sgstPaise: 0,
        cessPaise: 0,
      })),
    heads('4A(5)', 'ITC available: all other ITC (purchases from regular suppliers)', itcAvailable),
    heads('6.1', 'Tax payable (output tax, net of credit notes)', liability),
    heads('6.1', 'Paid through ITC', paidThroughItc),
    heads('6.1', 'Paid in cash', cashPayable),
    heads('ITC', 'ITC balance carried forward', creditCarriedForward),
  ];

  const toPaise = (v) => ({ igstPaise: v.igst, cgstPaise: v.cgst, sgstPaise: v.sgst });

  return makeReport({
    title: 'GSTR-3B summary',
    period,
    summary: {
      outputTax: toPaise(liability),
      itcAvailable: toPaise(itcAvailable),
      paidThroughItc: toPaise(paidThroughItc),
      cashPayable: toPaise(cashPayable),
      carryForwardItc: toPaise(creditCarriedForward),
    },
    warnings,
    sheets: [
      {
        key: 'gstr3b',
        name: 'GSTR-3B',
        columns: [
          C.text('section', 'Table'),
          C.text('description', 'Description', 60),
          C.money('taxablePaise', 'Taxable value'),
          C.money('igstPaise', 'IGST'),
          C.money('cgstPaise', 'CGST'),
          C.money('sgstPaise', 'SGST'),
          C.money('cessPaise', 'Cess'),
        ],
        rows,
      },
    ],
  });
}