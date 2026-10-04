import { Alert, Button, EmptyState, cx } from '../../components/ui.jsx';
import { formatMoney, formatNumber, ymdToDmy } from '../../utils/format.js';

function Cell({ value, type }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-300">–</span>;
  switch (type) {
    case 'money':
      return formatMoney(value);
    case 'date':
      return ymdToDmy(value);
    case 'percent':
      return `${value}%`;
    case 'int':
    case 'qty':
      return formatNumber(value);
    default:
      return String(value); // React escapes it: names from the database can't inject markup
  }
}

const isNumeric = (type) => ['money', 'int', 'qty', 'percent'].includes(type);

// Renders any report from the Phase 7 API: { warnings, sheets: [{ key, name, columns, rows, totals }] }
export default function ReportViewer({ report, activeKey, onActiveChange }) {
  const sheet = report.sheets.find((s) => s.key === activeKey) ?? report.sheets[0];

  return (
    <div className="space-y-3">
      {report.warnings?.map((w) => (
        <Alert key={w} type="warn">
          {w}
        </Alert>
      ))}

      {report.sheets.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {report.sheets.map((s) => (
            <Button key={s.key} size="sm" variant={s.key === sheet.key ? 'primary' : 'secondary'} onClick={() => onActiveChange(s.key)}>
              {s.name}
              <span className="rounded bg-black/10 px-1.5 text-xs">{s.rows.length}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {sheet.rows.length === 0 ? (
          <EmptyState title="No data for this period" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {sheet.columns.map((c) => (
                  <th key={c.key} className={cx('whitespace-nowrap px-3 py-2', isNumeric(c.type) ? 'text-right' : 'text-left')}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheet.rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {sheet.columns.map((c) => (
                    <td key={c.key} className={cx('whitespace-nowrap px-3 py-1.5', isNumeric(c.type) && 'text-right tabular-nums')}>
                      <Cell value={row[c.key]} type={c.type} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {sheet.totals && (
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  {sheet.columns.map((c, i) => (
                    <td key={c.key} className={cx('whitespace-nowrap px-3 py-2', isNumeric(c.type) && 'text-right tabular-nums')}>
                      {sheet.totals[c.key] !== undefined ? <Cell value={sheet.totals[c.key]} type={c.type} /> : i === 0 ? 'Total' : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}