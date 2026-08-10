import { useEffect, useRef, useState } from "react";
import { useCreateMockupView } from "../../../../hooks/useCreateMockupView";
import { useDispatch, useSelector } from "react-redux";
import { fetchFormCalculation } from "../../../../store/action/FormAction";
import { buildFormData } from "../../../../utils/buildFormData";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MockupLoader, SignizeLoader } from "../../../reusable/SignizeLoader";
import axios from "axios";
import { setAllMockupsAndQuotes } from "../../../../store/Slices/SignFormSlice";
import { Button } from "@/components/ui/button";
import { base64ToBlobUrl } from "../../../../utils/base64ToBlobUrl";
import { Download, RefreshCw } from "lucide-react";
import { createRegenerateMockupViewThunk } from "../../../../store/action/createSingleMockup";
import { base64ToFile } from "../../../../utils/base64ToFile";

const SingleMockupCall = ({
  mockup,
  shouldRun,
  onDone,
  mockupCost,
  generatedMockupImage,
}) => {
  const {
    uploaded_file,

    uploaded_scene_baseUrl,
    imagePreview,
  } = useSelector((state) => state.SignForm);
  const { actualSignWidth } = useSelector(
    (state) => state.TextCanvas
  );
  const dispatch = useDispatch();

  const { mockupImage, mockupError } = useCreateMockupView({
    uploadedFile: uploaded_file,
  });

  const [singleMockupPrice, setSingleMockupPrice] = useState(mockupCost);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const {
    options,
    objects,
    racewayData,
    ResponseObject,
    backerData,
    signOptionsValues,
    toolsOptions,
    regenerateMockups,
    default_options,
    quotationId,
    module_name
  } = useSelector((state) => state.SignForm);

  const { mainType, secondaryType, tertiaryType, optionType } = useSelector((state) => state.GlobalSigns);

  const calculationControllerRef = useRef(null);

  console.log("regenerateMockups", regenerateMockups);

  const getCalculation = async () => {
    if (calculationControllerRef.current) {
      calculationControllerRef.current.abort(); // cancel previous
    }
    calculationControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const selectedOption = default_options?.["sign_type"]?.find(
        (item) => item.name === mockup?.name
      );

      console.log("selectedOption", selectedOption);

      let findDefaultDepth = default_options?.["depths"]?.find(
        (item) => item.sign_type === mockup?.name
      );
      console.log("findDefaultDepth", findDefaultDepth);
      // const selectedDepth = findDefaultDepth?.standard || null;

      let signDepthVal = options?.sign_depth;
      if (findDefaultDepth) {
        if (
          options?.sign_depth >= findDefaultDepth?.min &&
          options?.sign_depth <= findDefaultDepth?.max
        ) {
          signDepthVal = options?.sign_depth;
        } else {
          signDepthVal = findDefaultDepth?.standard;
        }
      }

      console.log("signDepthVal", signDepthVal);

      let updatedOptionsData = {
        ...options,
        sign_type: mockup.name,
        sign_depth: signDepthVal,
      };

      const formData = buildFormData({
        options: updatedOptionsData,
        objects,
        racewayData,
        ResponseObject,
        backerData,
        signOptionsValues,
        toolsOptions,
        quotationId,
        mockupCreationType: "multi",
        uploaded_file,

        mainType,
        secondaryType,
        tertiaryType,
        optionType,

        module_name,
        textBasedImage: uploaded_file,
        textBasedWidth: module_name == 'text' ? +actualSignWidth : null,
        textBasedDimension: module_name == 'text' ? 'width' : null,
      });

      const result = await fetchFormCalculation(formData, {
        signal: calculationControllerRef.current.signal, // pass abort signal
      });

      dispatch(setAllMockupsAndQuotes({ name: mockup.name, cost: result?.calculation }));

      setSingleMockupPrice(result?.calculation);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      if (axios.isCancel(err) || err.name === "CanceledError") {
        console.log("❌ Calculation request canceled");
        return;
      }
      console.error("API error:", err);
    } finally {
      setLoading(false);
    }
  };

  const hasRun = useRef(false);

  useEffect(() => {
    if (!hasRun.current) {
      // if (uploaded_file) {
      //   callCreateMockupView(mockup); // hook handles its own cancel
      // }
      if (!mockupCost) {
        getCalculation();
      }

      hasRun.current = true;
    }

    if (!shouldRun) return; // 🚫 only run when parent tells
    const run = async () => {
      // if (uploaded_file) {
      //   if(!generatedMockupImage){
      //     await callCreateMockupView(mockup);
      //   }

      // }
      // await getCalculation();
      onDone?.(); // ✅ tell parent we’re done
    };
    run();

    // return () => {
    //   if (calculationControllerRef.current) {
    //     calculationControllerRef.current.abort();
    //   }
    // };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun]);

  // const setBgImage = (resultantImage) => {
  //   console.log("setting mockup iamge agan");
  //   dispatch(
  //     setAllMockupsAndQuotes({ name: mockup.name, mockupImage: resultantImage })
  //   );
  // };

  // useEffect(() => {
  //   if (!uploaded_file) {
  //     // navigate(-1);
  //   }

  // if (!hasRun.current) {
  //   if (uploaded_file) {
  //     callCreateMockupView(mockup); // hook handles its own cancel
  //   }
  //   getCalculation();
  //   hasRun.current = true;
  // }

  //   // 🧹 cleanup → cancel requests when component unmounts
  //   return () => {
  //     if (calculationControllerRef.current) {
  //       calculationControllerRef.current.abort();
  //     }
  //   };
  // }, [uploaded_file, mockup, navigate]);

  return (
    <div className="border-2 md:p-5 p-1 relative">
      {!regenerateMockups?.find((item) => item == mockup.name) &&
        (generatedMockupImage || !mockupImage) && (
          <div className="absolute top-0 right-0 z-10">
            <Button
              className="btn-primary me-2"
              onClick={() => {
                // callCreateMockupView(mockup, setBgImage);

                dispatch(
                  createRegenerateMockupViewThunk({
                    specs: mockup,
                    uploadedSceneBase64: uploaded_scene_baseUrl,
                    uploadedFile: base64ToFile(imagePreview, "image.png"),
                    regenratedMockupName: mockup.name,
                  })
                );
              }}
            >
              <RefreshCw size={24} strokeWidth={2} />
            </Button>
            <Button
              className="btn-primary"
              onClick={() => {
                const imageSrc = mockupImage
                  ? mockupImage
                  : generatedMockupImage?.startsWith("data:image")
                    ? generatedMockupImage
                    : `data:image/png;base64,${generatedMockupImage}`;

                if (imageSrc) {
                  const link = document.createElement("a");
                  link.href = imageSrc;
                  link.download = `${mockup.name}.png`; // file name
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
            >
              <Download size={24} />
            </Button>
          </div>
        )}
      {((uploaded_file || imagePreview) && !generatedMockupImage) ||
        regenerateMockups?.find((item) => item == mockup.name) ? (
        <div className="p-5 py-20">
          <MockupLoader />
        </div>
      ) : mockupError ? (
        <div>
          <div className="bg-red-500 text-white py-2 mt-4 px-3">
            {mockupError}
          </div>
          <button
            className="btn-secondary mt-5"
            onClick={() => {
              dispatch(
                createRegenerateMockupViewThunk({
                  specs: mockup,
                  uploadedSceneBase64: uploaded_scene_baseUrl,
                  uploadedFile: base64ToFile(imagePreview, "image.png"),
                  regenratedMockupName: mockup.name,
                })
              );
            }}
          >
            Try Again
          </button>
        </div>
      ) : mockupImage || generatedMockupImage ? (
        <div className="relative">
          {/* <div className="absolute top-0 right-0">
            <Button
              className="btn-primary me-2"
              onClick={() => {
                callCreateMockupView(mockup);
              }}
            >
              <RefreshCw size={24} strokeWidth={2} />
            </Button>
            <Button
              className="btn-primary"
              onClick={() => {
                const imageSrc = mockupImage
                  ? mockupImage
                  : generatedMockupImage?.startsWith("data:image")
                  ? generatedMockupImage
                  : `data:image/png;base64,${generatedMockupImage}`;

                if (imageSrc) {
                  const link = document.createElement("a");
                  link.href = imageSrc;
                  link.download = `${mockup.name}.png`; // file name
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
            >
              <Download size={24} />
            </Button>
          </div> */}

          <a
            href={
              mockupImage
                ? mockupImage
                : generatedMockupImage
                  ? base64ToBlobUrl(
                    generatedMockupImage.startsWith("data:image")
                      ? generatedMockupImage
                      : `data:image/png;base64,${generatedMockupImage}`
                  )
                  : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={
                mockupImage
                  ? mockupImage
                  : generatedMockupImage?.startsWith("data:image")
                    ? generatedMockupImage
                    : `data:image/png;base64,${generatedMockupImage}`
              }
              alt="Generated Mockup"
              className="w-full cursor-pointer rounded-2xl mb-5 object-fill"
            />
          </a>
        </div>
      ) : (
        ""
      )}

      <div className="bg-white/0 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden px-3 shadow-lg">
        {loading ? (
          <div className="p-5">
            <SignizeLoader />
          </div>
        ) : error ? (
          <div>
            <div className="md:text-lg text-md mb-2 p-3">
              Sign Type:{" "}
              <span className="md:text-lg text-md font-bold">
                {mockup.name}
              </span>
            </div>
            <div className="text-red-500 md:text-lg px-3 text-md">
              {error}
            </div>
          </div>
        ) : (
          singleMockupPrice && (
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>
                  <div className="md:text-lg text-md ">
                    Sign Type:{" "}
                    <span className="md:text-lg text-md font-bold">
                      {mockup.name}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* {singleMockupPrice?.data?.sign_type && (
                    <div className="md:text-lg text-md mb-2">
                      Sign Type:{" "}
                      <span className="md:text-lg text-md font-bold">
                        {singleMockupPrice?.data?.sign_type}
                      </span>
                    </div>
                  )} */}
                  {/* {singleMockupPrice?.data?.mounting_type && (
                    <div className="md:text-lg text-md mb-2">
                      Mounting Type:{" "}
                      <span className="md:text-lg text-md font-bold">
                        {singleMockupPrice?.data?.mounting_type}
                      </span>
                    </div>
                  )} */}
                  <div className="md:text-lg text-md mb-2">
                    Sign Size:{" "}
                    <span className="md:text-lg text-md font-bold">
                      {singleMockupPrice?.data?.signWidth &&
                        (+singleMockupPrice?.data?.signWidth)?.toFixed(2) +
                        '"' +
                        " (w)"}{" "}
                      x{" "}
                      {singleMockupPrice?.data?.signHeight &&
                        (+singleMockupPrice?.data?.signHeight)?.toFixed(2) +
                        '"' +
                        " (h)"}{" "}
                      x{" "}
                      {singleMockupPrice?.data?.signDepth &&
                        (+singleMockupPrice?.data?.signDepth)?.toFixed(2) +
                        '"' +
                        " (d)"}
                    </span>
                  </div>
                  {singleMockupPrice?.data?.totalCost && (
                    <div className="md:text-lg text-md mb-2">
                      Sign Price:{" "}
                      <span className="md:text-lg text-md font-bold">
                        ${singleMockupPrice?.data?.totalCost?.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="md:text-lg text-md mb-2">
                    {" "}
                    TAT:{" "}
                    <span className="md:text-lg text-md font-bold">
                      {singleMockupPrice?.data?.tATDays
                        ? singleMockupPrice?.data?.tATDays
                        : 14}{" "}
                      days
                    </span>{" "}
                  </div>
                  {/* {getMinShipmentCostObject(
                    singleMockupPrice?.data?.shipping_rates?.data
                  ) && (
                    <div className="md:text-lg text-md mb-2">
                      Preffered Carrier:{" "}
                      <span className="md:text-lg text-md font-bold">
                        {" "}
                        {getMinShipmentCostObject(
                          singleMockupPrice?.data?.shipping_rates?.data
                        )}
                      </span>
                    </div>
                  )} */}
                  {/* {singleMockupPrice?.data?.shipping_rates?.data?.[0]?.[
                    "boxWeights"
                  ]?.[0]?.["higherWeight"] && (
                    <div className="md:text-lg text-md mb-2">
                      Estimated Weight:{" "}
                      <span className="md:text-lg text-md font-bold">
                        {singleMockupPrice?.data?.shipping_rates?.data?.[0]?.[
                          "boxWeights"
                        ]?.[0]?.["higherWeight"]?.toFixed(2)}{" "}
                        (KG)
                      </span>
                    </div>
                  )} */}
                  {/* <div className="md:text-lg text-md mb-2">
                    Estimated Box Size:
                    <span className="md:text-lg text-md font-bold">
                      {singleMockupPrice?.data?.shipping_rates?.data?.[0]?.[
                        "boxWeights"
                      ]?.map((item, index) => {
                        return (
                          <div>
                            <div className="my-1">
                              Box {index + 1}: {item?.size?.width?.toFixed(2)}"
                              (w) x {item?.size?.height?.toFixed(2)}" (h) x{" "}
                              {item?.size?.length?.toFixed(2)}" (d){" "}
                            </div>
                          </div>
                        );
                      })}
                    </span>
                  </div> */}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )
        )}
      </div>
    </div>
  );
};

export default SingleMockupCall;
