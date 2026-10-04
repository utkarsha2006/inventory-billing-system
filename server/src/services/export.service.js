import ExcelJS from 'exceljs';
import { ApiError } from '../utils/ApiError.js';
import { paiseToNumber, sheetToCsv, ymdToDmy } from '../utils/csv.js';

const NUM_FORMAT = { money: '#,##0.00', int: '0', qty: '0.###', percent: '0.##' };

function pickSheet(report, table) {
  if (report.sheets.length === 1 && !table) return report.sheets[0];
  const sheet = report.sheets.find((s) => s.key === table);
  if (!sheet) {
    throw ApiError.badRequest(table ? `Unknown table "${table}"` : 'This report has several tables. Choose one with ?table=', [
      { path: 'table', message: `Available: ${report.sheets.map((s) => s.key).join(', ')}` },
    ]);
  }
  return sheet;
}

function cellValue(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'money') return paiseToNumber(value);
  if (type === 'date') return ymdToDmy(value);
  return value; // text is written as a string cell, never as a formula
}

const tabName = (name) => name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

export async function reportToXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventory & Billing';
  wb.created = new Date();
  wb.title = report.title;

  for (const sheet of report.sheets) {
    const ws = wb.addWorksheet(tabName(sheet.name), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
    ws.getRow(1).font = { bold: true };

    const styled = (row) => {
      sheet.columns.forEach((c, i) => {
        if (NUM_FORMAT[c.type]) row.getCell(i + 1).numFmt = NUM_FORMAT[c.type];
      });
      return row;
    };

    for (const row of sheet.rows) {
      styled(ws.addRow(Object.fromEntries(sheet.columns.map((c) => [c.key, cellValue(row[c.key], c.type)]))));
    }
    if (sheet.totals) {
      const values = Object.fromEntries(
        sheet.columns.map((c, i) => [c.key, sheet.totals[c.key] === undefined ? (i === 0 ? 'Total' : null) : cellValue(sheet.totals[c.key], c.type)])
      );
      styled(ws.addRow(values)).font = { bold: true };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function sendReport(res, report, { format = 'json', table } = {}, name = 'report') {
  if (format === 'json') {
    return res.json({ success: true, data: report });
  }

  if (format === 'csv') {
    const sheet = pickSheet(report, table);
    const base = `${name}${report.sheets.length > 1 ? `-${sheet.key}` : ''}_${report.fileStamp}`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}.csv"`,
      'Cache-Control': 'private, no-store',
    });
    return res.send(sheetToCsv(sheet));
  }

  const buffer = await reportToXlsx(report);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${name}_${report.fileStamp}.xlsx"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'private, no-store',
  });
  return res.send(buffer);
}