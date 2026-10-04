import { createSlice, nanoid } from '@reduxjs/toolkit';
import { logout } from '../auth/authSlice.js';

export const POS_STORAGE_KEY = 'pos.bill.v1';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? nanoid(24)).replace(/[^A-Za-z0-9_-]/g, '');

const blank = () => ({
  lines: [],
  customer: null,
  billDiscount: { mode: 'amount', value: '' },
  placeOfSupply: '',
  payments: [{ mode: 'CASH', amount: '', reference: '' }],
  notes: '',
  requestId: newId(),
});

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(POS_STORAGE_KEY) ?? 'null');
    return saved && Array.isArray(saved.lines) ? { ...blank(), ...saved } : blank();
  } catch {
    return blank();
  }
}

// ANY change to the bill gets a fresh idempotency key. The server replays the ORIGINAL invoice for a
// repeated key, so a key must only ever be reused for an identical retry.
const touch = (state) => {
  state.requestId = newId();
};

const bumpQty = (text, delta) => {
  const n = Number(text);
  const next = Math.round(((Number.isFinite(n) ? n : 0) + delta) * 1000) / 1000;
  return next > 0 ? String(next) : null;
};

const slice = createSlice({
  name: 'pos',
  initialState: load,
  reducers: {
    addProduct(state, { payload: p }) {
      const existing = state.lines.find((l) => l.productId === p._id);
      if (existing) {
        existing.qtyText = bumpQty(existing.qtyText, 1) ?? '1';
      } else {
        state.lines.push({
          productId: p._id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          pricePaise: p.sellingPricePaise,
          stockQty: p.stockQty,
          qtyText: '1',
          priceText: '', // empty = the product's own price
          discountText: '',
        });
      }
      touch(state);
    },
    setQtyText(state, { payload: { productId, text } }) {
      const line = state.lines.find((l) => l.productId === productId);
      if (line) line.qtyText = text;
      touch(state);
    },
    stepQty(state, { payload: { productId, delta } }) {
      const line = state.lines.find((l) => l.productId === productId);
      const next = line && bumpQty(line.qtyText, delta);
      if (next) line.qtyText = next;
      touch(state);
    },
    setLineField(state, { payload: { productId, field, text } }) {
      const line = state.lines.find((l) => l.productId === productId);
      if (line && (field === 'priceText' || field === 'discountText')) line[field] = text;
      touch(state);
    },
    removeLine(state, { payload: productId }) {
      state.lines = state.lines.filter((l) => l.productId !== productId);
      touch(state);
    },
    setCustomer(state, { payload }) {
      state.customer = payload;
      touch(state);
    },
    setBillDiscount(state, { payload }) {
      state.billDiscount = { ...state.billDiscount, ...payload };
      touch(state);
    },
    setPlaceOfSupply(state, { payload }) {
      state.placeOfSupply = payload;
      touch(state);
    },
    setPayments(state, { payload }) {
      state.payments = payload;
      touch(state);
    },
    setNotes(state, { payload }) {
      state.notes = payload;
      touch(state);
    },
    clearBill: () => blank(),
  },
  extraReducers: (builder) => {
    builder.addCase(logout.fulfilled, () => blank());
  },
});

export const {
  addProduct,
  setQtyText,
  stepQty,
  setLineField,
  removeLine,
  setCustomer,
  setBillDiscount,
  setPlaceOfSupply,
  setPayments,
  setNotes,
  clearBill,
} = slice.actions;
export default slice.reducer;