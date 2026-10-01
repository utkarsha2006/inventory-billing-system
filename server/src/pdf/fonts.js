import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const REGULAR = path.join(DIR, 'NotoSans-Regular.ttf');
const BOLD = path.join(DIR, 'NotoSans-Bold.ttf');

// Returns the font names to use plus a `safe()` text sanitiser.
// Embedded Noto Sans has the ₹ glyph. The Helvetica fallback does not, so we print "Rs."
// and replace characters Helvetica can't encode (otherwise PDFKit emits garbage).
export function registerFonts(doc) {
  if (fs.existsSync(REGULAR) && fs.existsSync(BOLD)) {
    doc.registerFont('App', REGULAR);
    doc.registerFont('App-Bold', BOLD);
    return { regular: 'App', bold: 'App-Bold', rupee: '₹', safe: (v) => String(v ?? '') };
  }
  return {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    rupee: 'Rs.',
    safe: (v) => String(v ?? '').replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?'),
  };
}