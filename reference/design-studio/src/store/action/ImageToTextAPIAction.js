import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import axios from "axios";
import { localStorageTokenKey } from "../../utils/localStorageTokenKey";
import {
  setDetectedLines,
  setObjects,
  setToolsOptions,
  setRacewayData,
} from "../Slices/SignFormSlice";
import API from "../../json/apiConfig.js";

export const imageToTextAPI = async (file, signHeight, dimension, options) => {
  if (!file || !options?.sign_height || !options?.user_input_dimension) return;
  // throw new Error("Missing required parameters");

  let formData = new FormData();
  formData.append("sign_image", file);
  formData.append("sign_width_or_height", signHeight || options.sign_height);
  formData.append(
    "user_input_dimension",
    dimension || options.user_input_dimension
  );

  const response = await axios.post(
    `${API.BACKEND_API_URL}/get/image-to-text`,
    formData,
    {
      headers: {
        Authorization: "Bearer " + localStorage.getItem(localStorageTokenKey),
      },
    }
  );

  return response.data;
};

export const imageToTextThunk = createAsyncThunk(
  "imageToText/fetch",
  async (
    { file, signHeight = null, dimension = null },
    { getState, dispatch, rejectWithValue }
  ) => {
    const { options, racewayData, toolsOptions } = getState().SignForm; // adjust slice name
    try {
      // 🔹 API Call (pure function)

      if (!file || !options?.sign_height || !options?.user_input_dimension)
        return;

      const apiResponse = await imageToTextAPI(
        file,
        signHeight,
        dimension,
        options
      );

      console.log("apiResponse", apiResponse);

      // 🔹 Lines Detection
      if (apiResponse?.linesDetection?.sections?.length > 0) {
        dispatch(setDetectedLines(apiResponse.linesDetection.sections));
      } else {
        dispatch(setDetectedLines([]));
      }

      // 🔹 Objects
      if (apiResponse?.data?.objects?.length > 0) {
        let dataOfResponse = apiResponse.data;

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
            no_of_letters:
              dataOfResponse?.no_of_letters ?? toolsOptions.no_of_letters,
            perimeter_of_sign:
              dataOfResponse?.perimeter_of_sign ??
              toolsOptions.perimeter_of_sign,
            nested_area:
              dataOfResponse?.nested_area ?? toolsOptions.nested_area,
            occupied_area:
              dataOfResponse?.occupied_area ?? toolsOptions.occupied_area,
            avg_char_height:
              dataOfResponse?.avg_char_height ?? toolsOptions.avg_char_height,
            width_of_sign:
              dataOfResponse?.width_of_sign ?? toolsOptions.width_of_sign,
            width_of_smaller_line:
              dataOfResponse?.width_of_smaller_line ??
              toolsOptions.width_of_smaller_line,
            other_dimension_of_sign:
              dataOfResponse?.other_dimension_of_sign ??
              toolsOptions.other_dimension_of_sign,
          })
        );

        dispatch(
          setRacewayData({
            ...racewayData,
            no_of_lines: dataOfResponse?.no_of_lines ?? racewayData.no_of_lines,
            raceway_objects:
              dataOfResponse?.raceway_objects ?? racewayData.raceway_objects,
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

      return apiResponse;
    } catch (error) {
      console.log("dfjdlkfjsklfsd", error);
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

      // if (!error?.success) {
      //   toast.error(
      //     error?.message
      //   );
      // } else {
      toast.error(
        error?.response?.data?.error || error?.response?.data?.message
      );
      // }

      console.error("error in imageToTextThunk", error);

      return rejectWithValue(error.response?.data || error.message);
    }
  }
);
