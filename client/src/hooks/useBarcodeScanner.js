import { useEffect, useRef } from 'react';

/**
 * USB barcode scanners act as keyboards: they "type" the code very fast and finish with Enter.
 * Humans type slower, so a burst of >= minLength characters with an average gap <= maxGapMs
 * followed by Enter is a scan. Keystrokes inside text fields are ignored (the search box handles
 * its own Enter), so a scan can't corrupt a quantity or price field.
 */
export function useBarcodeScanner(onScan, { enabled = true, minLength = 4, maxGapMs = 60 } = {}) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let buffer = '';
    let gaps = [];
    let last = 0;
    const reset = () => {
      buffer = '';
      gaps = [];
    };

    const onKeyDown = (e) => {
      const el = e.target;
      const typing =
        el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
      if (typing || e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return;
      }

      const now = performance.now();
      if (now - last > 100) reset(); // a pause means a human, not a scanner
      const gap = now - last;
      last = now;

      if (e.key === 'Enter') {
        const average = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : Infinity;
        if (buffer.length >= minLength && average <= maxGapMs) {
          e.preventDefault(); // don't also "click" whatever button has focus
          handler.current(buffer);
        }
        reset();
        return;
      }
      if (e.key.length === 1) {
        if (buffer) gaps.push(gap);
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, minLength, maxGapMs]);
}