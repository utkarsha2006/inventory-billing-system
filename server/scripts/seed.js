// Demo data for screenshots and local testing:  npm run seed
// Creates one fictional shop. The GSTIN is a format-valid TEST number, not a real business.
import crypto from 'node:crypto';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, Invoice } from '../src/models/index.js';
import * as auth from '../src/services/auth.service.js';
import * as userService from '../src/services/user.service.js';
import { createProduct } from '../src/services/product.service.js';
import { createSupplier } from '../src/services/supplier.service.js';
import { createCustomer } from '../src/services/customer.service.js';
import { createPurchase } from '../src/services/purchase.service.js';
import { createInvoice } from '../src/services/billing.service.js';
import { createReturn } from '../src/services/return.service.js';
import { gstinChecksum } from '../src/utils/gstin.js';
import { istYmd } from '../src/utils/financialYear.js';
import { addDays } from '../src/utils/period.js';

const PASSWORD = 'Demo@12345';
const OWNER_EMAIL = 'owner@demo.shop';

const gstinFor = (state, body) => {
  const base = `${state}${body}`;
  return base + gstinChecksum(base);
};

// Deterministic, so every run produces the same demo week.
let seed = 20261003;
const rnd = (n) => {
  seed = (seed * 48271) % 2147483647;
  return seed % n;
};
const pick = (list) => list[rnd(list.length)];

// Demo rates only. Check the real GST rate and HSN for your own goods.
const CATALOG = [
  { name: 'Basmati Rice 5 kg', sku: 'RICE-5KG', barcode: '8901000000011', hsnCode: '1006', category: 'Grocery', unit: 'PCS', purchasePricePaise: 42000, sellingPricePaise: 52500, mrpPaise: 55000, gstRate: 5, priceIncludesGst: true, openingStock: 40, reorderLevel: 10 },
  { name: 'Toor Dal 1 kg', sku: 'DAL-1KG', barcode: '8901000000028', hsnCode: '0713', category: 'Grocery', unit: 'PCS', purchasePricePaise: 14500, sellingPricePaise: 17500, mrpPaise: 18000, gstRate: 5, priceIncludesGst: true, openingStock: 60, reorderLevel: 15 },
  { name: 'Sugar (loose)', sku: 'SUGAR-KG', barcode: '8901000000035', hsnCode: '1701', category: 'Grocery', unit: 'KG', purchasePricePaise: 4000, sellingPricePaise: 4800, gstRate: 5, priceIncludesGst: true, openingStock: 80.5, reorderLevel: 20 },
  { name: 'Iodised Salt 1 kg', sku: 'SALT-1KG', barcode: '8901000000042', hsnCode: '2501', category: 'Grocery', unit: 'PCS', purchasePricePaise: 1800, sellingPricePaise: 2400, mrpPaise: 2500, gstRate: 0, priceIncludesGst: true, openingStock: 100, reorderLevel: 20 },
  { name: 'Tea Powder 250 g', sku: 'TEA-250G', barcode: '8901000000059', hsnCode: '0902', category: 'Beverages', unit: 'PCS', purchasePricePaise: 9500, sellingPricePaise: 12000, mrpPaise: 12500, gstRate: 5, priceIncludesGst: true, openingStock: 45, reorderLevel: 10 },
  { name: 'Family Pack Biscuits', sku: 'BISC-FAM', barcode: '8901000000066', hsnCode: '1905', category: 'Snacks', unit: 'PCS', purchasePricePaise: 2200, sellingPricePaise: 3000, mrpPaise: 3000, gstRate: 18, priceIncludesGst: true, openingStock: 120, reorderLevel: 30 },
  { name: 'Toothpaste 150 g', sku: 'TPASTE-150', barcode: '8901000000073', hsnCode: '3306', category: 'Personal care', unit: 'PCS', purchasePricePaise: 7000, sellingPricePaise: 9500, mrpPaise: 9900, gstRate: 18, priceIncludesGst: true, openingStock: 35, reorderLevel: 10 },
  { name: 'Bath Soap 100 g', sku: 'SOAP-100G', barcode: '8901000000080', hsnCode: '3401', category: 'Personal care', unit: 'PCS', purchasePricePaise: 2800, sellingPricePaise: 4000, mrpPaise: 4200, gstRate: 18, priceIncludesGst: true, openingStock: 3, reorderLevel: 12 }, // deliberately LOW: triggers the alert
  { name: 'Cooking Oil 1 L', sku: 'OIL-1L', barcode: '8901000000097', hsnCode: '1512', category: 'Grocery', unit: 'PCS', purchasePricePaise: 13500, sellingPricePaise: 16000, mrpPaise: 16500, gstRate: 5, priceIncludesGst: true, openingStock: 50, reorderLevel: 12 },
  { name: 'Curd 400 g', sku: 'CURD-400G', barcode: '8901000000103', hsnCode: '0403', category: 'Dairy', unit: 'PCS', purchasePricePaise: 3000, sellingPricePaise: 4000, mrpPaise: 4000, gstRate: 5, priceIncludesGst: true, openingStock: 0, reorderLevel: 20, trackBatches: true },
];

async function backdate(invoiceId, dayOffset) {
  if (dayOffset === 0) return;
  const when = new Date(Date.now() + dayOffset * 86_400_000 - rnd(8) * 3_600_000);
  await Invoice.updateOne({ _id: invoiceId }, { $set: { invoiceDate: when, 'payments.$[].receivedAt': when } });
}

async function main() {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed demo data into production. Re-run with --force if you really mean it.');
  }
  await connectDB();
  if (await User.exists({ email: OWNER_EMAIL })) {
    console.log(`Demo data already exists (${OWNER_EMAIL}). Drop the database to start over.`);
    return;
  }

  const { user: owner, shop } = await auth.registerShop(
    {
      shop: {
        name: 'Sharma General Store',
        legalName: 'Sharma Traders',
        stateCode: '27',
        gstRegistrationType: 'REGULAR',
        gstin: '27AAPFU0939F1ZV',
        address: { line1: 'Shop 4, Main Road', city: 'Pimpri', pincode: '411018' },
        phone: '9876543210',
      },
      owner: { name: 'Ravi Sharma', email: OWNER_EMAIL, password: PASSWORD },
    },
    { userAgent: 'seed', ip: '127.0.0.1' }
  );
  const shopId = String(shop._id);
  const ownerId = String(owner._id);
  const asOwner = { shopId, id: ownerId, role: 'OWNER' };

  await userService.createUser(shopId, { name: 'Meena Iyer', email: 'manager@demo.shop', password: PASSWORD, role: 'MANAGER' });
  await userService.createUser(shopId, { name: 'Anil Kumar', email: 'cashier@demo.shop', password: PASSWORD, role: 'CASHIER' });

  const products = {};
  for (const item of CATALOG) products[item.sku] = await createProduct(shopId, ownerId, item);

  // A supplier purchase: restocks three items and brings in two curd batches (one expires soon).
  const today = istYmd();
  const expiry = (days) => new Date(`${addDays(today, days)}T00:00:00.000Z`);
  const supplier = await createSupplier(shopId, {
    name: 'Metro Wholesale',
    gstin: gstinFor('27', 'ABCDE1234F1Z'),
    gstRegistrationType: 'REGULAR',
    stateCode: '27',
    phone: '9822000001',
  });
  const line = (sku, qty, unitCostPaise, extra = {}) => ({ productId: String(products[sku]._id), qty, unitCostPaise, discountPaise: 0, ...extra });
  await createPurchase(asOwner, {
    supplierId: String(supplier._id),
    supplierInvoiceNo: 'MW/2026/0412',
    purchaseDate: addDays(today, -3),
    pricesIncludeGst: false,
    items: [
      line('RICE-5KG', 20, 42000),
      line('TPASTE-150', 24, 7000),
      line('CURD-400G', 30, 3000, { batchNo: 'CURD-A', expiryDate: expiry(5) }),
      line('CURD-400G', 40, 3000, { batchNo: 'CURD-B', expiryDate: expiry(25) }),
    ],
    payments: [{ mode: 'UPI', amountPaise: 100000, reference: 'DEMO-UTR' }], // part-paid: shows up as a payable
  });

  const ramesh = await createCustomer(shopId, { name: 'Ramesh Patil', phone: '9876500001' });
  const karnataka = await createCustomer(shopId, {
    name: 'Karnataka Traders',
    phone: '9876500002',
    gstin: gstinFor('29', 'KLMNO1234P1Z'),
    stateCode: '29',
  });

  // A week of ordinary retail sales (soap is left alone so it stays low on stock).
  const sellable = Object.values(products).filter((p) => p.sku !== 'SOAP-100G');
  for (let day = -6; day <= 0; day += 1) {
    const bills = 2 + rnd(3);
    for (let b = 0; b < bills; b += 1) {
      const chosen = [...new Map(Array.from({ length: 1 + rnd(3) }, () => pick(sellable)).map((p) => [String(p._id), p])).values()];
      const { invoice } = await createInvoice(asOwner, {
        items: chosen.map((p) => ({ productId: String(p._id), qty: p.unit === 'KG' ? (1 + rnd(4)) / 2 : 1 + rnd(3), discountPaise: 0 })),
        billDiscountPaise: 0,
        clientRequestId: crypto.randomUUID(),
        payments: [{ mode: pick(['CASH', 'CASH', 'UPI', 'CARD']) }],
      });
      await backdate(invoice._id, day);
    }
  }

  // A credit sale, a B2B inter-state sale (IGST), and a return.
  await createInvoice(asOwner, {
    items: [{ productId: String(products['RICE-5KG']._id), qty: 1, discountPaise: 0 }, { productId: String(products['OIL-1L']._id), qty: 1, discountPaise: 0 }],
    billDiscountPaise: 0,
    customerId: String(ramesh._id),
    clientRequestId: crypto.randomUUID(),
    payments: [{ mode: 'CREDIT' }],
  });
  await createInvoice(asOwner, {
    items: [{ productId: String(products['RICE-5KG']._id), qty: 5, discountPaise: 0 }, { productId: String(products['BISC-FAM']._id), qty: 24, discountPaise: 0 }],
    billDiscountPaise: 0,
    customerId: String(karnataka._id),
    clientRequestId: crypto.randomUUID(),
    payments: [{ mode: 'UPI', reference: 'DEMO-B2B' }],
  });
  const { invoice: toReturn } = await createInvoice(asOwner, {
    items: [{ productId: String(products['TPASTE-150']._id), qty: 2, discountPaise: 0 }],
    billDiscountPaise: 0,
    clientRequestId: crypto.randomUUID(),
    payments: [{ mode: 'CASH' }],
  });
  await createReturn(asOwner, String(toReturn._id), {
    clientRequestId: crypto.randomUUID(),
    items: [{ invoiceItemId: String(toReturn.items[0]._id), qty: 1, restock: true }],
    refundMode: 'CASH',
    reason: 'Demo return',
  });

  console.log('\nDemo shop created.\n');
  console.log(`  Owner    ${OWNER_EMAIL}`);
  console.log('  Manager  manager@demo.shop');
  console.log('  Cashier  cashier@demo.shop');
  console.log(`  Password ${PASSWORD}\n`);
}

main()
  .then(() => disconnectDB())
  .catch(async (err) => {
    console.error(err);
    await disconnectDB();
    process.exit(1);
  });