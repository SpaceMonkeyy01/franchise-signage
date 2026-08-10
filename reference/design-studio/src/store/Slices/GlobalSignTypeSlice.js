import { createSlice } from "@reduxjs/toolkit";
import { GetGlobalSignTypes } from "../action/GlobalSignTypesAction";

const initialState = {
  globalSigns: [],
  secondaryTypes: [],
  tertiaryTypes: [],
  optionsTypes: [],

  allSignTypes: null,

  optionsFlow: ["main"],
  selectedFlow: "main",

  mainType: null,
  secondaryType: null,
  tertiaryType: null,
  optionType: null,

  globalSignLoading: false,
  globalSignError: null,
};

const GlobalSignTypeSlice = createSlice({
  name: "globalSigns",
  initialState,
  reducers: {
    // Generic function to reset dependent types
    setTypeBasedOnKey: (state, { payload: { key, value } }) => {
      switch (key) {
        case "main": {
          state.mainType = value;
          const mainSign = state.globalSigns.find((item) => item.name === value);
          state.secondaryTypes = mainSign?.types || [];
          state.secondaryType = null;

          // Always flatten all secondary children into tertiaryTypes
          state.tertiaryTypes = (mainSign?.types || []).flatMap(
            (sec) => sec?.types || []
          );
          state.tertiaryType = null;
          state.optionsTypes = [];
          state.optionType = null;
          break;
        }

        case "secondary":
          state.secondaryType = value;
          // Don't overwrite tertiaryTypes here — it's already flattened from main selection
          // Only reset option-level state
          state.tertiaryType = null;
          state.optionsTypes = [];
          state.optionType = null;
          break;

        case "tertiary":
          state.tertiaryType = value;
          state.optionsTypes =
            state.tertiaryTypes.find((item) => item.name === value)?.types ||
            [];
          state.optionType = null;
          break;

        case "option":
          state.optionType = value;
          break;

        default:
          break;
      }
    },
    setSelectedFlow: (state, action) => {
      state.selectedFlow = action.payload;
      state.optionsFlow = [...state.optionsFlow, action.payload];
    },
    setOptionsFlow: (state) => {
      // Remove the last item
      state.optionsFlow?.length > 1 && state.optionsFlow.pop();

      // Set selectedFlow to the new last item (or null if array is empty)
      state.selectedFlow =
        state.optionsFlow.length > 0
          ? state.optionsFlow[state.optionsFlow.length - 1]
          : null;
    },
    setOptionFlowBreadCrumb: (state, action) => {
      state.selectedFlow = action.payload.selectedFlow;
      state.optionsFlow = action.payload.optionsFlow;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetGlobalSignTypes.pending, (state) => {
        state.globalSignLoading = true;
      })
      .addCase(GetGlobalSignTypes.fulfilled, (state, action) => {
        state.globalSignLoading = false;
        state.globalSigns = action.payload;
      })
      .addCase(GetGlobalSignTypes.rejected, (state, action) => {
        state.globalSignLoading = false;
        state.globalSignError = action.payload;
      });
  },
});

export const {
  setTypeBasedOnKey,
  setSelectedFlow,
  setOptionsFlow,
  setOptionFlowBreadCrumb,
} = GlobalSignTypeSlice.actions;
export default GlobalSignTypeSlice.reducer;
