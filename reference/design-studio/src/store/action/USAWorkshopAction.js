import { createAsyncThunk } from "@reduxjs/toolkit";
import { UnauthorizedUser } from "../../utils/Unauthorized";
import axios from "axios";
import API from "../../json/apiConfig.js";
import { localStorageTokenKey } from "../../utils/localStorageTokenKey";

export const GetUSAWorkshopCalculation = createAsyncThunk(
  "USAWorkShop/pricing",
  async (payload) => {
    try {
      const apiRequest = await axios.post(
        API.BACKEND_API_URL + "/usa-workshop/calculation",
        payload,
        {
          headers: {
            Authorization:
              "Bearer " + localStorage.getItem(localStorageTokenKey),
          },
        }
      );

      let apiResponse = await apiRequest.data;
      console.log("apiResponseGetUSAWorkshopCalculation", apiResponse);
      return apiResponse;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      // toast.error(
      //   error.response?.data?.error ||
      //     error.response?.data?.message ||
      //     error.message
      // );
      // return thunkAPI.rejectWithValue(
      //   error.response?.data?.error ||
      //     error.response?.data?.message ||
      //     error.message
      // );
    }
  }
);
