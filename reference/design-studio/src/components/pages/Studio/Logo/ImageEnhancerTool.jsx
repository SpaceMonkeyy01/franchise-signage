import { lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
// import CanvasImageEditor from "../../../reusable/CanvasImageEditor";
const CanvasImageEditor = lazy(() =>
  import("../../../reusable/CanvasImageEditor")
);
import { useSelector } from "react-redux";

const ImageEnhancerTool = ({ imageToTextAPILoading }) => {
  const { imagePreview, toolsOptions } = useSelector((state) => state.SignForm);

  return (
    <Dialog>
      <DialogTrigger disabled={imageToTextAPILoading}>
        <Button
          className="btn-primary"
          type="button"
          disabled={imageToTextAPILoading}
        >
          {imageToTextAPILoading ? (
            <span className="loading loading-dots loading-sm"></span>
          ) : (
            "Measure Stoke / Add Seam Line"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1400px] h-[96vh] overflow-auto p-0">
        <Suspense fallback={<div>Loading...</div>}>
          <CanvasImageEditor
            imageUrl={imagePreview}
            toolsOptions={toolsOptions}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};

export default ImageEnhancerTool;
