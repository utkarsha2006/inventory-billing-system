import { FRACTIONAL_UNITS } from '../config/constants.js';
import { ApiError } from './ApiError.js';

// Quantities are stored as integer thousandths ("milli-units") to avoid float drift.
export const toMilli = (qty) => Math.round(qty * 1000);
export const fromMilli = (milli) => milli / 1000;

export const hasMaxThreeDecimals = (qty) => Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6;

export const isFractionalUnit = (unit) => FRACTIONAL_UNITS.includes(unit);

// Returns an error message, or null if the quantity is valid for the unit.
export function qtyProblem(unit, qty) {
  if (!hasMaxThreeDecimals(qty)) return 'Quantity can have at most 3 decimal places';
  if (!isFractionalUnit(unit) && !Number.isInteger(qty)) {
    return `Quantity must be a whole number for unit ${unit}`;
  }
  return null;
}

export function assertQtyForUnit(unit, qty, label = 'quantity') {
  const problem = qtyProblem(unit, qty);
  if (problem) throw ApiError.badRequest(`${label}: ${problem}`);
}