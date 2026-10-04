import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage, refreshSession } from '../../api/client.js';

// On page load: trade the refresh cookie for an access token, then load the user and shop.
export const bootstrapAuth = createAsyncThunk('auth/bootstrap', async () => {
  await refreshSession(); // the bridge stores the token (shared promise: safe under StrictMode)
  const res = await api.get('/auth/me');
  return res.data.data; // { user, shop }
});

export const login = createAsyncThunk('auth/login', async (credentials, { dispatch, rejectWithValue }) => {
  try {
    const res = await api.post('/auth/login', credentials);
    dispatch(sessionSet(res.data.data));
    return (await api.get('/auth/me')).data.data;
  } catch (e) {
    return rejectWithValue(errorMessage(e));
  }
});

export const registerShop = createAsyncThunk('auth/registerShop', async (body, { dispatch, rejectWithValue }) => {
  try {
    const res = await api.post('/auth/register-shop', body);
    dispatch(sessionSet({ user: res.data.data.user, accessToken: res.data.data.accessToken }));
    return { user: res.data.data.user, shop: res.data.data.shop };
  } catch (e) {
    return rejectWithValue(errorMessage(e));
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } catch {
    /* the local session is cleared either way */
  }
});

const signedOut = { status: 'unauthenticated', user: null, shop: null, accessToken: null };

const slice = createSlice({
  name: 'auth',
  initialState: { status: 'loading', user: null, shop: null, accessToken: null, error: null },
  reducers: {
    sessionSet(state, { payload }) {
      state.accessToken = payload.accessToken;
      if (payload.user) state.user = payload.user;
    },
    sessionCleared: (state) => ({ ...state, ...signedOut }),
  },
  extraReducers: (builder) => {
    const signedIn = (state, { payload }) => {
      state.status = 'authenticated';
      state.user = payload.user;
      state.shop = payload.shop;
      state.error = null;
    };
    builder
      .addCase(bootstrapAuth.fulfilled, signedIn)
      .addCase(bootstrapAuth.rejected, (state) => ({ ...state, ...signedOut }))
      .addCase(login.pending, (state) => {
        state.error = null;
      })
      .addCase(login.fulfilled, signedIn)
      .addCase(login.rejected, (state, { payload }) => {
        state.error = payload ?? 'Login failed';
      })
      .addCase(registerShop.pending, (state) => {
        state.error = null;
      })
      .addCase(registerShop.fulfilled, signedIn)
      .addCase(registerShop.rejected, (state, { payload }) => {
        state.error = payload ?? 'Registration failed';
      })
      .addCase(logout.fulfilled, (state) => ({ ...state, ...signedOut, error: null }));
  },
});

export const { sessionSet, sessionCleared } = slice.actions;
export default slice.reducer;