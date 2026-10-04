import { useEffect, useRef, useState } from 'react';
import { Alert, Modal } from '../../components/ui.jsx';

// Camera scanning via html5-qrcode (lazy-loaded). Needs HTTPS or localhost.
export default function CameraScanner({ onScan, onClose, title = 'Scan a barcode' }) {
  const [error, setError] = useState(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!window.isSecureContext) {
      setError('The camera only works on HTTPS or localhost.');
      return undefined;
    }

    let cancelled = false;
    let scanner = null;
    let lastCode = '';
    let lastAt = 0;
    const id = 'camera-scanner';

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
        if (cancelled) return;
        const el = document.getElementById(id);
        if (el) el.innerHTML = ''; // StrictMode remounts in dev can leave a stale video behind
        scanner = new Html5Qrcode(id, {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE],
        });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (text) => {
            const now = Date.now();
            if (text === lastCode && now - lastAt < 2000) return; // the same barcode seen frame after frame
            lastCode = text;
            lastAt = now;
            onScanRef.current(text);
          },
          () => {} // per-frame "nothing found": ignore
        );
        if (cancelled) await scanner.stop().catch(() => {});
      } catch (e) {
        if (!cancelled) {
          setError(
            /permission|denied|notallowed/i.test(String(e))
              ? 'Camera permission was denied. Allow it in your browser settings and try again.'
              : 'Could not start the camera. Is another app using it?'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, []);

  return (
    <Modal title={title} onClose={onClose}>
      {error ? <Alert type="error">{error}</Alert> : <p className="mb-3 text-sm text-slate-500">Point the camera at the barcode. Each scan is added automatically.</p>}
      <div id="camera-scanner" className="overflow-hidden rounded-lg bg-slate-900" />
    </Modal>
  );
}