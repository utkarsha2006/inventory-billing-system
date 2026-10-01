export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
});
export const ROLE_LIST = Object.values(ROLES);

export const GST_REGISTRATION_TYPES = ['REGULAR', 'COMPOSITION', 'UNREGISTERED'];

export const REFRESH_COOKIE = 'refreshToken';

// GST state codes. Phase 4 uses these for place-of-supply (CGST+SGST vs IGST).
export const STATE_CODES = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
});

// ---------- Phase 3 ----------
export const UNITS = ['PCS', 'KG', 'G', 'L', 'ML', 'M', 'BOX', 'PACK'];

// Only these units may have fractional quantities (up to 3 decimals).
export const FRACTIONAL_UNITS = ['KG', 'L', 'M'];

// GST 2.0 slabs (effective 22 Sep 2025). 3% is for gold/silver/jewellery.
// If the Council changes rates again, this is the only place to edit.
export const GST_RATES = [0, 3, 5, 18, 40];

export const STOCK_MOVEMENT_TYPES = [
  'OPENING',
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT',
  'DAMAGE',
  'EXPIRED',
  'CORRECTION',
];

// Types a user may pick in a manual stock adjustment.
export const MANUAL_ADJUSTMENT_TYPES = ['OPENING', 'ADJUSTMENT', 'DAMAGE', 'EXPIRED', 'CORRECTION'];

// ---------- Phase 4 ----------
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'CREDIT'];