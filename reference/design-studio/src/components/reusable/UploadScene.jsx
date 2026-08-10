import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useDispatch } from "react-redux";
import {
  setRegenerateMockupPayload,
  setUploadedSceneBaseURL,
} from "../../store/Slices/SignFormSlice";

const UploadScene = () => {
  const fileInputRef = useRef(null);

  const dispatch = useDispatch();

  // Trigger file input click
  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  // Handle file selection and convert to base64
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    dispatch(setRegenerateMockupPayload(null));

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result;
      dispatch(setUploadedSceneBaseURL(base64));
      console.log("Base64 Image:", base64);

      // 👉 You can send `base64` to API or store it in state
    };
  };

  return (
    <div className="text-end w-full">
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        className="btn-primary w-full"
        type="button"
        size="lg"
        onClick={handleButtonClick}
      >
        Add Background Scene
      </Button>
    </div>
  );
};

export default UploadScene;
