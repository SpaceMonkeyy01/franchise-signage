import UploadScene from "../../reusable/UploadScene";
import CroppedImage from "./Logo/CroppedImage";
import { useDispatch, useSelector } from "react-redux";
import SideViewImage from "./Logo/SideViewImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { GetAllMockups } from "../../../store/action/MockupAndQuotes";
import { base64ToFile } from "../../../utils/base64ToFile";
import { getMockupTypes } from "../../../utils/getMockupTypes";
import AllMockups from "../../../pages/AllMockups";
import FulfillmentCost from "./FulfillmentCost";
import AttachToRequest from "../../../embed/AttachToRequest";
import { readEmbedParams } from "../../../embed/embedParams";
import { getBackgroundImageName } from "../../../utils/backgroundImageName";
import { useRole } from "../../../hooks/useRole";
import { ROLES } from "../../../config/roles";

const QuoteAndMockupsResult = () => {
  const {
    ResponseObject,
    created_background_mockup_URL,
    uploaded_file,
    default_options,
    uploaded_scene_baseUrl,
    allMockupCreationLoading,
    allMockupsCreated,
    imagePreview,
    created_background_mockup_loading,
    module_name,
  } = useSelector((state) => state.SignForm);
  const dispatch = useDispatch();

  const { mainType } = useSelector(
    (state) => state.GlobalSigns
  );

  // Customers get a simplified panel: only the estimate actions (Download / Save
  // / Purchase). The scene tools, mockup generation, and Signize cost are staff-
  // facing and hidden for the `user` role.
  const isCustomer = useRole() === ROLES.USER;
  const embedParams = readEmbedParams();

  return (
    <div className="p-5 overflow-auto pb-12">
      {!isCustomer && <UploadScene />}

      {!isCustomer && (
        <div className="grid grid-cols-2 gap-3 mt-5">
          {created_background_mockup_URL && (
            <CroppedImage base64={created_background_mockup_URL} />
          )}
          {ResponseObject?.data?.sideViewImage && <SideViewImage />}
        </div>
      )}
      {!isCustomer && ResponseObject && (
        <>
          <div className="md:mt-4 mt-4 w-full">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="lg"
                  disabled={created_background_mockup_loading}
                  onClick={async () => {
                    if (!uploaded_file) return;
                    if (allMockupCreationLoading || allMockupsCreated) {
                      return;
                    }
                    const sceneImageResponse = await fetch(
                      `/${getBackgroundImageName(mainType)}`
                    );
                    const blob = await sceneImageResponse.blob();
                    const sceneImageFile = new File(
                      [blob],
                      getBackgroundImageName(mainType),
                      {
                        type: blob.type,
                      }
                    );

                    dispatch(
                      GetAllMockups({
                        logo_file: module_name == 'text' ? uploaded_file : base64ToFile(imagePreview, "file.png"),
                        scene_file: uploaded_scene_baseUrl
                          ? base64ToFile(uploaded_scene_baseUrl, "logo.png")
                          : sceneImageFile,
                        signTypes: getMockupTypes(default_options).slice(0, 6),
                      })
                    );
                  }}
                  className={`border btn-primary disabled:cursor-not-allowed  px-3  py-5 rounded-xl w-full`}
                >
                  {created_background_mockup_loading ? (
                    <span className="loading loading-dots loading-sm"></span>
                  ) : (
                    "View All Mockups and Quotes"
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-screen lg:h-full h-[95vh] overflow-y-scroll">
                <AllMockups />
              </DialogContent>
            </Dialog>
          </div>
        </>
      )}
      {/* Quote info appears only once the mockup has been generated and shown
          (created_background_mockup_URL), not on the bare price response. */}
      {ResponseObject && created_background_mockup_URL && (
        <div className=" rounded mt-5 p-2 ">
          {/* Internal fulfillment cost, staff-only. Never shown in embed mode —
              an embedded studio is franchisee-facing by definition. */}
          {!isCustomer && !embedParams.embed && <FulfillmentCost />}
          {/* Embed terminal action: hand the mockup + estimate back to the host
              portal instead of a retail checkout (spec §8.2 / §8.4). */}
          {embedParams.embed && <AttachToRequest params={embedParams} />}
        </div>
      )}
    </div>
  );
};

export default QuoteAndMockupsResult;
