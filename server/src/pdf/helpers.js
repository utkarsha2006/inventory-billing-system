import { STATE_CODES } from '../config/constants.js';
import { fromMilli } from '../utils/quantity.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const two = (n) => String(n).padStart(2, '0');
const istDate = (value) => new Date(new Date(value).getTime() + IST_OFFSET_MS);

export function fmtDateIST(value) {
  const d = istDate(value);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function fmtTimeIST(value) {
  const d = istDate(value);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

const AMOUNT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 12345678 paise -> "1,23,456.78"
export const fmtAmount = (paise) => `${paise < 0 ? '-' : ''}${AMOUNT.format(Math.abs(paise) / 100)}`;

export const fmtQty = (qtyMilli) => String(fromMilli(qtyMilli));

export function stateLabel(code) {
  if (!code) return '';
  const name = STATE_CODES[code];
  return name ? `${code}-${name}` : code;
}

export const mmToPt = (mm) => (mm / 25.4) * 72;