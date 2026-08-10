import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setCreatedBackgroundMockupURL } from "../../store/Slices/SignFormSlice";
import { Menu } from "lucide-react";
import { getBackgroundImageName } from "../../utils/backgroundImageName";
import MockupProgressLoader from "./MockupProgressLoader";
import Toggle from "@/components/ui/Toggle";
import StudioBrandLogo from "../StudioBrandLogo";

const SignzeMockupViewer = ({
  mockupImage,
  mockupLoading,
  // lightBoxType,
  // trimType,
  // returnColor,
  // fabricatedFinish,
  setOpenMobileSidebar,
  openMobileSidebar,


  viewMockupOverCanvas,
  setViewMockupOverCanvas
}) => {
  const { uploaded_scene_baseUrl, created_background_mockup_URL } = useSelector(
    (state) => state.SignForm,
  );
  const dispatch = useDispatch();
  const { mainType } = useSelector(
    (state) => state.GlobalSigns
  );
  useEffect(() => {
    if (mockupImage) {
      dispatch(setCreatedBackgroundMockupURL(mockupImage));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockupImage]);

  return (
    <div className="md:w-full md:h-[96vh] col-span-2 relative overflow-hidden bg-background border-r-2 border-gray-700 border-dashed">
      <button
        className="xl:hidden absolute z-50 top-2 left-3 custom-primary p-4 rounded-xl cursor-pointer"
        onClick={() => {
          setOpenMobileSidebar(!openMobileSidebar);
        }}
      >
        <Menu
          className=" text-black w-5 h-5  font-bold cursor-pointer top-0 left-0"
          strokeWidth={1.5}
        />
      </button>
      {/* {regenerateMockupPayload && (
        <button
          className=" absolute top-2 right-3 custom-primary p-4 rounded-xl cursor-pointer"
          onClick={() => {
            if (regenerateMockupPayload)
              dispatch(
                createMockupViewThunk({
                  specs: regenerateMockupPayload,
                  uploadedSceneBase64: uploaded_scene_baseUrl,
                  uploadedFile: base64ToFile(imagePreview, "image.png"),
                })
              );
          }}
        >
          <RefreshCcw className="w-5 h-5 text-black" />
        </button>
      )} */}


      {setViewMockupOverCanvas && <div className="absolute top-2 right-3  p-4 rounded-xl cursor-pointer">
        <Toggle
          enabled={viewMockupOverCanvas}
          onChange={setViewMockupOverCanvas}
          disabled={mockupLoading}
          label="View Canvas"
        />
      </div>}
      {mockupLoading && (
        <MockupProgressLoader
          mockupLoading={mockupLoading}
          created_background_mockup_URL={created_background_mockup_URL}
        />
      )}

      {/* The scene image is centered + letterboxed (object-contain). Wrapping it
          so the wrapper hugs the rendered image lets the company logo sit in the
          image's own top-right corner, not the empty container corner. */}
      <div className="w-full h-full flex items-center justify-center">
        <div className="relative w-full h-full">
          <img
            src={
              created_background_mockup_URL ||
              uploaded_scene_baseUrl ||
              `/${getBackgroundImageName(mainType)}`
            }
            alt={created_background_mockup_URL ? "Generated Mockup" : "Scene"}
            className="block w-full h-full bg-background object-cover"
          />
          <StudioBrandLogo />
          {/* The side view + quote card are intentionally NOT overlaid on the
              live canvas — they're composed into the proposal/estimate download
              only (see useProposalDownload + proposalImage). */}
        </div>
      </div>
    </div>
  );
};

export default SignzeMockupViewer;
