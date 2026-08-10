import { createSlice } from "@reduxjs/toolkit";
import { GETALLPrices, GetFormCalculation } from "../action/FormAction";
import { GetDefaultOptions } from "../action/UserLoginAction";
import { GetAllMockups } from "../action/MockupAndQuotes";
import {
  createMockupViewThunk,
  createRegenerateMockupViewThunk,
} from "../action/createSingleMockup";
import { imageToTextThunk } from "../action/ImageToTextAPIAction";

let signFormDefaultSnapshot = null;

const initialState = {
  options: {
    sign_height: 120,
    sign_width: 0,
    sign_depth: 1,
    sign_type: "Halo Lit Channel Letters",
    mounting_type: "",
    user_input_dimension: "width",
    neon_color: "",
    uv_printing_needed: "",
    profit_factor: 1,
    size: '',
  },
  signOptionsValues: {},
  uploaded_file: null,
  loading: false,
  ResponseObject: null,
  error: "",
  default_options: null,
  filtered_options_by_sign_type: null,
  single_filtered_option: null,

  default_options_loading: false,
  default_options_error: null,

  trimType: null,
  fabricatedFinish: null,
  lightBoxType: null,
  returnColor: "logo-match",
  mockupSignType: null,


  shape: "",

  objects: [{ height: "", width: "", perimeter: "", area: "", boxArea: "" }],

  racewayData: {
    raceway_depth: 2,
    raceway_height: 6,
    no_of_lines: 1,
    raceway_objects: [{ width_of_line: 0, max_height_of_line: 0 }],
  },

  backerData: {
    backer_offset: 2,
    backboard_cabinet_depth: 2,
  },

  toolsOptions: {
    no_of_letters: 0,
    perimeter_of_sign: 0,
    nested_area: 15.35,
    occupied_area: 0,
    avg_char_height: "",
    width_of_sign: 0,
    width_of_smaller_line: 20,
    other_dimension_of_sign: 0,
  },

  uploaded_scene_baseUrl: null,
  created_background_mockup_URL: null,
  created_background_mockup_loading: false,

  imagePreview: null,

  allMockupsAndQuotes: [],
  allMockupCreationLoading: false,
  allMockupsCreated: false,
  detectedLines: [],

  regenerateMockups: [],
  regenerateMockupPayload: null,

  imageToTextAPILoading: false,
  module_name: "logo",

  quotationId: null,

  // Real EST- reference once the studio estimate is logged (Download/Save/
  // Purchase). Null until then; the on-image quote panel falls back to the
  // session draft ref while this is null.
  currentEstimateRef: null,

  // Live customer-facing estimate price (Signize cost + the adjustable margin)
  // published by EstimateActions so the on-image quote panel shows the same
  // number. Null → the panel computes it from the company's default margin.
  currentEstimatePrice: null,

  // Customer/project details captured by the "Preparing your design" popup
  // (DesignPrepModal) while the price/mockup APIs run. Flows into the estimate
  // payload (customer_phone / project_name) when it's logged.
  customerInfo: { name: "", email: "", phone: "", projectName: "" },
};

const signFormSlice = createSlice({
  name: "signForm",
  initialState,
  reducers: {
    setOptions: (state, action) => {
      state.options = action.payload;
    },
    setOptionField: (state, action) => {
      const { field, value } = action.payload;
      state.options[field] = value;
    },
    setTrimType: (state, action) => {
      state.trimType = action.payload;
    },
    setFabricatedFinish: (state, action) => {
      state.fabricatedFinish = action.payload;
    },
    setMockupSignTypeAndFabfinish: (state, action) => {
      // if (action.payload.mockupSignType) {
      state.mockupSignType = action.payload.mockupSignType;
      // }
      // if (action.payload.fabricatedFinish) {
      state.fabricatedFinish = action.payload.fabricatedFinish
      // }
    },
    setReturnColor: (state, action) => {
      state.returnColor = action.payload;
    },
    setLightBoxType: (state, action) => {
      state.lightBoxType = action.payload;
    },
    setModuleName: (state, action) => {
      state.module_name = action.payload;
    },
    setCurrentEstimateRef: (state, action) => {
      state.currentEstimateRef = action.payload;
    },
    setCurrentEstimatePrice: (state, action) => {
      state.currentEstimatePrice = action.payload;
    },
    setCustomerInfo: (state, action) => {
      state.customerInfo = { ...state.customerInfo, ...action.payload };
    },
    setRegenerateMockupPayload: (state, action) => {
      state.regenerateMockupPayload = action.payload;
    },
    setSingleFilteredOption: (state, action) => {
      state.single_filtered_option = action.payload;
    },
    setDetectedLines: (state, action) => {
      state.detectedLines = action.payload;
    },
    setUpload_file: (state, action) => {
      state.uploaded_file = action.payload;
    },
    setSignOptionsValues: (state, action) => {
      state.signOptionsValues = action.payload;
    },
    setDefaultOptions: (state, action) => {
      state.default_options = action.payload;
    },
    setObjects: (state, action) => {
      state.objects = action.payload;
    },
    setRacewayData: (state, action) => {
      state.racewayData = action.payload;
    },
    setBackerData: (state, action) => {
      state.backerData = action.payload;
    },
    setShape: (state, action) => {
      state.shape = action.payload;
    },
    setToolsOptions: (state, action) => {
      state.toolsOptions = action.payload;
    },
    setUploadedSceneBaseURL: (state, action) => {
      state.created_background_mockup_URL = null;
      state.uploaded_scene_baseUrl = action.payload;
    },
    setCreatedBackgroundMockupURL: (state, action) => {
      state.created_background_mockup_URL = action.payload;
    },
    setImagePreview: (state, action) => {
      state.imagePreview = action.payload;
    },
    emptyAllMockupsAndQuotes: (state) => {
      state.allMockupsAndQuotes = [];
      state.allMockupsCreated = false;
    },
    setRegenerateMockups: (state, action) => {
      state.regenerateMockups = [...state.regenerateMockups, action.payload];
    },
    setAllMockupsAndQuotes: (state, action) => {
      const { name, cost, mockupImage } = action.payload;
      const index = state.allMockupsAndQuotes.findIndex(
        (item) => item.name === name
      );

      if (index > -1) {
        // update existing
        state.allMockupsAndQuotes[index] = {
          ...state.allMockupsAndQuotes[index],
          ...(cost !== undefined && { cost }),
          ...(mockupImage !== undefined && { mockupImage }),
        };
      } else {
        // add new
        state.allMockupsAndQuotes.push({ name, cost, mockupImage });
      }
    },
    restoreDefaultSignForm: (state) => {
      if (signFormDefaultSnapshot) {
        let stateData = JSON.parse(JSON.stringify(signFormDefaultSnapshot));
        if(state?.signOptionsValues?.application){
          stateData.signOptionsValues.application = state?.signOptionsValues?.application;
        }
        
        return stateData;
      }
      return state;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetFormCalculation.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.ResponseObject = null;
      })
      .addCase(GetFormCalculation.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload?.data?.quotationId) {
          state.quotationId = action.payload?.data?.quotationId;
        }
        state.ResponseObject = action.payload;
      })
      .addCase(GetFormCalculation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(GETALLPrices.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.ResponseObject = null;
      })
      .addCase(GETALLPrices.fulfilled, (state, action) => {
        state.loading = false;
        state.ResponseObject = action.payload?.epiccraftingsPricing;
      })
      .addCase(GETALLPrices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(GetDefaultOptions.pending, (state) => {
        // state.loading = true;
        // state.error = null;
        state.default_options = null;
        state.default_options_loading = true;
      })
      .addCase(GetDefaultOptions.fulfilled, (state, action) => {
        let payloadData = action?.payload?.data;

        console.log("payloadData", payloadData, action?.payload?.filtered_data);

        state.default_options = payloadData;
        state.default_options_loading = false;

        state.filtered_options_by_sign_type = action.payload?.filtered_data;
        state.single_filtered_option =
          action?.payload?.filtered_data?.[
          payloadData?.sign_type?.[0]?.["name"]
          ];

        state.trimType = payloadData?.trim_type?.[0]?.["value"] || null;
        // state.fabricatedFinish =
        //   payloadData?.fabricated_finish?.[0]?.["value"] || null;
        state.lightBoxType = payloadData?.lightbox_type?.[0]?.["value"] || null;
        state.shape =
          payloadData?.shape?.find((item) => item.value == "rectangular")
            ?.value || null;

        state.options = {
          ...state.options,
          // sign_type: payloadData?.sign_type?.[0]?.["name"],
          mounting_type: payloadData?.mounting_type?.[0]?.["name"],
          neon_color: payloadData?.neon_color?.[0]?.["name"],
          uv_printing_needed: payloadData?.uv_printing_needed?.[0]?.["name"],
        };

        state.signOptionsValues = {
          material: payloadData?.material?.[0]?.["name"],
          // application: payloadData?.application?.[0]?.["name"],
          ul_mandatory: payloadData?.ul_mandatory?.[0]?.["name"],
          paint_finish: payloadData?.paint_finish?.[0]?.["name"],
        };

        signFormDefaultSnapshot = JSON.parse(JSON.stringify(state));
      })
      .addCase(GetDefaultOptions.rejected, (state, action) => {
        state.default_options_loading = false;
        state.default_options_error = action.payload;
      })
      .addCase(GetAllMockups.pending, (state) => {
        state.allMockupCreationLoading = true;
      })
      .addCase(GetAllMockups.fulfilled, (state) => {
        state.allMockupCreationLoading = false;
        state.allMockupsCreated = true;
      })
      .addCase(GetAllMockups.rejected, (state) => {
        state.allMockupCreationLoading = false;
        state.allMockupsCreated = false;
      })
      .addCase(createMockupViewThunk.pending, (state) => {
        state.created_background_mockup_loading = true;
      })
      .addCase(createMockupViewThunk.fulfilled, (state, action) => {
        state.created_background_mockup_loading = false;
        state.created_background_mockup_URL = action.payload?.base64;
      })
      .addCase(createMockupViewThunk.rejected, (state) => {
        state.created_background_mockup_loading = false;
      })
      .addCase(createRegenerateMockupViewThunk.pending, () => { })
      .addCase(createRegenerateMockupViewThunk.fulfilled, (state, action) => {
        state.regenerateMockups = [...state.regenerateMockups].filter(
          (item) => item !== action.payload.name
        );
      })
      .addCase(createRegenerateMockupViewThunk.rejected, (state, action) => {
        state.regenerateMockups = [...state.regenerateMockups].filter(
          (item) => item !== action.payload.name
        );
      })
      .addCase(imageToTextThunk.pending, (state) => {
        state.imageToTextAPILoading = true;
      })
      .addCase(imageToTextThunk.fulfilled, (state, action) => {
        state.imageToTextAPILoading = false;
        state.quotationId = action.payload?.quotationId;
      })
      .addCase(imageToTextThunk.rejected, (state) => {
        state.imageToTextAPILoading = false;
      });
  },
});

export const {
  setOptions,
  setOptionField,
  setUpload_file,
  setSignOptionsValues,
  setDefaultOptions,
  setObjects,
  setRacewayData,
  setBackerData,
  setToolsOptions,
  setUploadedSceneBaseURL,
  setCreatedBackgroundMockupURL,
  setImagePreview,
  setAllMockupsAndQuotes,
  emptyAllMockupsAndQuotes,
  setDetectedLines,
  setRegenerateMockups,
  setSingleFilteredOption,
  setRegenerateMockupPayload,
  restoreDefaultSignForm,
  setModuleName,
  setTrimType,
  setFabricatedFinish,
  setLightBoxType,
  setReturnColor,
  setShape,
  setMockupSignTypeAndFabfinish,
  setCurrentEstimateRef,
  setCurrentEstimatePrice,
  setCustomerInfo
} = signFormSlice.actions;

export default signFormSlice.reducer;
