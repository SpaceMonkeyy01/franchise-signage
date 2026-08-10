import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import API from "../../json/apiConfig.js";
import { UnauthorizedUser } from "../../utils/Unauthorized";
import { toast } from "sonner";

export const GetGlobalSignTypes = createAsyncThunk(
  "get/all/categories",
  async (payload, thunkAPI) => {
    try {
      const response = await axios.get(
        API.BACKEND_API_URL + "/get/all/categories"
      );
      const responseData = await response.data;
      console.log("responseData global", responseData);
      return responseData;
    } catch (error) {
      console.log("errrrrorrrrr", error);
      if (error?.status == 401) {
        UnauthorizedUser(payload.navigate);
      }
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
      return thunkAPI.rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);
