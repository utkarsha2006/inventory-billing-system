import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import * as stock from '../controllers/stock.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam, paginationQuery } from '../validators/common.validators.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuery,
  barcodeParam,
  stockAdjustmentSchema,
  movementsQuery,
  receiveBatchSchema,
  batchesQuery,
} from '../validators/product.validators.js';

const router = Router();
router.use(authenticate);

router.get('/', can('product:read'), validate({ query: listProductsQuery }), products.list);
router.post('/', can('product:write'), validate({ body: createProductSchema }), products.create);

// Fixed paths MUST come before '/:id', or Express would treat "low-stock" as an id.
router.get('/low-stock', can('product:read'), validate({ query: paginationQuery }), products.lowStock);
router.get('/categories', can('product:read'), products.categories);
router.get('/barcode/:code', can('product:read'), validate({ params: barcodeParam }), products.byBarcode);

router.get('/:id', can('product:read'), validate({ params: idParam }), products.get);
router.patch(
  '/:id',
  can('product:write'),
  validate({ params: idParam, body: updateProductSchema }),
  products.update
);
router.delete('/:id', can('product:write'), validate({ params: idParam }), products.remove);

router.post(
  '/:id/stock-adjustments',
  can('stock:adjust'),
  validate({ params: idParam, body: stockAdjustmentSchema }),
  stock.adjust
);
router.get(
  '/:id/stock-movements',
  can('stock:read'),
  validate({ params: idParam, query: movementsQuery }),
  stock.movements
);
router.get(
  '/:id/batches',
  can('product:read'),
  validate({ params: idParam, query: batchesQuery }),
  stock.batches
);
router.post(
  '/:id/batches',
  can('stock:adjust'),
  validate({ params: idParam, body: receiveBatchSchema }),
  stock.receiveBatch
);

export default router;