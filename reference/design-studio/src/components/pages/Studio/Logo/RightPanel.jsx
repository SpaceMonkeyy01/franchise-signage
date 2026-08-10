import SignzeMockupViewer from "../../../reusable/SignzeMockupViewer";
import QuoteAndMockupsResult from "../QuoteAndMockupsResult";

const RightPanel = ({
  mockupImage,
  mockupLoading,
  openMobileSidebar,
  setOpenMobileSidebar,
  lightBoxType,
  trimType,
  returnColor,
  fabricatedFinish,
}) => {
  return (
    <div className="flex-1 relative canvas-grid animate-slide-in-right">
      {/* <!-- Main Preview Area --> */}
      <div
        className="h-full relative md:grid grid-cols-3  "
        id="canvasContainer"
      >
        <SignzeMockupViewer
          mockupImage={mockupImage}
          mockupLoading={mockupLoading}
          lightBoxType={lightBoxType}
          trimType={trimType}
          returnColor={returnColor}
          fabricatedFinish={fabricatedFinish}
          setOpenMobileSidebar={setOpenMobileSidebar}
          openMobileSidebar={openMobileSidebar}
        />
        <QuoteAndMockupsResult />
      </div>
    </div>
  );
};

export default RightPanel;
