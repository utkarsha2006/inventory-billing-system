import { createSlice, nanoid } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'ui',
  initialState: { toasts: [] },
  reducers: {
    toast: {
      reducer(state, { payload }) {
        state.toasts.push(payload);
      },
      prepare: (type, message) => ({ payload: { id: nanoid(), type, message } }),
    },
    dismissToast(state, { payload }) {
      state.toasts = state.toasts.filter((t) => t.id !== payload);
    },
  },
});

export const { toast, dismissToast } = slice.actions;
export default slice.reducer;