import { useEffect, useRef, useState } from "react";
import QuoteAndMockupsResult from "../QuoteAndMockupsResult";
import TextCanvas from "./TextCanvas";
import SignzeMockupViewer from "../../../reusable/SignzeMockupViewer";

const TextRightPanel = ({
  removeIndex,
  setRemoveIndex,
  canvasRef,
  mockupImage,
  mockupLoading,
  openMobileSidebar,
  setOpenMobileSidebar,
  lightBoxType,
  trimType,
  returnColor,
  fabricatedFinish,

  viewMockupOverCanvas,
  setViewMockupOverCanvas
}) => {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: null, height: null });

  const [showLoader, setShowLoader] = useState(true)
  const [canvasActualZoom, setCanvasActualZoom] = useState(1)

  console.log('viewMockupOverCanvas', viewMockupOverCanvas)

  useEffect(() => {

    setTimeout(() => {
      setShowLoader(false)
    }, 200);

    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [viewMockupOverCanvas]);

  return (
    <div className="flex-1 relative canvas-grid animate-slide-in-right">
      <div className="h-full relative md:grid grid-cols-3" id="canvasContainer">

        {viewMockupOverCanvas && <SignzeMockupViewer
          mockupImage={mockupImage}
          mockupLoading={mockupLoading}
          lightBoxType={lightBoxType}
          trimType={trimType}
          returnColor={returnColor}
          fabricatedFinish={fabricatedFinish}
          setOpenMobileSidebar={setOpenMobileSidebar}
          openMobileSidebar={openMobileSidebar}

          viewMockupOverCanvas={viewMockupOverCanvas}
          setViewMockupOverCanvas={setViewMockupOverCanvas}
        />}

        {!viewMockupOverCanvas && <div
          ref={containerRef}
          className="w-full md:h-[96vh] h-[70vh] col-span-2 main-quote-container-check relative"
        >

          {showLoader && <div className="absolute top-0 md:block hidden left-0 w-full h-full bg-white z-50 grayprint-grid">
            <div className="w-full h-full flex flex-col items-center justify-center pb-[100px] text-black text-xl" >
              {/* Loading... */}
            </div>
          </div>}

          {size.width && size.height ? (
            <TextCanvas
              containerWidth={size.width}
              containerHeight={size.height}
              removeIndex={removeIndex} setRemoveIndex={setRemoveIndex}
              ref={canvasRef}
              viewMockupOverCanvas={viewMockupOverCanvas}
              setViewMockupOverCanvas={setViewMockupOverCanvas}
              canvasActualZoom={canvasActualZoom}
              setCanvasActualZoom={setCanvasActualZoom}
            />
          ) : null}
        </div>}

        <QuoteAndMockupsResult />
      </div>
    </div>
  );
};

export default TextRightPanel;