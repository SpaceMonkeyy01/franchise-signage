import { createSlice } from "@reduxjs/toolkit";
import { GetB2SignLogoCalculation } from "../action/B2SignLogoAction";

const initialState = { loading: false, error: null, logoCalculation: null };

const B2SignLogoSlice = createSlice({
  name: "B2SignLogo",
  initialState,
  reducers: {
    resetB2SignLogo: () => initialState,
    setB2SignLogoPricing: (state, action) => {
      state.logoCalculation = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetB2SignLogoCalculation.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.logoCalculation = null;
      })
      .addCase(GetB2SignLogoCalculation.fulfilled, (state, action) => {
        state.loading = false;
        state.logoCalculation = action.payload;
      })
      .addCase(GetB2SignLogoCalculation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetB2SignLogo, setB2SignLogoPricing } = B2SignLogoSlice.actions;

export default B2SignLogoSlice.reducer;
