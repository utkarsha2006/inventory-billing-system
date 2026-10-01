import mongoose from 'mongoose';
import { UNITS, GST_RATES } from '../config/constants.js';

const { Schema } = mongoose;

const int = (extra = {}) => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
  ...extra,
});

const productSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true }, // omitted (not null/'') when absent
    hsnCode: { type: String, trim: true },
    category: { type: String, trim: true, default: 'General' },
    unit: { type: String, enum: UNITS, required: true },

    purchasePricePaise: int({ default: 0 }),
    sellingPricePaise: int({ required: true }),
    mrpPaise: int(),
    priceIncludesGst: { type: Boolean, default: true },
    gstRate: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => GST_RATES.includes(v),
        message: `GST rate must be one of ${GST_RATES.join(', ')}`,
      },
    },

    // Quantities in thousandths of the unit (1.5 kg = 1500).
    // Cached balance. The StockMovement ledger is the source of truth.
    stockMilli: int({ default: 0 }),
    reorderMilli: int({ default: 0 }),

    trackBatches: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Cannot sell above MRP (legal requirement for packaged goods in India).
productSchema.pre('validate', function () {
  if (this.mrpPaise != null && this.sellingPricePaise > this.mrpPaise) {
    this.invalidate('sellingPricePaise', 'Selling price cannot exceed MRP');
  }
});

productSchema.index({ shopId: 1, sku: 1 }, { unique: true });
// Partial (not sparse) index: many products may have no barcode, but barcodes stay unique per shop.
productSchema.index(
  { shopId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);
productSchema.index({ shopId: 1, isActive: 1, category: 1 });
productSchema.index({ shopId: 1, name: 1 });

export const Product = mongoose.model('Product', productSchema);