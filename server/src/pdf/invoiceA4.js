import { amountInWords } from '../utils/numberToWords.js';
import { fmtAmount, fmtDateIST, fmtTimeIST, fmtQty, stateLabel } from './helpers.js';

const C = { ink: '#111827', muted: '#6b7280', line: '#d1d5db', head: '#f3f4f6', dark: '#111827', white: '#ffffff' };
const M = 36;

// `doc` must be created with { size: 'A4', margin: 36, bufferPages: true }.
export function renderInvoiceA4(doc, inv, f) {
  const W = doc.page.width - 2 * M;
  const taxable = inv.documentType === 'TAX_INVOICE';
  const inter = inv.supplyType === 'INTER';
  const shop = inv.shopSnapshot ?? {};
  const cust = inv.customerSnapshot ?? {};
  const totals = inv.totals;
  const s = f.safe;
  const bottom = () => doc.page.height - M - 16;
  let y = M;

  // --- drawing helpers: always explicit coordinates, heights measured before drawing ---
  const setFont = (font, size, color = C.ink) => doc.font(font).fontSize(size).fillColor(color);
  const heightOf = (str, width, font = f.regular, size = 9) => {
    setFont(font, size);
    return doc.heightOfString(s(str), { width });
  };
  const put = (str, x, yy, width, o = {}) => {
    const { font = f.regular, size = 9, color = C.ink, align = 'left', oneLine = false } = o;
    setFont(font, size, color);
    doc.text(s(str), x, yy, { width, align, ...(oneLine && { height: size * 1.3, ellipsis: true }) });
  };
  const hline = (yy, color = C.line) =>
    doc.moveTo(M, yy).lineTo(M + W, yy).lineWidth(0.5).strokeColor(color).stroke();
  const ensure = (h) => {
    if (y + h > bottom()) {
      doc.addPage();
      y = M;
    }
  };

  // Generic table: header row, wrapping cells, automatic page breaks (header repeats).
  const table = (cols, rows) => {
    let x = M;
    for (const c of cols) {
      c.x = x;
      x += c.w;
    }
    const head = () => {
      doc.rect(M, y, W, 18).fill(C.head);
      for (const c of cols) put(c.label, c.x + 3, y + 5, c.w - 6, { font: f.bold, size: 8, align: c.align, oneLine: true });
      y += 18;
      hline(y, C.muted);
    };

    ensure(42);
    head();
    for (const row of rows) {
      const cells = row.cells ?? row;
      const font = row.bold ? f.bold : f.regular;
      let h = 11;
      cols.forEach((c, i) => {
        if (c.wrap) h = Math.max(h, heightOf(cells[i], c.w - 6, font, 8.5));
      });
      h += 8;
      if (y + h > bottom()) {
        doc.addPage();
        y = M;
        head();
      }
      cols.forEach((c, i) =>
        put(cells[i], c.x + 3, y + 4, c.w - 6, { font, size: 8.5, align: c.align, oneLine: !c.wrap })
      );
      y += h;
      hline(y);
    }
  };

  // ---------------- Header ----------------
  const leftW = W * 0.64;
  // 1. the title line
  put(inv.docTitle ?? (taxable ? 'TAX INVOICE' : 'BILL OF SUPPLY'), M + leftW, y + 2, W - leftW, { font: f.bold, size: 15, align: 'right' });
  put(shop.name ?? '', M, y, leftW, { font: f.bold, size: 16 });
  let ly = y + heightOf(shop.name ?? '', leftW, f.bold, 16) + 2;

  const a = shop.address ?? {};
  const headLines = [
    shop.legalName && shop.legalName !== shop.name ? { t: shop.legalName } : null,
    { t: [a.line1, a.line2, [a.city, a.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ') },
    { t: [shop.phone && `Ph: ${shop.phone}`, shop.email].filter(Boolean).join('   ') },
    shop.gstin ? { t: `GSTIN: ${shop.gstin}`, bold: true } : null,
    shop.stateCode ? { t: `State: ${stateLabel(shop.stateCode)}` } : null,
  ].filter((l) => l && l.t);

  for (const l of headLines) {
    const font = l.bold ? f.bold : f.regular;
    put(l.t, M, ly, leftW, { font, size: 8.5, color: l.bold ? C.ink : C.muted });
    ly += heightOf(l.t, leftW, font, 8.5) + 1;
  }
  if (shop.gstRegistrationType === 'COMPOSITION') {
    const note = 'Composition taxable person, not eligible to collect tax on supplies';
    put(note, M, ly + 2, leftW, { font: f.bold, size: 8 });
    ly += heightOf(note, leftW, f.bold, 8) + 4;
  }

  y = Math.max(ly, y + 24) + 6;
  hline(y);
  y += 8;

  // ---------------- Bill To / invoice details ----------------
  const half = W / 2 - 8;
  const rx = M + W / 2 + 8;

  let by = y;
  put('BILL TO', M, by, half, { font: f.bold, size: 7.5, color: C.muted });
  by += 11;
  const billLines = cust.name
    ? [
        { t: cust.name, bold: true, size: 10 },
        { t: cust.address },
        { t: cust.phone && `Ph: ${cust.phone}` },
        { t: cust.gstin && `GSTIN: ${cust.gstin}`, bold: true },
        { t: cust.stateCode && `State: ${stateLabel(cust.stateCode)}` },
      ]
    : [{ t: 'Walk-in customer', bold: true, size: 10 }];
  for (const l of billLines) {
    if (!l.t) continue;
    const font = l.bold ? f.bold : f.regular;
    const size = l.size ?? 8.5;
    put(l.t, M, by, half, { font, size });
    by += heightOf(l.t, half, font, size) + 1.5;
  }

  let my = y;
  put('INVOICE DETAILS', rx, my, half, { font: f.bold, size: 7.5, color: C.muted });
  my += 11;
  // 2. the `pairs` array
  const pairs = [
    [inv.docTitle ? 'Credit Note No' : 'Invoice No', inv.invoiceNo],
    ['Date', `${fmtDateIST(inv.invoiceDate)}  ${fmtTimeIST(inv.invoiceDate)}`],
    ['Place of Supply', stateLabel(inv.placeOfSupplyStateCode)],
    ...(taxable ? [['Reverse Charge', 'No']] : []),
    inv.refLine ? ['Against Invoice', inv.refLine] : ['Payment', inv.paymentStatus],
  ];
  for (const [k, v] of pairs) {
    put(k, rx, my, 84, { size: 8.5, color: C.muted });
    put(v, rx + 86, my, half - 86, { font: f.bold, size: 9 });
    my += Math.max(heightOf(v, half - 86, f.bold, 9), 11) + 2;
  }
  y = Math.max(by, my) + 8;

  // ---------------- Items ----------------
  const rupee = f.rupee;
  const amountLabel = `Amount (${rupee})`;
  const itemCols = taxable
    ? [
        { label: '#', w: 20 },
        { label: 'Description', w: 150, wrap: true },
        { label: 'HSN', w: 46 },
        { label: 'Qty', w: 52, align: 'right' },
        { label: 'Rate', w: 54, align: 'right' },
        { label: 'Disc.', w: 44, align: 'right' },
        { label: 'Taxable', w: 58, align: 'right' },
        { label: 'GST', w: 28, align: 'right' },
        { label: amountLabel, w: 71, align: 'right' },
      ]
    : [
        { label: '#', w: 24 },
        { label: 'Description', w: 197, wrap: true },
        { label: 'HSN', w: 56 },
        { label: 'Qty', w: 66, align: 'right' },
        { label: 'Rate', w: 62, align: 'right' },
        { label: 'Disc.', w: 52, align: 'right' },
        { label: amountLabel, w: 66, align: 'right' },
      ];

  let anyInclusive = false;
  const itemRows = inv.items.map((it, i) => {
    const disc = it.discountPaise + it.billDiscountSharePaise;
    const incl = it.priceIncludesGst && it.gstRate > 0;
    if (incl) anyInclusive = true;
    const desc = [it.name, ...(it.batches ?? []).map((b) => `Batch ${b.batchNo} - Exp ${fmtDateIST(b.expiryDate)}`)].join('\n');
    const base = [
      String(i + 1),
      desc,
      it.hsnCode || '-',
      `${fmtQty(it.qtyMilli)} ${it.unit ?? ''}`.trim(),
      `${fmtAmount(it.unitPricePaise)}${incl ? '*' : ''}`,
      disc > 0 ? fmtAmount(disc) : '-',
    ];
    return taxable
      ? [...base, fmtAmount(it.taxablePaise), `${it.gstRate}%`, fmtAmount(it.lineTotalPaise)]
      : [...base, fmtAmount(it.lineTotalPaise)];
  });
  table(itemCols, itemRows);

  if (anyInclusive) {
    y += 3;
    put('* Rate includes GST', M, y, W, { size: 7.5, color: C.muted });
    y += 11;
  }

  // ---------------- Words + payments (left), totals (right) ----------------
  ensure(170);
  y += 8;
  const colL = W * 0.5 - 10;
  const colRX = M + W * 0.5 + 10;
  const colRW = W * 0.5 - 10;

  let wy = y;
  put('AMOUNT IN WORDS', M, wy, colL, { font: f.bold, size: 7.5, color: C.muted });
  wy += 11;
  const words = amountInWords(totals.grandTotalPaise);
  put(words, M, wy, colL, { font: f.bold, size: 9 });
  wy += heightOf(words, colL, f.bold, 9) + 8;

  // 3. the payments heading
  put(inv.paymentsLabel ?? 'PAYMENT', M, wy, colL, { font: f.bold, size: 7.5, color: C.muted });
  wy += 11;
  for (const p of inv.payments ?? []) {
    put(`${p.mode}${p.reference ? ` (${p.reference})` : ''}`, M, wy, colL * 0.6, { size: 8.5, oneLine: true });
    put(fmtAmount(p.amountPaise), M + colL * 0.6, wy, colL * 0.4, { size: 8.5, align: 'right' });
    wy += 12;
  }
  if (inv.balanceDuePaise > 0) {
    put('Balance due', M, wy + 2, colL * 0.6, { font: f.bold, size: 9 });
    put(fmtAmount(inv.balanceDuePaise), M + colL * 0.6, wy + 2, colL * 0.4, { font: f.bold, size: 9, align: 'right' });
    wy += 16;
  }

  let ry = y;
  const trow = (label, value) => {
    put(label, colRX, ry, colRW * 0.55, { size: 9 });
    put(value, colRX + colRW * 0.55, ry, colRW * 0.45, { size: 9, align: 'right' });
    ry += 15;
  };
  const discount = totals.itemDiscountPaise + totals.billDiscountPaise;
  trow(taxable ? 'Taxable Value' : 'Sub Total', fmtAmount(totals.taxablePaise));
  if (discount > 0) trow('Discount (already applied)', fmtAmount(discount));
  if (taxable) {
    if (totals.cgstPaise > 0 || totals.sgstPaise > 0) {
      trow('CGST', fmtAmount(totals.cgstPaise));
      trow('SGST', fmtAmount(totals.sgstPaise));
    }
    if (totals.igstPaise > 0) trow('IGST', fmtAmount(totals.igstPaise));
  }
  if (totals.roundOffPaise !== 0) trow('Round Off', fmtAmount(totals.roundOffPaise));

  doc.rect(colRX, ry + 2, colRW, 24).fill(C.dark);
  put('GRAND TOTAL', colRX + 8, ry + 9, colRW * 0.4, { font: f.bold, size: 9, color: C.white });
  put(`${rupee} ${fmtAmount(totals.grandTotalPaise)}`, colRX + colRW * 0.4, ry + 8, colRW * 0.6 - 8, {
    font: f.bold,
    size: 12,
    color: C.white,
    align: 'right',
    oneLine: true,
  });
  ry += 30;
  y = Math.max(wy, ry) + 10;

  // ---------------- HSN-wise tax breakup ----------------
  if (taxable && inv.taxSummary?.length) {
    ensure(70);
    put('TAX BREAKUP (HSN-WISE)', M, y, W, { font: f.bold, size: 7.5, color: C.muted });
    y += 11;

    const sum = (key) => inv.taxSummary.reduce((acc, t) => acc + t[key], 0);
    if (inter) {
      table(
        [
          { label: 'HSN', w: 150 },
          { label: 'Taxable Value', w: 120, align: 'right' },
          { label: 'IGST Rate', w: 80, align: 'right' },
          { label: 'IGST Amount', w: 90, align: 'right' },
          { label: 'Total Tax', w: 83, align: 'right' },
        ],
        [
          ...inv.taxSummary.map((t) => [
            t.hsnCode || '-',
            fmtAmount(t.taxablePaise),
            `${t.gstRate}%`,
            fmtAmount(t.igstPaise),
            fmtAmount(t.igstPaise),
          ]),
          { bold: true, cells: ['Total', fmtAmount(sum('taxablePaise')), '', fmtAmount(sum('igstPaise')), fmtAmount(sum('igstPaise'))] },
        ]
      );
    } else {
      table(
        [
          { label: 'HSN', w: 90 },
          { label: 'Taxable Value', w: 90, align: 'right' },
          { label: 'CGST Rate', w: 50, align: 'right' },
          { label: 'CGST Amt', w: 70, align: 'right' },
          { label: 'SGST Rate', w: 50, align: 'right' },
          { label: 'SGST Amt', w: 70, align: 'right' },
          { label: 'Total Tax', w: 103, align: 'right' },
        ],
        [
          ...inv.taxSummary.map((t) => [
            t.hsnCode || '-',
            fmtAmount(t.taxablePaise),
            `${t.gstRate / 2}%`,
            fmtAmount(t.cgstPaise),
            `${t.gstRate / 2}%`,
            fmtAmount(t.sgstPaise),
            fmtAmount(t.cgstPaise + t.sgstPaise),
          ]),
          {
            bold: true,
            cells: [
              'Total',
              fmtAmount(sum('taxablePaise')),
              '',
              fmtAmount(sum('cgstPaise')),
              '',
              fmtAmount(sum('sgstPaise')),
              fmtAmount(sum('cgstPaise') + sum('sgstPaise')),
            ],
          },
        ]
      );
    }
  }

  // ---------------- Footer / signature ----------------
  ensure(90);
  y += 12;
  hline(y);
  y += 8;
  const note = shop.footerNote || 'Thank you for your business!';
  put(note, M, y, W * 0.55, { size: 8.5, color: C.muted });
  const noteH = heightOf(note, W * 0.55, f.regular, 8.5);
  put('This is a computer-generated invoice.', M, y + noteH + 3, W * 0.55, { size: 7.5, color: C.muted });
  put(`For ${shop.name ?? ''}`, M + W * 0.6, y, W * 0.4, { font: f.bold, size: 9, align: 'right', oneLine: true });
  y += 46;
  doc.moveTo(M + W * 0.65, y).lineTo(M + W, y).lineWidth(0.5).strokeColor(C.muted).stroke();
  put('Authorised Signatory', M + W * 0.6, y + 3, W * 0.4, { size: 8, color: C.muted, align: 'right' });

  // ---------------- Page numbers ----------------
  const { start, count } = doc.bufferedPageRange();
  if (count > 1) {
    for (let i = start; i < start + count; i += 1) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would make PDFKit add a page, so zero it temporarily.
      const saved = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      put(`Page ${i - start + 1} of ${count}`, M, doc.page.height - 28, W, { size: 8, color: C.muted, align: 'center' });
      doc.page.margins.bottom = saved;
    }
  }
}