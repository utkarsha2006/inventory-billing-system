const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

// Display only. Money stays integer paise everywhere else; never do arithmetic on these strings.
export const formatMoney = (paise) => INR.format((paise ?? 0) / 100);
export const formatNumber = (n) => NUM.format(n ?? 0);

export const paiseToInput = (paise) =>
  paise === null || paise === undefined ? '' : `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

// "99.5" -> 9950. String parsing only: parseFloat(x) * 100 gives 99.99999999999999-style errors.
export function parseMoney(text) {
  const t = String(text ?? '').trim();
  if (t === '') return { paise: 0, empty: true, valid: true };
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return { paise: 0, empty: false, valid: false };
  const [rupees, fraction = ''] = t.split('.');
  return { paise: Number(rupees) * 100 + Number(fraction.padEnd(2, '0')), empty: false, valid: true };
}

export const ymdToDmy = (ymd) => {
  const [y, m, d] = String(ymd).split('-');
  return `${d}/${m}/${y}`;
};

export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// IST calendar dates (the server groups and filters by IST days)
export const todayIst = () => new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
export const monthStartIst = () => `${todayIst().slice(0, 7)}-01`;