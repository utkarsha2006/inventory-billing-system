import { useEffect, useState } from 'react';
import axios from 'axios';
import { api, errorMessage } from '../../api/client.js';

// Asks the server for the totals of the current cart. The server runs the same GST engine that will
// issue the invoice, so what the cashier sees is what gets billed. `fresh` is true only when the
// result belongs to the CURRENT cart (it is false while a newer request is still in flight).
export function usePreview(payload) {
  const key = payload ? JSON.stringify(payload) : null;
  const [state, setState] = useState({ key: null, data: null, error: null, loading: false });

  useEffect(() => {
    if (!key) {
      setState({ key: null, data: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/invoices/preview', JSON.parse(key), { signal: controller.signal });
        setState({ key, data: res.data.data, error: null, loading: false });
      } catch (e) {
        if (axios.isCancel(e)) return;
        setState({ key, data: null, error: errorMessage(e), loading: false });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return { ...state, fresh: key !== null && state.key === key && state.data !== null };
}