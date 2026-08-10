import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";
import API from "../../json/apiConfig.js";
import { UnauthorizedUser } from "../../utils/Unauthorized";
import { localStorageTokenKey } from "../../utils/localStorageTokenKey";
import { setDetectedLines, setObjects, setRacewayData, setToolsOptions } from "../Slices/SignFormSlice";
import { GetB2SignLogoCalculation } from "./B2SignLogoAction";
import { GetUSAWorkshopCalculation } from "./USAWorkshopAction";
import { imageToTextThunk } from "./ImageToTextAPIAction";
import { setB2SignLogoPricing } from "../Slices/B2SignLogoSlice";
import { setUSAWorkshopPricing } from "../Slices/USAWorkShopSlice";

// utils/api.js (or wherever you keep this)
export async function fetchFormCalculation(formData, options = {}) {
  const response = await axios.post(
    API.BACKEND_API_URL + "/sign-pricing",
    formData,
    {
      headers: {
        Authorization: "Bearer " + localStorage.getItem(localStorageTokenKey),
      },
      ...options, // merge extra options like { signal }
    }
  );
  return response.data;
}

export const GetFormCalculation = createAsyncThunk(
  "FormSlice/GetCalculation",
  async (payload, thunkAPI) => {
    try {
      const { racewayData, shape, options } = thunkAPI.getState().SignForm;
      const dispatch = thunkAPI.dispatch;

      let data = await fetchFormCalculation(payload.formData);
      data = data?.calculation;

      // 🔹 Lines Detection
      if (data?.imageData?.linesDetection?.sections?.length > 0) {
        dispatch(setDetectedLines(data?.imageData?.linesDetection?.sections));
      } else {
        dispatch(setDetectedLines([]));
      }

      // 🔹 Objects
      if (data?.imageData?.objects?.length > 0) {
        let dataOfResponse = data?.imageData;

        dispatch(
          setObjects(
            dataOfResponse.objects.map((item) => ({
              id: item?.id,
              width: item?.width || 0,
              perimeter: item?.perimeter || 0,
              height: item?.height || 0,
              area: item?.area || 0,
              image: item?.image || "",
              boxArea:
                item?.width &&
                  item?.height &&
                  item?.width > 0 &&
                  item?.height > 0
                  ? (item.width * item.height).toFixed(2)
                  : 0,
            }))
          )
        );

        dispatch(
          setToolsOptions({
            no_of_letters: dataOfResponse?.noOfLetters,
            perimeter_of_sign: dataOfResponse?.perimeterOfSign,
            nested_area: dataOfResponse?.nestedArea,
            occupied_area: dataOfResponse?.occupiedArea,
            avg_char_height: dataOfResponse?.avgCharHeight,
            width_of_sign: dataOfResponse?.widthOfSign,
            width_of_smaller_line: dataOfResponse?.widthOfSmallerLine,
            other_dimension_of_sign: dataOfResponse?.otherDimensionOfSign,
          })
        );

        dispatch(
          setRacewayData({
            ...racewayData,
            no_of_lines: dataOfResponse?.noOfLines ?? racewayData.noOfLines,
            raceway_objects: dataOfResponse?.racewayObjects?.map(item => {
              return {
                width_of_line: item?.widthOfLine,
                max_height_of_line: item?.maxHeightOfLine,
              }
            }) ?? racewayData.racewayObjects,
          })
        );


        dispatch(
          GetB2SignLogoCalculation({
            sign_type_name: options?.sign_type,
            sign_depth: options?.sign_depth,
            mounting_type: options?.mounting_type,
            sign_height: dataOfResponse?.otherDimensionOfSign,
            sign_width: dataOfResponse?.widthOfSign,
            dimensions: dataOfResponse.objects.map((item) => {
              return {
                id: item.id,
                height: item.height,
                width: item.width,
              };
            }),
          })
        );

        dispatch(
          GetUSAWorkshopCalculation({
            sign_type: options?.sign_type,
            sign_depth: options?.sign_depth,
            mounting_type: options?.mounting_type,
            sign_height: dataOfResponse?.otherDimensionOfSign,
            sign_width: dataOfResponse?.widthOfSign,
            shipping_weight: data?.data?.totalDenseWeight > data?.data?.totalVolumetricWeight ? data?.data?.totalDenseWeight : data?.data?.totalVolumetricWeight,
            shape: shape || null,
            dimensions: dataOfResponse.objects.map((item) => {
              return {
                id: item.id,
                height: item.height,
                width: item.width,
              };
            }),
          })
        );

      } else {
        // fallback
        dispatch(
          setObjects([
            { height: "", width: "", perimeter: "", area: "", boxArea: "" },
          ])
        );
        dispatch(
          setToolsOptions({
            no_of_letters: 0,
            perimeter_of_sign: 0,
            nested_area: 15.35,
            occupied_area: 0,
            avg_char_height: "",
            width_of_sign: 0,
            width_of_smaller_line: 20,
            other_dimension_of_sign: 0,
          })
        );
        dispatch(
          setRacewayData({
            ...racewayData,
            no_of_lines: 1,
            raceway_objects: [{ width_of_line: 0, max_height_of_line: 0 }],
          })
        );
      }



      return data;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(error.response?.data?.error || error.message);
      return thunkAPI.rejectWithValue(
        error.response?.data?.error || error.response?.data || error.message
      );
    }
  }
);

export const GETALLPrices = createAsyncThunk(
  "FormSlice/GETALLPrices",
  async (payload, thunkAPI) => {
    try {
      const response = await axios.post(
        API.BACKEND_API_URL + "/signize/calculate",
        payload,
        {
          headers: {
            Authorization:
              "Bearer " + localStorage.getItem(localStorageTokenKey),
          },
        }
      );

      let responseData = response.data;
      if (responseData?.imageToText) {
        thunkAPI.dispatch(imageToTextThunk(responseData.imageToText));
      }
      if (responseData?.b2SignPricing) {
        thunkAPI.dispatch(setB2SignLogoPricing(responseData?.b2SignPricing))
      }

      if (responseData?.USAWorkshopPricing) {
        thunkAPI.dispatch(setUSAWorkshopPricing(responseData?.USAWorkshopPricing))
      }

      return responseData;

      // console.log("response from api ", response.data);
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(error.response?.data?.error || error.message);
      return thunkAPI.rejectWithValue(
        error.response?.data?.error || error.response?.data || error.message
      );
    }
  }
);
