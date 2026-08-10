// src/app/store.js
//
// Studio-only store. The CRM slices (Orders, Quotations, Companies, AdminUsers,
// Pricing) were removed along with the NestJS data backend — the franchise
// portal owns those records in Supabase instead. What remains is exactly what
// the Design Studio needs to price a sign and render a mockup.
import { configureStore } from "@reduxjs/toolkit";
import signFormSlice from "./Slices/SignFormSlice";
import UserSlice from "./Slices/UserSlice";
import B2SignLogoSlice from "./Slices/B2SignLogoSlice";
import USAWorkShopSlice from "./Slices/USAWorkShopSlice";
import TextCanvasSlice from "./Slices/TextCanvasSlice";
import GlobalSigns from "./Slices/GlobalSignTypeSlice";

export const store = configureStore({
  reducer: {
    SignForm: signFormSlice,
    User: UserSlice,
    B2SignLogo: B2SignLogoSlice,
    TextCanvas: TextCanvasSlice,
    USAWorkShop: USAWorkShopSlice,
    GlobalSigns,
  },
});
