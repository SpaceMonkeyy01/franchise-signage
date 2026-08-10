import { useState, useRef, useEffect } from "react";
import axios from "axios";
import API from "../json/apiConfig.js";
import { localStorageTokenKey } from "../utils/localStorageTokenKey";
import { useSelector } from "react-redux";
import { blobToBase64 } from "../utils/blobToBase64";
import { getMockupTypes } from "../utils/getMockupTypes";
import { base64ToBlobUrl } from "../utils/base64ToBlobUrl";
import { getBackgroundImageName } from "../utils/backgroundImageName";

export function useCreateMockupView({ uploadedFile }) {
  const [mockupLoading, setMockupLoading] = useState(false);
  const [mockupError, setMockupError] = useState(null);
  const [mockupImage, setMockupImage] = useState(null);

  const { default_options, options, uploaded_scene_baseUrl } = useSelector(
    (state) => state.SignForm
  );
  const { mainType } = useSelector(
    (state) => state.GlobalSigns
  );

  const retryAttempted = useRef(false);
  const controllerRef = useRef(null); // keep reference for cancellation

  const callCreateMockupView = async (specs = null, setBgImage = null) => {
    // cancel previous request if still running
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      setMockupLoading(true);
      setMockupError(null);

      let sceneBlob;
      if (uploaded_scene_baseUrl) {
        sceneBlob = base64ToBlobUrl(uploaded_scene_baseUrl);
      } else {
        // fallback
        const response = await fetch(`/${getBackgroundImageName(mainType)}`);
        sceneBlob = await response.blob();
      }

      const formData = new FormData();
      formData.append("LogoImage", uploadedFile);
      formData.append("sceneImage", sceneBlob, getBackgroundImageName(mainType));

      if (!specs) {
        const findSignType = options?.sign_type;
        const mockupSignTypes = getMockupTypes(default_options);
        let findedMockup =
          mockupSignTypes.find((item) => item.name == findSignType) ||
          mockupSignTypes[0];

        Object.entries(findedMockup).forEach(([key, value]) => {
          formData.append(key, value);
        });
      } else {
        Object.entries(specs).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      // 🚀 cancellable axios request
      const apiRequest = await axios.post(
        `${API.BACKEND_API_URL}/generate-mockup`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization:
              "Bearer " + localStorage.getItem(localStorageTokenKey),
          },
          responseType: "blob",
          signal: controller.signal, // <-- cancellation hook here
        }
      );

      retryAttempted.current = false;

      const imageUrl = URL.createObjectURL(apiRequest.data);
      setMockupImage(imageUrl);
      const base64Image = await blobToBase64(apiRequest.data);
      // Pass base64 to Redux
      setBgImage?.(base64Image);
    } catch (error) {
      if (axios.isCancel(error) || error.name === "CanceledError") {
        console.log("❌ Request canceled by user/navigation");
        return; // don’t retry on cancel
      }

      // if (!retryAttempted.current) {
      //   retryAttempted.current = true;
      //   console.warn("Retrying mockup generation once...");
      setMockupLoading(false);
      await callCreateMockupView(specs);
      return;
      // }
      // setMockupError("Something went wrong");
      // console.error("error while creating mockup view", error);
    } finally {
      setMockupLoading(false);
    }
  };

  // cleanup when component using this hook unmounts
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { mockupLoading, mockupImage, callCreateMockupView, mockupError };
}
