// Money is integer paise. Format with integer maths only: never divide to a float.
export function paiseToString(paise) {
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
export const paiseToNumber = (paise) => Number(paiseToString(paise)); // parses a string; no arithmetic

export function ymdToDmy(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

// Spreadsheets treat a cell starting with these characters as a formula. User-supplied text
// (product and customer names) must never be able to run as one.
const FORMULA_START = /^[=+\-@\t\r]/;

const quote = (text) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

// type: 'text' | 'int' | 'money' | 'qty' | 'percent' | 'date'
export function csvCell(value, type = 'text') {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
      return paiseToString(value);
    case 'date':
      return ymdToDmy(value);
    case 'int':
    case 'qty':
    case 'percent':
      return String(value); // numbers: a leading "-" is a sign, not a formula
    default: {
      const text = String(value);
      return quote(FORMULA_START.test(text) ? `'${text}` : text);
    }
  }
}

// UTF-8 BOM so Excel reads Devanagari and other non-ASCII names correctly; CRLF line endings.
export function sheetToCsv(sheet) {
  const lines = [sheet.columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of sheet.rows) lines.push(sheet.columns.map((c) => csvCell(row[c.key], c.type)).join(','));
  if (sheet.totals) {
    lines.push(
      sheet.columns
        .map((c, i) => (sheet.totals[c.key] === undefined ? (i === 0 ? 'Total' : '') : csvCell(sheet.totals[c.key], c.type)))
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}