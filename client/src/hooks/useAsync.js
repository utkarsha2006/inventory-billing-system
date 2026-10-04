import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client.js';

// Runs `fn()` whenever `deps` change. Ignores results that arrive after the deps changed or the component unmounted.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((e) => active && setState({ data: null, loading: false, error: errorMessage(e) }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}