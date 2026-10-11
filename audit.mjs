// Run from the repo root:  node audit.mjs      (delete it afterwards, or keep it in a /scripts folder)
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { execSync, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const abs = (p) => path.join(ROOT, p);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(abs(p));
const read = (p) => (exists(p) ? fs.readFileSync(abs(p), 'utf8') : null);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Expected files
// ---------------------------------------------------------------------------
const make = (dir, names, ext = '.js') => names.map((n) => `${dir}/${n}${ext}`);

const EXPECTED = [
  'server/package.json',
  'server/.env.example',
  'server/src/app.js',
  'server/src/server.js',
  'server/scripts/seed.js',
  ...make('server/src/config', ['constants', 'permissions', 'env', 'db', 'cors']),
  ...make('server/src/models', ['Shop', 'User', 'RefreshToken', 'Product', 'ProductBatch', 'StockMovement', 'Counter', 'Customer', 'Invoice', 'Supplier', 'Purchase', 'CreditNote', 'index']),
  ...make('server/src/routes', ['index', 'auth.routes', 'shop.routes', 'user.routes', 'product.routes', 'customer.routes', 'invoice.routes', 'supplier.routes', 'purchase.routes', 'creditNote.routes', 'alert.routes', 'job.routes', 'report.routes', 'dashboard.routes']),
  ...make('server/src/controllers', ['auth.controller', 'user.controller', 'shop.controller', 'product.controller', 'stock.controller', 'invoice.controller', 'customer.controller', 'supplier.controller', 'purchase.controller', 'return.controller', 'alert.controller', 'report.controller']),
  ...make('server/src/services', ['auth.service', 'user.service', 'shop.service', 'product.service', 'stock.service', 'counter.service', 'customer.service', 'billing.service', 'invoicePdf.service', 'supplier.service', 'purchase.service', 'return.service', 'alert.service', 'email.service', 'emailTemplates', 'presenters', 'report.service', 'gstReport.service', 'export.service', 'reportKit']),
  ...make('server/src/validators', ['common.validators', 'shop.validators', 'auth.validators', 'user.validators', 'product.validators', 'customer.validators', 'invoice.validators', 'supplier.validators', 'purchase.validators', 'return.validators', 'report.validators']),
  ...make('server/src/middleware', ['validate', 'authenticate', 'authorize', 'rateLimiter', 'notFound', 'errorHandler', 'cronAuth']),
  ...make('server/src/jobs', ['lowStockAlert.job']),
  ...make('server/src/pdf', ['fonts', 'helpers', 'invoiceA4', 'invoiceThermal', 'index']),
  ...make('server/src/utils', ['ApiError', 'asyncHandler', 'pagination', 'gstin', 'escapeRegex', 'quantity', 'barcode', 'transaction', 'money', 'gst', 'financialYear', 'numberToWords', 'period', 'csv', 'gstr', 'returns']),
  'server/tests/helpers/testApp.js',
  ...make('server/tests/unit', ['gstin.test', 'quantity.test', 'money.test', 'financialYear.test', 'gst.test', 'numberToWords.test', 'invoicePdf.test', 'returns.test', 'csv.test', 'gstr.test', 'period.test']),
  ...make('server/tests/api', ['auth.test', 'products.test', 'billing.test', 'invoicePdf.test', 'purchases.test', 'returns.test', 'alerts.test', 'reports.test']),

  'client/package.json',
  'client/index.html',
  'client/vite.config.js',
  'client/vercel.json',
  'client/.env.example',
  'client/src/main.jsx',
  'client/src/index.css',
  'client/src/api/client.js',
  ...make('client/src/app', ['store'], '.js'),
  ...make('client/src/app', ['App', 'AppLayout'], '.jsx'),
  ...make('client/src/hooks', ['useAsync', 'useDebouncedValue', 'useBarcodeScanner']),
  ...make('client/src/utils', ['constants', 'roles', 'states', 'format']),
  ...make('client/src/components', ['ui', 'Toasts'], '.jsx'),
  'client/src/features/auth/authSlice.js',
  ...make('client/src/features/auth', ['LoginPage', 'RegisterPage'], '.jsx'),
  'client/src/features/ui/uiSlice.js',
  ...make('client/src/features/pos', ['cartMath', 'cartMath.test', 'posSlice', 'usePreview']),
  ...make('client/src/features/pos', ['CameraScanner', 'ProductSearch', 'Cart', 'Totals', 'CustomerPicker', 'PaymentPanel', 'SuccessModal', 'PosPage'], '.jsx'),
  'client/src/features/dashboard/DashboardPage.jsx',
  ...make('client/src/features/reports', ['ReportViewer', 'ReportsPage'], '.jsx'),
  ...make('client/src/features/products', ['StockModal', 'ProductsPage', 'ProductFormPage'], '.jsx'),
  'client/src/features/invoices/InvoicesPage.jsx',

  '.gitignore',
  'README.md',
  'docker-compose.yml',
  'render.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/stock-alerts.yml',
];

const OPTIONAL = [
  ['server/src/pdf/fonts/NotoSans-Regular.ttf', 'PDFs will print "Rs." instead of the rupee sign'],
  ['server/src/pdf/fonts/NotoSans-Bold.ttf', 'PDFs will print "Rs." instead of the rupee sign'],
  ['server/package-lock.json', 'CI and Render use "npm ci", which needs it committed'],
  ['client/package-lock.json', 'CI uses "npm ci", which needs it committed'],
];

const expectedSet = new Set(EXPECTED);
for (const f of EXPECTED) {
  if (!exists(f)) err(`MISSING FILE   ${f}`);
  else if (fs.statSync(abs(f)).size === 0) err(`EMPTY FILE     ${f}  (scaffold leftover, or the code was never pasted in)`);
}
for (const [f, why] of OPTIONAL) if (!exists(f)) warn(`missing ${f}: ${why}`);

for (const f of [...walk(abs('server')), ...walk(abs('client'))]) {
  if (/\.(js|jsx)$/.test(f) && fs.statSync(f).size === 0 && !expectedSet.has(rel(f))) {
    warn(`stray empty file ${rel(f)}  (Phase 1 scaffold leftover, safe to delete)`);
  }
}

// ---------------------------------------------------------------------------
// 2. Imports: files resolve, named imports exist, packages are installed
// ---------------------------------------------------------------------------
function loadPkg(p) {
  try {
    const j = JSON.parse(read(p));
    return new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
}
const PKGS = { server: loadPkg('server/package.json'), client: loadPkg('client/package.json') };
const BUILTINS = new Set(builtinModules);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const exportsCache = new Map();
function exportsOf(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (p) names.add(p.split(/\s+as\s+/).pop().trim());
    }
  }

  for (const m of src.matchAll(/export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (p) names.add(p.split(':').pop().trim());
    }
  }
  const info = { names, hasDefault: /export\s+default\b/.test(src) };
  exportsCache.set(file, info);
  return info;
}

function resolveRel(fromFile, spec, isClient) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = isClient ? [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')] : [base];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function parseClause(clause) {
  const out = { def: null, named: [], ns: false };
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    out.named = braces[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/)[0].trim());
  }
  const head = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  if (/^\*\s+as\s+\w+/.test(head)) out.ns = true;
  else if (head) out.def = head.split(/\s+/)[0];
  return out;
}

const scanFiles = [
  ...walk(abs('server/src')),
  ...walk(abs('server/scripts')),
  ...walk(abs('server/tests')),
  ...walk(abs('client/src')),
  abs('client/vite.config.js'),
].filter((f) => /\.(js|jsx|mjs)$/.test(f) && fs.existsSync(f) && fs.statSync(f).size > 0);

for (const file of scanFiles) {
  const where = rel(file);
  const area = where.startsWith('client/') ? 'client' : 'server';
  const src = stripComments(fs.readFileSync(file, 'utf8'));

  const imports = []; // { spec, parsed? }
  for (const m of src.matchAll(/import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/g)) imports.push({ spec: m[2], parsed: parseClause(m[1]) });
  for (const m of src.matchAll(/import\s+['"]([^'"]+)['"]/g)) imports.push({ spec: m[1] });
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.push({ spec: m[1] });
  for (const m of src.matchAll(/export\s+[^'";]+?\s+from\s+['"]([^'"]+)['"]/g)) imports.push({ spec: m[1] });

  for (const { spec, parsed } of imports) {
    if (spec.startsWith('.')) {
      const target = resolveRel(file, spec, area === 'client');
      if (!target) {
        err(`BAD IMPORT     ${where}: cannot resolve '${spec}'`);
        continue;
      }
      if (area === 'server' && !path.extname(spec)) err(`BAD IMPORT     ${where}: '${spec}' needs a file extension in Node ESM (add .js)`);
      if (parsed && /\.(js|jsx)$/.test(target) && fs.statSync(target).size > 0) {
        const { names, hasDefault } = exportsOf(target);
        for (const n of parsed.named) if (!names.has(n)) err(`NOT EXPORTED   ${where}: imports { ${n} } from '${spec}', but ${rel(target)} does not export it`);
        if (parsed.def && !hasDefault) err(`NOT EXPORTED   ${where}: default import from '${spec}', but ${rel(target)} has no default export`);
      }
      if (parsed && fs.existsSync(target) && fs.statSync(target).size === 0) err(`EMPTY TARGET   ${where}: imports from empty file ${rel(target)}`);
    } else if (!spec.startsWith('node:') && !spec.startsWith('/')) {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!BUILTINS.has(pkg) && !PKGS[area].has(pkg)) err(`NOT INSTALLED  ${where}: package '${pkg}' is not in ${area}/package.json  ->  cd ${area} && npm i ${pkg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Syntax check (server files; client JSX is checked by `npm run build`)
// ---------------------------------------------------------------------------
for (const file of scanFiles.filter((f) => rel(f).startsWith('server/'))) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    const line = (r.stderr || '').split('\n').find((l) => /Error/.test(l)) ?? 'syntax error';
    err(`SYNTAX ERROR   ${rel(file)}: ${line.trim()}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Edits to existing files that are easy to miss
// ---------------------------------------------------------------------------
const MUST_CONTAIN = [
  ['server/src/models/Invoice.js', ['returnedQtyMilli', 'gstRegistrationType'], 'Phase 5 + 6 model edits'],
  ['server/src/models/Shop.js', ['lastLowStockEmailOn'], 'Phase 6: alerts field'],
  ['server/src/services/billing.service.js', ['gstRegistrationType: shop.gstRegistrationType'], 'Phase 5: shop snapshot'],
  ['server/src/services/stock.service.js', ['allowInactive = false', 'purchaseId'], 'Phase 6 edits'],
  ['server/src/config/constants.js', ['PURCHASE_PAYMENT_MODES', 'REFUND_MODES', 'PAYMENT_MODES', 'GST_RATES = [0, 3, 5, 18, 40]', 'MANUAL_ADJUSTMENT_TYPES', 'STOCK_MOVEMENT_TYPES'], 'Phase 3, 4, 6 constants'],
  ['server/src/config/permissions.js', ['stock:read', 'customer:manage', 'invoice:override-price', 'purchase:read', 'return:read'], 'Phase 3, 4, 6 permissions'],
  ['server/src/config/env.js', ['TRUST_PROXY', 'ENABLE_CRON', 'CRON_SECRET', 'ALERT_FROM_EMAIL'], 'Phase 6 + 9 env vars'],
  ['server/src/config/db.js', ['maxPoolSize'], 'Phase 9: connection options'],
  ['server/src/config/cors.js', ['exposedHeaders'], 'Phase 5: lets the browser read the PDF filename'],
  ['server/src/app.js', ['env.TRUST_PROXY', "'no-store'"], 'Phase 9: replacement app.js'],
  ['server/src/server.js', ['scheduleLowStockAlerts'], 'Phase 6: replacement server.js'],
  ['server/src/validators/common.validators.js', ['export const emptyToUndefined', 'blankToNull', 'export const ymd'], 'Phase 3 + 4 helpers'],
  ['server/src/validators/invoice.validators.js', ['export const pdfQuery'], 'Phase 5'],
  ['server/src/controllers/invoice.controller.js', ['export const pdf'], 'Phase 5'],
  ['server/src/routes/invoice.routes.js', ['/:id/pdf', '/:id/returns', 'pdfQuery', 'return.controller'], 'Phase 5 + 6 routes'],
  ['server/src/routes/index.js', ["'/reports'", "'/dashboard'", "'/jobs'", "'/alerts'", "'/credit-notes'", "'/purchases'", "'/suppliers'", "'/customers'", "'/invoices'", "'/products'"], 'Phase 4-7: every module mounted'],
  ['server/src/models/index.js', ['Supplier', 'Purchase', 'CreditNote', 'Counter', 'Customer', 'Invoice', 'ProductBatch', 'StockMovement'], 'Phase 3-6: every model exported'],
  ['server/src/services/presenters.js', ['presentInvoice', 'presentPurchase', 'presentCreditNote', 'returnedQtyMilli'], 'Phase 4 + 6'],
  ['server/src/pdf/invoiceA4.js', ['docTitle', 'paymentsLabel', 'refLine'], 'Phase 6: credit-note support'],
  ['server/src/pdf/invoiceThermal.js', ['docTitle', 'refLine'], 'Phase 6: credit-note support'],
  ['server/src/pdf/index.js', ['docTitle'], 'Phase 6: PDF metadata'],
  ['server/src/utils/money.js', ['weightedAverage', 'allocateProRata', 'mulDiv', 'roundToRupee'], 'Phase 4 + 6'],
  ['server/src/utils/financialYear.js', ['section34Cutoff', 'financialYearOf', 'formatInvoiceNo'], 'Phase 4 + 6'],
  ['server/src/services/report.service.js', ['dashboardSummary', 'salesReport', 'profitReport', 'stockValuationReport'], 'Phase 7'],
  ['server/tests/helpers/testApp.js', ['CRON_SECRET', 'createShop'], 'Phase 6: test helper'],
  ['server/.env.example', ['TRUST_PROXY', 'ENABLE_CRON', 'ALERT_FROM_EMAIL'], 'Phase 9'],
  ['client/src/features/products/StockModal.jsx', ['activeTab', 'disabled={busy || noBatches}'], 'the batch-tab fix'],
  ['client/src/api/client.js', ['refreshSession', 'downloadFile', 'printPdf', 'openPdf'], 'Phase 8'],
  ['client/src/app/App.jsx', ['RequireStaff'], 'Phase 8'],
  ['.gitignore', ['node_modules', '.env'], 'secrets and dependencies must not be committed'],
];

for (const [file, needles, why] of MUST_CONTAIN) {
  const text = read(file);
  if (text === null) continue; // already reported as missing
  for (const needle of needles) if (!text.includes(needle)) err(`MISSING EDIT   ${file}: expected to find  ${needle}   (${why})`);
}

// Specific mistakes seen so far
const fy = read('server/src/utils/financialYear.js');
if (fy && !/export function istYmd[\s\S]*?\breturn\b/.test(fy)) err('BUG            server/src/utils/financialYear.js: istYmd() has no return statement (this crashed the dashboard)');

const stock = read('server/src/services/stock.service.js');
if (stock) {
  const grab = (name) => {
    const start = stock.indexOf(`export async function ${name}`);
    if (start === -1) return null;
    const next = stock.indexOf('\nexport ', start + 10);
    return stock.slice(start, next === -1 ? undefined : next);
  };
  const listBatches = grab('listBatches');
  if (listBatches && listBatches.includes('allowInactive')) err('BUG            stock.service.js: "allowInactive" appears inside listBatches (it belongs only in applyStockChange)');
  const apply = grab('applyStockChange');
  if (apply && !apply.includes('allowInactive')) err('MISSING EDIT   stock.service.js: applyStockChange does not use allowInactive (Phase 6)');
}

const vercel = read('client/vercel.json');
if (vercel && vercel.includes('YOUR-SERVICE')) warn('client/vercel.json still has the YOUR-SERVICE placeholder. Replace it with your Render host before deploying.');

for (const [pkgFile, scripts] of [['server/package.json', ['dev', 'start', 'test', 'seed']], ['client/package.json', ['dev', 'build', 'test']]]) {
  try {
    const j = JSON.parse(read(pkgFile) ?? '{}');
    for (const s of scripts) if (!j.scripts?.[s]) err(`MISSING EDIT   ${pkgFile}: no "${s}" script`);
    if (pkgFile.startsWith('server') && j.type !== 'module') err('MISSING EDIT   server/package.json: "type": "module" is required');
  } catch {
    err(`BAD JSON       ${pkgFile} is not valid JSON`);
  }
}

// ---------------------------------------------------------------------------
// 5. Git hygiene
// ---------------------------------------------------------------------------
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  for (const f of tracked) {
    if (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example')) err(`SECRET LEAK    ${f} is committed to git. Run: git rm --cached ${f}  then ROTATE every secret in it (check history: git log --all -- ${f})`);
    if (/(^|\/)node_modules\//.test(f)) err(`COMMITTED      ${f} (node_modules must not be in git)`);
  }
  for (const f of ['server/package-lock.json', 'client/package-lock.json']) {
    if (exists(f) && !tracked.includes(f)) warn(`${f} exists but is not committed (CI and Render need it)`);
  }
  for (const f of ['server/src/pdf/fonts/NotoSans-Regular.ttf', 'server/src/pdf/fonts/NotoSans-Bold.ttf']) {
    if (exists(f) && !tracked.includes(f)) warn(`${f} is not committed, so deployed PDFs will print "Rs."`);
  }
} catch {
  warn('git checks skipped (not a git repository, or git is not installed)');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const section = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  for (const m of list) console.log(`  - ${m}`);
};
section('ERRORS: fix these', errors);
section('WARNINGS: worth a look', warnings);
console.log(
  `\nChecked ${EXPECTED.length} expected files and ${scanFiles.length} source files. ${errors.length} error(s), ${warnings.length} warning(s).`
);
console.log('Next:  cd server && npm test   |   cd client && npm test && npm run build\n');
process.exit(errors.length ? 1 : 0);