import { configureStore } from '@reduxjs/toolkit';
import authReducer, { sessionSet, sessionCleared } from '../features/auth/authSlice.js';
import posReducer, { POS_STORAGE_KEY } from '../features/pos/posSlice.js';
import uiReducer from '../features/ui/uiSlice.js';
import { connectAuthBridge } from '../api/client.js';

export const store = configureStore({ reducer: { auth: authReducer, pos: posReducer, ui: uiReducer } });

connectAuthBridge({
  getToken: () => store.getState().auth.accessToken,
  setSession: (data) => store.dispatch(sessionSet(data)),
  clearSession: () => store.dispatch(sessionCleared()),
});

// Keep the bill across an accidental refresh (tab-scoped, gone when the tab closes).
let lastPos = store.getState().pos;
store.subscribe(() => {
  const pos = store.getState().pos;
  if (pos === lastPos) return;
  lastPos = pos;
  try {
    sessionStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* storage unavailable: not critical */
  }
});