import axios from "axios";
import API from "../../json/apiConfig.js";
import { localStorageTokenKey } from "../../utils/localStorageTokenKey";
import { blobToBase64 } from "../../utils/blobToBase64";
import { base64ToFile } from "../../utils/base64ToFile";
import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  setAllMockupsAndQuotes,
  setRegenerateMockups,
} from "../Slices/SignFormSlice";
import { getBackgroundImageName } from "../../utils/backgroundImageName";

export const createMockupViewAPI = async (
  specs = null,
  uploadedSceneBase64 = null,
  uploadedFile,
  quotationId = null,
  signal,          // 👈 add this
  retryCount = 0,
  mainType
) => {
  const MAX_RETRIES = 3;

  try {
    let sceneBlob;
    if (uploadedSceneBase64) {
      sceneBlob = base64ToFile(uploadedSceneBase64);
    } else {
      const response = await fetch(`/${getBackgroundImageName(mainType)}`, { signal });
      sceneBlob = await response.blob();
    }

    const formData = new FormData();
    formData.append("LogoImage", uploadedFile);
    formData.append("sceneImage", sceneBlob, getBackgroundImageName(mainType));
    formData.append("quotationId", quotationId);

    if (specs) {
      Object.entries(specs).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const apiResponse = await axios.post(
      `${API.BACKEND_API_URL}/generate-mockup`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: "Bearer " + localStorage.getItem(localStorageTokenKey),
        },
        responseType: "blob",
        signal, // 👈 THIS cancels axios
      }
    );

    const base64Image = await blobToBase64(apiResponse.data);

    return {
      type: "success",
      data: {
        blob: apiResponse.data,
        base64: base64Image,
      },
    };
  } catch (error) {
    // 🚫 Abort should NOT retry
    if (signal?.aborted) {
      console.warn("🛑 Request aborted");
      throw error;
    }

    if (retryCount < MAX_RETRIES) {
      return createMockupViewAPI(
        specs,
        uploadedSceneBase64,
        uploadedFile,
        quotationId,
        signal,
        retryCount + 1,
        mainType
      );
    }

    throw error;
  }
};

export const createMockupViewThunk = createAsyncThunk(
  "mockup/createMockupView",
  async (
    { specs, uploadedSceneBase64, uploadedFile, quotationId, mainType },
    { rejectWithValue, signal }
  ) => {
    try {
      const response = await createMockupViewAPI(
        specs,
        uploadedSceneBase64,
        uploadedFile,
        quotationId,
        signal, // 👈 IMPORTANT
        0,
        mainType
      );

      if (response.type === "success") {
        return response.data;
      } else {
        return rejectWithValue("Mockup generation failed");
      }
    } catch {
      return rejectWithValue("Request aborted");
    }
  }
);

export const createRegenerateMockupViewThunk = createAsyncThunk(
  "mockup/createRegenerateMockupViewThunk",
  async (
    { specs, uploadedSceneBase64, uploadedFile, regenratedMockupName },
    { dispatch, rejectWithValue }
  ) => {
    dispatch(setRegenerateMockups(regenratedMockupName));

    const response = await createMockupViewAPI(
      specs,
      uploadedSceneBase64,
      uploadedFile
    );

    if (response.type === "success") {
      dispatch(
        setAllMockupsAndQuotes({
          name: regenratedMockupName,
          mockupImage: response.data.base64,
        })
      );
      return {
        name: regenratedMockupName,
        blob: response.data.blob,
        base64: response.data.base64,
      };
    }
    return rejectWithValue("Mockup generation failed");
  }
);
