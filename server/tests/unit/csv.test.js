import { paiseToString, paiseToNumber, csvCell, sheetToCsv } from '../../src/utils/csv.js';

describe('paiseToString', () => {
  test.each([
    [0, '0.00'],
    [5, '0.05'],
    [100, '1.00'],
    [123456, '1234.56'],
    [-5, '-0.05'],
    [-100, '-1.00'],
    [-123456, '-1234.56'],
  ])('%i -> %s', (paise, text) => {
    expect(paiseToString(paise)).toBe(text);
  });

  test('numeric form for Excel', () => {
    expect(paiseToNumber(123456)).toBe(1234.56);
  });
});

describe('csvCell', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvCell('Tea, Gold')).toBe('"Tea, Gold"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  test('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+91 98765 43210')).toBe("'+91 98765 43210");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@user')).toBe("'@user");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  test('numbers are not treated as formulas', () => {
    expect(csvCell(-1250, 'money')).toBe('-12.50');
    expect(csvCell(-3, 'int')).toBe('-3');
    expect(csvCell(1.5, 'qty')).toBe('1.5');
  });

  test('dates are DD/MM/YYYY; empty values are blank', () => {
    expect(csvCell('2026-10-02', 'date')).toBe('02/10/2026');
    expect(csvCell(undefined, 'money')).toBe('');
    expect(csvCell(null)).toBe('');
  });
});

describe('sheetToCsv', () => {
  const sheet = {
    columns: [
      { key: 'name', header: 'Name', type: 'text' },
      { key: 'amountPaise', header: 'Amount', type: 'money' },
    ],
    rows: [
      { name: 'A', amountPaise: 1050 },
      { name: 'B', amountPaise: 250 },
    ],
    totals: { amountPaise: 1300 },
  };

  test('BOM, CRLF, header, rows and a Total row', () => {
    const csv = sheetToCsv(sheet);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')).toEqual(['\uFEFFName,Amount', 'A,10.50', 'B,2.50', 'Total,13.00', '']);
  });
});