import { ApiError } from './ApiError.js';
import { istYmd } from './financialYear.js';

const IST = '+05:30';
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;

const utc = (ymd) => Date.parse(`${ymd}T00:00:00Z`); // calendar arithmetic on YYYY-MM-DD labels, no timezone involved

export const addDays = (ymd, n) => new Date(utc(ymd) + n * DAY_MS).toISOString().slice(0, 10);

// Defaults to month-to-date (IST). `from`/`to` are IST calendar dates, both inclusive.
export function resolvePeriod({ from, to } = {}, now = new Date()) {
  const end = to ?? istYmd(now);
  const start = from ?? `${end.slice(0, 7)}-01`;
  if (start > end) throw ApiError.badRequest('"from" must not be after "to"');
  if ((utc(end) - utc(start)) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw ApiError.badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from: start, to: end };
}

// The exact instants covered: 00:00:00.000 IST of `from` to 23:59:59.999 IST of `to`.
export const periodRange = ({ from, to }) => ({
  start: new Date(`${from}T00:00:00.000${IST}`),
  end: new Date(`${to}T23:59:59.999${IST}`),
});

export function eachDay(from, to) {
  const out = [];
  for (let t = utc(from); t <= utc(to); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function eachMonth(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ey, em] = to.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}