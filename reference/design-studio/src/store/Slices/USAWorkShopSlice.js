import { createSlice } from "@reduxjs/toolkit";
import { GetUSAWorkshopCalculation } from "../action/USAWorkshopAction";

const initialState = {
  loading: false,
  error: null,
  usaWorkShopPriceCalculation: null,
};

const USAWorkShopSlice = createSlice({
  name: "USAWorkShop",
  initialState,
  reducers: {
    resetUSAWorkshop: () => initialState,
    setUSAWorkshopPricing: (state, action) => {
      state.usaWorkShopPriceCalculation = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetUSAWorkshopCalculation.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.usaWorkShopPriceCalculation = null;
      })
      .addCase(GetUSAWorkshopCalculation.fulfilled, (state, action) => {
        state.loading = false;
        state.usaWorkShopPriceCalculation = action.payload;
      })
      .addCase(GetUSAWorkshopCalculation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetUSAWorkshop, setUSAWorkshopPricing } = USAWorkShopSlice.actions;

export default USAWorkShopSlice.reducer;
