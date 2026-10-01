import { hasPermission } from '../config/permissions.js';
import { fromMilli } from '../utils/quantity.js';

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });

export function presentProduct(doc, role) {
  const { stockMilli, reorderMilli, ...rest } = plain(doc);
  const out = {
    ...rest,
    stockQty: fromMilli(stockMilli),
    reorderLevel: fromMilli(reorderMilli),
    isLowStock: stockMilli <= reorderMilli,
  };
  if (!hasPermission(role, 'cost:view')) delete out.purchasePricePaise;
  return out;
}

export function presentBatch(doc, role) {
  const { qtyRemainingMilli, initialQtyMilli, ...rest } = plain(doc);
  const out = {
    ...rest,
    qtyRemaining: fromMilli(qtyRemainingMilli),
    initialQty: fromMilli(initialQtyMilli),
  };
  if (!hasPermission(role, 'cost:view')) delete out.purchasePricePaise;
  return out;
}

export function presentMovement(doc) {
  const { qtyChangeMilli, qtyBeforeMilli, qtyAfterMilli, ...rest } = plain(doc);
  return {
    ...rest,
    qtyChange: fromMilli(qtyChangeMilli),
    qtyBefore: fromMilli(qtyBeforeMilli),
    qtyAfter: fromMilli(qtyAfterMilli),
  };
}

// Converts milli-quantities to decimals and strips cost data for roles without `cost:view`.
export function presentInvoice(doc, role) {
  const out = plain(doc);
  const canSeeCost = hasPermission(role, 'cost:view');

  if (out.items) {
    out.items = out.items.map(({ qtyMilli, costPaise, batches, ...rest }) => ({
      ...rest,
      qty: fromMilli(qtyMilli),
      ...(canSeeCost && { costPaise }),
      ...(batches && {
        batches: batches.map(({ qtyMilli: q, costPaise: c, ...b }) => ({
          ...b,
          qty: fromMilli(q),
          ...(canSeeCost && { costPaise: c }),
        })),
      }),
    }));
  }
  return out;
}