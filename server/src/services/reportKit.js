import mongoose from 'mongoose';

// Aggregation pipelines don't auto-cast ids like find() does.
export const oid = (id) => new mongoose.Types.ObjectId(id);

export function sumRows(rows, keys) {
  const totals = {};
  for (const key of keys) totals[key] = rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
  return totals;
}

// Column helpers. `type` drives CSV and Excel formatting; JSON keeps raw values (paise stay integers).
export const C = {
  text: (key, header, width) => ({ key, header, type: 'text', ...(width && { width }) }),
  date: (key, header) => ({ key, header, type: 'date' }), // value is an IST "YYYY-MM-DD"
  int: (key, header) => ({ key, header, type: 'int' }),
  money: (key, header) => ({ key, header, type: 'money' }), // value is integer paise
  qty: (key, header) => ({ key, header, type: 'qty' }),
  pct: (key, header) => ({ key, header, type: 'percent' }),
};

// sheet = { key, name, columns, rows, totals? }. `key` is used by ?table=, `name` is the Excel tab.
export function makeReport({ title, period, asOf, sheets, summary, warnings = [], fileStamp }) {
  return {
    title,
    period: period ?? null,
    asOf: asOf ?? null,
    generatedAt: new Date().toISOString(),
    fileStamp: fileStamp ?? `${period.from}_to_${period.to}`,
    summary: summary ?? null,
    warnings,
    sheets,
  };
}