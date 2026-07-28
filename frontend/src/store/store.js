import { configureStore, createSlice } from '@reduxjs/toolkit';

const initialAuth = { token: localStorage.getItem('token'), user: JSON.parse(localStorage.getItem('user') || 'null') };
const authSlice = createSlice({
  name: 'auth', initialState: initialAuth,
  reducers: {
    setCredentials: (state, action) => { state.token = action.payload.token; state.user = action.payload.user; localStorage.setItem('token', action.payload.token); localStorage.setItem('user', JSON.stringify(action.payload.user)); },
    updateCurrentUser: (state, action) => { state.user = { ...state.user, ...action.payload }; localStorage.setItem('user', JSON.stringify(state.user)); },
    logout: (state) => { state.token = null; state.user = null; localStorage.clear(); }
  }
});
export const { setCredentials, updateCurrentUser, logout } = authSlice.actions;
export const store = configureStore({ reducer: { auth: authSlice.reducer } });
