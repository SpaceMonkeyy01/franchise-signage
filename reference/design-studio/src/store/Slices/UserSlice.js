import { createSlice } from "@reduxjs/toolkit";
import {
  GetLoggedInUser,
  LogOutUserAction,
  UserLoginAction,
} from "../action/UserLoginAction";

const initialState = {
  user: null,
  token: null,
  error: null,
  loading: false,

  default_loading: false,
};

const UserSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUserAction: (state, action) => {
      state.user = action.payload;
    },
    setDefaultLoading: (state, action) => {
      state.default_loading = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(UserLoginAction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(UserLoginAction.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(UserLoginAction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(GetLoggedInUser.pending, (state) => {
        state.default_loading = true;
      })
      .addCase(GetLoggedInUser.fulfilled, (state, action) => {
        state.default_loading = false;
        state.user = action.payload;
      })
      .addCase(GetLoggedInUser.rejected, (state) => {
        state.default_loading = false;
      })
      .addCase(LogOutUserAction.pending, () => {})
      .addCase(LogOutUserAction.fulfilled, () => {})
      .addCase(LogOutUserAction.rejected, () => {});
  },
});

export const { setUserAction, setDefaultLoading } = UserSlice.actions;

export default UserSlice.reducer;
