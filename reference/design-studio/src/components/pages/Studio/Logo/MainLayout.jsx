import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PathSelector from "../PathSelector";
import { useDispatch, useSelector } from "react-redux";
import MountingTypeSelect from "../../../reusable/MountingTypeSelect";
import SignMaterialOptions from "../../../SignMaterialOptions";
import { X } from "lucide-react";
import {
  emptyAllMockupsAndQuotes,
  restoreDefaultSignForm,
  setBackerData,
  setCreatedBackgroundMockupURL,
  setDetectedLines,
  setImagePreview,
  setModuleName,
  setObjects,
  setOptions,
  setRacewayData,
  setRegenerateMockupPayload,
  setReturnColor,
  setShape,
  setSignOptionsValues,
  setSingleFilteredOption,
  setToolsOptions,
  setTrimType,
  setUpload_file,
} from "../../../../store/Slices/SignFormSlice";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { No_Of_Lines } from "../../../../utils/racewayData";
import { GetFormCalculation } from "../../../../store/action/FormAction";
import { useCreateMockupView } from "../../../../hooks/useCreateMockupView";
import RightPanel from "./RightPanel";
import { buildFormData } from "../../../../utils/buildFormData";
import { Button } from "@/components/ui/button";
import { base64ToFile } from "../../../../utils/base64ToFile";
import { getMockupTypes } from "../../../../utils/getMockupTypes";
import ImageEnhancerTool from "./ImageEnhancerTool";
import { DEFAULT_SIGN_DEPTH } from "../../../../lib/defaultSignDepth";
import DetectedLines from "./DetectedLines";
import { createMockupViewThunk } from "../../../../store/action/createSingleMockup";
import { imageToTextThunk } from "../../../../store/action/ImageToTextAPIAction";
import Toggle from "@/components/ui/Toggle";
import SingleObjectItem from "./SingleObjectItem";
import TextRightPanel from "../Text/TextRightPanel";
import DesignPrepModal from "../../../reusable/DesignPrepModal";

import GlobalSign from "../../../reusable/GlobalSign";
import { readEmbedParams } from "../../../../embed/embedParams";
import { buildDataForSheet } from "../../../../utils/buildDataForSheet";


import { resetB2SignLogo } from "../../../../store/Slices/B2SignLogoSlice";
import { resetUSAWorkshop } from "../../../../store/Slices/USAWorkShopSlice";
import TextCanvasForm from "../Text/TextCanvasForm";

const MainLayout = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  // Embed mode (spec §8) — read from the URL so nothing needs to be threaded
  // through props from the route.
  const embedParams = readEmbedParams();
  const mockupThunkRef = useRef(null);
  const canvasRef = useRef();

  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);

  const [formErrors, setFormErrors] = useState(null);

  const [isNeonSignSelected, setIsNeonSignSelected] = useState(false);
  const [viewMockupOverCanvas, setViewMockupOverCanvas] = useState(false)

  // Mockup toggle state with localStorage persistence
  const [createMockup, setCreateMockup] = useState(() => {
    const saved = localStorage.getItem('createMockup');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [racewayErrors, setRacewayErrors] = useState([]);

  const [openAccordions, setOpenAccordions] = useState([false, false, false]);
  const [advancedAccordions, setAdvancedAccordions] = useState([false]);
  const [objectErrors, setObjectErrors] = useState([]);
  const [defaultDepth, setDefaultDepth] = useState(
    DEFAULT_SIGN_DEPTH["default"]
  );


  // states for text form 
  const [removeIndex, setRemoveIndex] = useState(null);
  // states for text form 

  const errorMsg = "Required";

  useEffect(() => {
    // navigate("/studio/logo");

    const preventDefault = (e) => e.preventDefault();
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  // Persist mockup toggle state to localStorage
  useEffect(() => {
    localStorage.setItem('createMockup', JSON.stringify(createMockup));
  }, [createMockup]);

  const handleFile = (file) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log("e.target.result", e.target.result);
        dispatch(setImagePreview(e.target.result));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackerData = (e) => {
    dispatch(
      setBackerData({ ...backerData, [e.target.name]: +e.target.value })
    );
  };

  const handleRacewayData = (e) => {
    const { name, value } = e.target;

    if (name === "no_of_lines") {
      let numLines = Number(value);
      let racewayObjs = [...racewayData.raceway_objects];

      if (racewayObjs.length > numLines) {
        // remove extra items from the end
        racewayObjs = racewayObjs.slice(0, numLines);
      } else if (racewayObjs.length < numLines) {
        // add missing items
        const diff = numLines - racewayObjs.length;
        for (let i = 0; i < diff; i++) {
          racewayObjs.push({
            width_of_line: 0,
            max_height_of_line: 0,
          });
        }
      }

      dispatch(
        setRacewayData({
          ...racewayData,
          no_of_lines: numLines,
          raceway_objects: racewayObjs,
        })
      );
    } else {
      // normal updates

      dispatch(
        setRacewayData({
          ...racewayData,
          [name]: value,
        })
      );
    }
  };

  // Unwired: image→text geometry call kept for a not-yet-enabled flow.
  // eslint-disable-next-line no-unused-vars
  const imageToTextAPICall = async (
    file,
    signHeight = null,
    dimension = null
  ) => {
    dispatch(imageToTextThunk({ file, signHeight, dimension }));
  };

  // Unwired: object-level validation kept for re-enabling; not currently called.
  // eslint-disable-next-line no-unused-vars
  const validateObjects = () => {
    let dataErrors = [];
    objects.map((obj) => {
      let err = {};
      if (!obj.height || obj.height <= 0)
        err.height = errorMsg || "Height is required";
      if (!obj.width || obj.width <= 0)
        err.width = errorMsg || "Width is required";
      if (!obj.perimeter || obj.perimeter <= 0)
        err.perimeter = errorMsg || "Perimeter is required";
      if (!obj.area || obj.area <= 0) err.area = errorMsg || "Area is required";
      if (!obj.boxArea || obj.boxArea <= 0)
        err.boxArea = errorMsg || "Box Area is required";
      if (Object.keys(err).length > 0) dataErrors.push(err);
      return err;
    });
    setObjectErrors(dataErrors);
    if (openAccordions[1] === false && dataErrors?.length > 0)
      toggleAccordion(1);
    return dataErrors;
  };

  const toggleAccordion = (index) => {
    if (index == 1 || index == 2) {
      setAdvancedAccordions([true]);
    }

    setOpenAccordions((prev) => {
      const newState = [...prev];
      newState[index] = !newState[index];
      return newState;
    });
  };

  // useEffect(() => {
  //   navigate("/studio/logo");
  // }, []);

  const allowedExtensions = ["png", "jpg", "jpeg"];

  const validateFile = (file) => {
    if (!file) return false;

    const extension = file.name.split(".").pop().toLowerCase();

    // reject jfif explicitly
    if (!allowedExtensions.includes(extension)) {
      alert("Only PNG, JPG, and JPEG files are allowed.");
      return false;
    }

    return true;
  };

  const processFile = (file) => {
    if (!validateFile(file)) return;

    dispatch(setRegenerateMockupPayload(null));
    dispatch(setUpload_file(file));

    handleFile(file);

    setTimeout(() => {
      // imageToTextAPICall(file);
    }, 500);
  };

  const handleDrop = (e) => {
    e.preventDefault();

    const file = e.dataTransfer.files[0];
    console.log("dragged file", file);

    processFile(file);
  };

  const handleInputChange = (e) => {
    const file = e.target.files[0];

    processFile(file);
  };

  const handleRemoveObject = (index) => {
    const updatedObjects = objects.filter((_, i) => i !== index);
    if (updatedObjects.length == 0) {
      dispatch(
        setObjects([
          { height: "", width: "", perimeter: "", area: "", boxArea: "" },
        ])
      );
    } else {
      dispatch(setObjects(updatedObjects));
    }
  };

  const scrollToElement = (element_id, hasScrollToElement) => {
    if (!hasScrollToElement) {
      const container = document.querySelector("#logoFormData");
      const target = container?.querySelector(`#${element_id}`);

      if (container && target) {
        // container height
        const containerHeight = container.clientHeight;

        // element position relative to container
        const elementTop = target.offsetTop;

        // max scrollable distance inside container
        const maxScroll = container.scrollHeight - containerHeight;

        // clamp so we don’t overshoot
        const scrollPosition = Math.min(elementTop, maxScroll);

        container.scrollTo({
          top: scrollPosition,
          behavior: "smooth",
        });
      }
    }
  };

  // Unwired: raceway validation kept for re-enabling; not currently called.
  // eslint-disable-next-line no-unused-vars
  const racewayValidation = () => {
    let dataErrors = [];
    racewayData.raceway_objects.map((obj, ind) => {
      let err = {};
      if (!obj.width_of_line || obj.width_of_line <= 0) {
        err.width_of_line = "Width must be greater than 0";
      }
      if (!obj.max_height_of_line || obj.max_height_of_line <= 0) {
        err.max_height_of_line = "Height must be greater than 0";
      }
      if (Object.keys(err).length > 0) dataErrors.push({ ...err, index: ind });
      return err;
    });
    if (openAccordions[0] === false) toggleAccordion(0);
    setRacewayErrors(dataErrors);
    return dataErrors;
  };

  const {
    options,
    ResponseObject,
    uploaded_file,
    loading,
    signOptionsValues,
    default_options,
    filtered_options_by_sign_type,
    single_filtered_option,
    objects,
    racewayData,
    backerData,
    toolsOptions,
    imagePreview,
    uploaded_scene_baseUrl,
    created_background_mockup_loading,
    imageToTextAPILoading,
    module_name,
    trimType,
    fabricatedFinish,
    mockupSignType,
    lightBoxType,
    shape,
    returnColor,
    quotationId,
    // objects
  } = useSelector((state) => state.SignForm);

  const { selectedFlow, mainType, secondaryType, tertiaryType, optionType } = useSelector((state) => state.GlobalSigns);

  console.log("default_options", default_options);
  console.log("filtered_options_by_sign_type", filtered_options_by_sign_type);
  console.log("single_filtered_option", single_filtered_option);
  console.log("options_state", options);
  console.log("module_name", module_name);
  console.log("shape", shape);
  console.log("mockupSignType", mockupSignType, fabricatedFinish);

  console.log("tertiaryType, optionType", tertiaryType, optionType);


  // Your predefined order
  const orderedKeys = [
    "sign_type_halo_lit_letters",
    "sign_type_face_lit_letters",
    "sign_type_standard_face_lit_plastic_trim_letters",
    "sign_type_face_and_halo_lit_letters",
    "sign_type_fabricated_letters_non_lit",
    "sign_type_neon_sign",
    "sign_type_neon_acrylic_sign",
    "sign_type_flat_cut_acrylic_letters",
    "sign_type_flat_cut_aluminum_letters",
    "sign_type_metal_on_acrylic",
    "sign_type_single_sided_lightbox",
    "sign_type_double_sided_lightbox",
    "sign_type_3d_blade_sign",
    "sign_type_2d_blade_sign",
    "sign_type_single_sided_push_through",
    "sign_type_double_sided_push_through_cabinet",
    "sign_type_marquee_channel_letters",
    "sign_type_open_face_neon_channel_letters",
    "sign_type_mirror_infinity_channel_letters",
  ];

  // Structure and sort your sign types
  const structuredSignTypes = [];

  if (default_options?.["sign_type"]) {
    // Convert array to a map for easier lookup
    const signTypeMap = default_options["sign_type"].reduce((acc, item) => {
      acc[item.key] = item;
      return acc;
    }, {});

    // First, push the ones in the orderedKeys list
    orderedKeys.forEach((key) => {
      if (signTypeMap[key]) {
        structuredSignTypes.push(signTypeMap[key]);
        delete signTypeMap[key]; // remove so that remaining can be added later
      }
    });

    // Then, push the remaining ones that were not in orderedKeys
    Object.values(signTypeMap).forEach((item) => {
      structuredSignTypes.push(item);
    });
  }

  useEffect(() => {
    if (default_options) {
      if (
        !options?.sign_type ||
        options?.sign_type == "" ||
        options?.sign_type?.trim() == ""
      ) {
        setOptions({
          ...options,
          sign_type: default_options?.sign_type?.[0]?.name,
        });
      }
      if (
        !options?.mounting_type ||
        options?.mounting_type == "" ||
        options?.mounting_type?.trim() == ""
      ) {
        setOptions({
          ...options,
          mounting_type: default_options?.mounting_type?.[0]?.name,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);


  useEffect(() => {
    if (selectedFlow !== "form") {
      mockupThunkRef.current?.abort(); // 🔥 CANCEL API
      let testModuleName = module_name;
      dispatch(restoreDefaultSignForm())
      // dispatch(resetTextCanvas())
      dispatch(setModuleName(testModuleName))
    }
  }, [selectedFlow]);

  const { mockupImage } = useCreateMockupView({
    uploadedFile: uploaded_file,
  });

  const setOptionsData = (e) => {
    if (
      e.target.name == "mounting_type" &&
      e.target.value ==
      default_options?.["mounting_type"]?.find(
        (item) => item.key == "mounting_type_standard_raceway_6x2"
      )?.name
    ) {
      setTimeout(() => {
        if (openAccordions[0] == false) toggleAccordion(0);
      }, 10);
    } else {
      if (openAccordions[0] == true) toggleAccordion(0);
    }
    dispatch(setOptions({ ...options, [e.target.name]: e.target.value }));
  };

  const debounceTimerRef = useRef(null);

  // eslint-disable-next-line no-unused-vars
  const heightAndDimensionChange = (height, dimension) => {
    if (height !== "" && parseFloat(height) > 0) {
      // clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // set new timer
      // debounceTimerRef.current = setTimeout(() => {
      //   imageToTextAPICall(uploaded_file, height, dimension);
      // }, 500);
    }
  };

  // useEffect(() => {
  //   if (options?.sign_height !== "" && parseFloat(options?.sign_height) > 0) {
  //   const debounceTimer = setTimeout(() => {
  //     imageToTextAPICall(uploaded_file);
  //   }, 500); // 500ms debounce
  //   return () => clearTimeout(debounceTimer); // clear on cleanup
  // }
  // }, [options?.sign_height, options?.user_input_dimension]);

  const handleAddObject = () => {
    console.log("dfdfd");
    dispatch(
      setObjects([
        ...objects,
        { height: "", width: "", perimeter: "", area: "", boxArea: "" },
      ])
    );
  };

  // console.log('states are' , options , objects, racewayData, backerData, toolsOptions , signOptionsValues )

  // Update specific input field
  const handleObjectsChange = (index, field, value) => {
    const updatedObjects = [...objects];

    // clone the object before editing
    const updatedObject = { ...updatedObjects[index], [field]: value };

    if (
      field !== "boxArea" &&
      updatedObject.height > 0 &&
      updatedObject.width > 0
    ) {
      updatedObject.boxArea = updatedObject.height * updatedObject.width;
    }

    updatedObjects[index] = updatedObject; // replace with updated copy

    dispatch(setObjects(updatedObjects));

    // update tools values
    let conversionFactor = 0.00694444;
    let calculatedPerimeterOfSign = updatedObjects
      .filter((item) => item.perimeter && item.perimeter > 0)
      ?.reduce((a, b) => a + b.perimeter, 0);

    let calculatedFilledArea = updatedObjects
      .filter((item) => item.area && item.area > 0)
      ?.reduce((a, b) => a + b.area, 0);

    let calculatedHeight = updatedObjects
      .filter((item) => item.height && item.height > 0)
      ?.reduce((a, b) => a + b.height, 0);

    calculatedHeight = calculatedHeight
      ? calculatedHeight / updatedObjects.length
      : 0;

    let calculatingNestedArea = updatedObjects.reduce((a, b) => {
      if (b.height && b.width && b.height > 0 && b.width > 0) {
        return a + b.height * b.width;
      }
      return a; // if the condition fails, keep the accumulator unchanged
    }, 0);

    // console.log('updatedObjects' , updatedObjects)

    dispatch(
      setToolsOptions({
        ...toolsOptions,
        no_of_letters: updatedObjects.length,
        perimeter_of_sign: calculatedPerimeterOfSign
          ? (calculatedPerimeterOfSign / 12)?.toFixed(2)
          : 0,
        nested_area: calculatingNestedArea
          ? (calculatingNestedArea / 144).toFixed(2)
          : 0,
        occupied_area: calculatedFilledArea
          ? (calculatedFilledArea * conversionFactor)?.toFixed(2)
          : 0,
        avg_char_height:
          calculatedHeight > 24
            ? default_options?.["avg_char_height"]?.find(
              (item) => item.key == "avg_char_height_greater_than_24_inches"
            )?.name
            : default_options?.["avg_char_height"]?.find(
              (item) => item.key == "avg_char_height_less_than_24_inches"
            )?.name,
      })
    );
  };

  const setToolsOptionsData = (e) => {
    const name = e.target.name;
    const value = e.target.value;

    const newData = {
      ...toolsOptions,
      [name]: value == "" ? value : isNaN(value) ? value : Number(value),
    };

    dispatch(setToolsOptions(newData));
    // setToolsOptions((prev) => ({
    //   ...prev,
    //   [name]: value == "" ? value : isNaN(value) ? value : Number(value),
    // }));
  };

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      let hasScrollToElement = false;

      if (imageToTextAPILoading) {
        return;
      }
      let errorsData = {};
      const isValidValue = (val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === "string" && val.trim() === "") return false;
        if (typeof val === "number" && val <= 0) return false;
        return true; // includes booleans and valid numbers/strings
      };

      if (module_name == 'logo') {
        if (single_filtered_option?.basic_fields?.length > 0 &&
          single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_width_or_height' || item?.var_name == 'basic_fields_sign_height')) {
          if (!options?.sign_height && !options?.sign_width) {
            errorsData.height = errorMsg || "Please enter width or height";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          } else if (options?.sign_height <= 0 && options?.sign_width <= 0) {
            errorsData.height = "Should be greater then 0";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          }
        }

        if (single_filtered_option?.basic_fields?.length > 0 &&
          single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_height')) {
          if (!options?.sign_height) {
            errorsData.height = "Please enter height";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          } else if (options?.sign_height <= 0) {
            errorsData.height = "Should be greater then 0";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          }
        }

        if (single_filtered_option?.basic_fields?.length > 0 &&
          single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_width')) {
          if (!options?.sign_width) {
            errorsData.width = errorMsg || "Please enter width";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          } else if (options?.sign_width <= 0) {
            errorsData.width = "Should be greater then 0";
            scrollToElement("input_sign_height", hasScrollToElement);
            hasScrollToElement = true;
          }
        }
      }

      if (single_filtered_option?.basic_fields?.length > 0 &&
        single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_depth')) {
        if (!options.sign_depth) {
          errorsData.depth = errorMsg || "Sign depth is required";
          scrollToElement("input_sign_depth", hasScrollToElement);
          hasScrollToElement = true;
        } else if (!isValidValue(+options.sign_depth)) {
          errorsData.depth = "Sign depth should be greater then 0";
          scrollToElement("input_sign_depth", hasScrollToElement);
          hasScrollToElement = true;
        } else if (
          +options.sign_depth < defaultDepth.min ||
          +options.sign_depth > defaultDepth.max
        ) {
          errorsData.depth =
            defaultDepth?.min == defaultDepth?.max
              ? `Sign depth should be ${defaultDepth?.min}`
              : `Sign depth limit is from ${defaultDepth?.min} to ${defaultDepth?.max}`;
          scrollToElement("input_sign_depth", hasScrollToElement);
          hasScrollToElement = true;
        }
      }

      if (!uploaded_file && module_name == 'logo') {
        errorsData.image = errorMsg || "Neon color is required";
        scrollToElement("input_image", hasScrollToElement);
        hasScrollToElement = true;
      }


      console.log("depth error", errorsData?.depth, options.sign_depth);
      // }

      let racewayDataErrors = [];
      // if (
      //   options.mounting_type ===
      //   default_options?.["mounting_type"]?.find(
      //     (item) => item.key == "mounting_type_standard_raceway_6x2"
      //   )?.name
      // ) {
      //   racewayDataErrors = racewayValidation();
      // }

      if (single_filtered_option?.["neon_color"]?.length > 0) {
        if (!options.neon_color) {
          errorsData.neon_color = errorMsg || "Neon color is required";
          scrollToElement("input_sign_type", hasScrollToElement);
          hasScrollToElement = true;
        }
      }

      if (single_filtered_option?.["size"]?.length > 0) {
        if (!options.size) {
          errorsData.size = errorMsg || "Size is required";
          scrollToElement("input_sign_type", hasScrollToElement);
          hasScrollToElement = true;
        }
      }

      if (single_filtered_option?.["uv_printing_needed"]?.length > 0) {
        if (!options.uv_printing_needed) {
          errorsData.uv_printing_needed = errorMsg || "UV Printing is required";
          scrollToElement("input_sign_type", hasScrollToElement);
          hasScrollToElement = true;
        }
      }

      if (!options.sign_type) {
        errorsData.sign_type = errorMsg || "Sign Type is required";
        scrollToElement("input_sign_type", hasScrollToElement);
        hasScrollToElement = true;
      }

      if (
        !isNeonSignSelected &&
        single_filtered_option?.["mounting_type"]?.length > 0
      ) {
        if (!options.mounting_type) {
          errorsData.mounting_type = errorMsg || "Mounting Type is required";
          scrollToElement("input_mounting_type", hasScrollToElement);
          hasScrollToElement = true;
        }
      }

      let objectDataErrors = [];
      // objectDataErrors = validateObjects();
      // let hasError = false;
      // if (!isValidValue(toolsOptions.no_of_letters)) {
      //   errorsData.no_of_letters = errorMsg || "No. of letters are required";
      //   setTimeout(() => {
      //     scrollToElement("input_no_of_letters", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.perimeter_of_sign)) {
      //   errorsData.perimeter_of_sign =
      //     errorMsg || "Perimeter of sign is required";
      //   setTimeout(() => {
      //     scrollToElement("input_perimeter_of_sign", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.nested_area)) {
      //   errorsData.nested_area = errorMsg || "Nested area is required";
      //   setTimeout(() => {
      //     scrollToElement("input_nested_area", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.occupied_area)) {
      //   errorsData.occupied_area = errorMsg || "Occupied area is required";
      //   setTimeout(() => {
      //     scrollToElement("input_occupied_area", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.avg_char_height)) {
      //   errorsData.avg_char_height =
      //     errorMsg || "Average character height is required";
      //   setTimeout(() => {
      //     scrollToElement("input_avg_char_height", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.width_of_sign)) {
      //   errorsData.width_of_sign = errorMsg || "Width of sign is required";
      //   setTimeout(() => {
      //     scrollToElement("input_width_of_sign", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.width_of_smaller_line)) {
      //   errorsData.width_of_smaller_line =
      //     errorMsg || "Width of smaller line is required";
      //   setTimeout(() => {
      //     scrollToElement("input_width_of_smaller_line", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }
      // if (!isValidValue(toolsOptions.other_dimension_of_sign)) {
      //   errorsData.other_dimension_of_sign =
      //     errorMsg || "Other dimension of sign is required";
      //   setTimeout(() => {
      //     scrollToElement("input_other_dimension_of_sign", hasScrollToElement);
      //     hasScrollToElement = true;
      //   }, 200);
      //   hasError = true;
      // }

      // if (hasError) {
      //   if (openAccordions[2] == false) toggleAccordion(2);
      // }

      if (
        single_filtered_option?.["material"]?.length > 0 &&
        !isValidValue(signOptionsValues?.material)
      ) {
        errorsData.material = errorMsg || "Material is required";
        scrollToElement("input_material", hasScrollToElement);
        hasScrollToElement = true;
      }

      if (
        single_filtered_option?.["paint_finish"]?.length > 0 &&
        !isValidValue(signOptionsValues?.paint_finish)
      ) {
        errorsData.paint_finish = errorMsg || "Paint finish is required";
        scrollToElement("input_paint_finish", hasScrollToElement);
        hasScrollToElement = true;
      }

      if (
        single_filtered_option?.["application"]?.length > 0 &&
        !isValidValue(signOptionsValues?.application)
      ) {
        errorsData.application = errorMsg || "Application is required";
        scrollToElement("input_application", hasScrollToElement);
        hasScrollToElement = true;
      }
      if (
        single_filtered_option?.["ul_mandatory"]?.length > 0 &&
        !isValidValue(signOptionsValues?.ul_mandatory)
      ) {
        errorsData.ul_mandatory = errorMsg || "UL Mandatory field is required";
        scrollToElement("input_ul_mandatory", hasScrollToElement);
        hasScrollToElement = true;
      }

      if (
        Object.keys(errorsData).length > 0 ||
        racewayDataErrors.length > 0 ||
        objectDataErrors.length > 0
      ) {
        console.log("errorsData", errorsData);

        setFormErrors(errorsData);
      } else {
        setFormErrors(null);
        setRacewayErrors([]);
        setObjectErrors([]);
        dispatch(emptyAllMockupsAndQuotes());
        dispatch(setCreatedBackgroundMockupURL(null));
        dispatch(resetB2SignLogo())
        dispatch(resetUSAWorkshop())
        dispatch(setDetectedLines([]))

        const textBasedData = canvasRef.current?.getCanvasDataForCalculation();
        if (textBasedData?.coloredImage) {
          dispatch(setUpload_file(base64ToFile(textBasedData?.coloredImage, 'textbased.jpg')))
        }

        let staticDimension = null;
        if(textBasedData?.linesTextSignage && textBasedData?.linesTextSignage?.length == 1){
          staticDimension = {
            override_dimensions: 1,
            static_width: +textBasedData?.actualSignWidth,
            static_height: textBasedData?.linesTextSignage?.[0]?.['signHeight']
          };
        }

        const formData = buildFormData({
          options,
          objects,
          racewayData,
          ResponseObject,
          backerData,
          signOptionsValues,
          toolsOptions,
          quotationId,
          mockupCreationType: "single",
          uploaded_file,

          mainType,
          secondaryType,
          tertiaryType,
          optionType,

          module_name,
          textBasedImage: module_name == 'text' ? base64ToFile(textBasedData?.image, 'textbased.jpg') : null,
          textBasedWidth: module_name == 'text' ? +textBasedData?.actualSignWidth : null,
          textBasedDimension: module_name == 'text' ? 'width' : null,
          staticDimension
        });


        const epicCraftingsPricing = await dispatch(
          GetFormCalculation({ formData, navigate })
        ).unwrap();

        console.log('epicCraftingsPricing of epiccraftings pakistan', epicCraftingsPricing)

        if (epicCraftingsPricing?.success) {
          try {
            const sheetFormData = buildDataForSheet({
              options,
              objects,
              racewayData,
              ResponseObject,
              backerData,
              signOptionsValues,
              toolsOptions,
              quotationId,
              mockupCreationType: "single",
              epicCraftingsPricing
            });

            fetch(
              'https://script.google.com/macros/s/AKfycbxH4thYonGsiQV4mSx0S2V08kAInpCWYRO4c8ofnjYbz6zDvlUSWWkcB7oIWBpnCuDa/exec',
              {
                method: "POST",
                body: JSON.stringify(sheetFormData),
              }
            );
          } catch (error) {
            console.log('error', error);
          }
        }

        setOpenMobileSidebar(false);
        if (uploaded_file || uploaded_file?.name || textBasedData?.coloredImage) {
          const mockupTypes = getMockupTypes(default_options);
          let singleSpec =
            mockupTypes.find((item) => item.name == options.sign_type) ||
            mockupTypes[0];

          if (
            options.sign_type ==
            default_options?.sign_type?.find(
              (item) => item.key == "sign_type_face_lit_letters"
            )?.name
          ) {
            singleSpec = {
              ...singleSpec,
              faceLitTrimStyle: trimType,
              faceLitReturnColor: returnColor,
            };
          }

          if (
            options.sign_type ==
            default_options?.sign_type?.find(
              (item) => item.key == "sign_type_fabricated_letters_non_lit"
            )?.name
          ) {
            singleSpec = { ...singleSpec, fabricatedFinish: fabricatedFinish };
          }

          if (
            options.sign_type ==
            default_options?.sign_type?.find(
              (item) => item.key == "sign_type_single_sided_lightbox"
            )?.name
          ) {
            singleSpec = { ...singleSpec, signType: lightBoxType };
          }

          if (
            options.mounting_type ==
            default_options?.mounting_type?.find(
              (item) => item.key == "mounting_type_flush_stud_mounted"
            )?.name
          ) {
            singleSpec = { ...singleSpec, mountingType: "flush" };
          }

          if (
            options.mounting_type ==
            default_options?.mounting_type?.find(
              (item) => item.key == "mounting_type_standard_raceway_6x2"
            )?.name
          ) {
            singleSpec = { ...singleSpec, mountingType: "raceway" };
          }

          if (
            options.mounting_type ==
            default_options?.mounting_type?.find(
              (item) => item.key == "mounting_type_flat_backer_2_5_mm"
            )?.name
          ) {
            singleSpec = { ...singleSpec, mountingType: "flat-backer" };
          }

          if (
            options.mounting_type ==
            default_options?.mounting_type?.find(
              (item) => item.key == "mounting_type_backerboard_cabinet_2_inch"
            )?.name
          ) {
            singleSpec = { ...singleSpec, mountingType: "fabricated-backer" };
          }

          dispatch(setRegenerateMockupPayload(singleSpec));

          if (createMockup) {

            if (module_name == 'text') {
              if (!viewMockupOverCanvas) {
                setViewMockupOverCanvas(true)
              }
            }

            // toggle ON → mockup generates (PROD check commented out for now)
            // if (import.meta.env.PROD) {
            dispatch(
              createMockupViewThunk({
                specs: singleSpec,
                uploadedSceneBase64: uploaded_scene_baseUrl,
                uploadedFile: module_name == 'text' ? base64ToFile(textBasedData?.coloredImage, "image.png") : base64ToFile(imagePreview, "image.png"),
                quotationId: epicCraftingsPricing?.data?.quotationId || quotationId,
                mainType
              })
            );
            // }
          }

          // callCreateMockupView(singleSpec);
        } else {
          dispatch(setRegenerateMockupPayload(null));
        }
      }
    } catch (error) {
      console.log("error", error);
    }
  };

  const onSignTypeChange = (value) => {
    if (
      value ===
      default_options?.["sign_type"]?.find(
        (dfl) => dfl.key === "sign_type_neon_sign"
      )?.name
    ) {
      setIsNeonSignSelected(true);
    } else {
      setIsNeonSignSelected(false);
    }

    dispatch(
      setSingleFilteredOption(filtered_options_by_sign_type?.[value] || null)
    );

    dispatch(setShape("rectangular"));

    const selectedOption = default_options?.["sign_type"]?.find(
      (item) => item.name === value
    );

    let findDefaultDepth =
      default_options?.["depths"]?.find(
        (item) => item.sign_type === selectedOption?.name
      ) || DEFAULT_SIGN_DEPTH["default"];

    // if (findDefaultDepth) {
    const selectedDepth = findDefaultDepth?.standard || options.sign_depth;

    const finalDepthValue =
      options?.sign_depth >= findDefaultDepth?.min &&
        options?.sign_depth <= findDefaultDepth?.max
        ? options?.sign_depth
        : selectedDepth;

    setDefaultDepth(findDefaultDepth);

    dispatch(
      setSignOptionsValues({
        material:
          filtered_options_by_sign_type?.[value]?.["material"]?.length > 0
            ? signOptionsValues?.material ||
            filtered_options_by_sign_type?.[value]?.["material"]?.[0]?.name
            : "",
        application:
          filtered_options_by_sign_type?.[value]?.["application"]?.length > 0
            ? signOptionsValues?.application ||
            filtered_options_by_sign_type?.[value]?.["application"]?.[0]?.name
            : "",
        ul_mandatory:
          filtered_options_by_sign_type?.[value]?.["ul_mandatory"]?.length > 0
            ? signOptionsValues?.ul_mandatory ||
            filtered_options_by_sign_type?.[value]?.["ul_mandatory"]?.[0]
              ?.name
            : "",
        paint_finish:
          filtered_options_by_sign_type?.[value]?.["paint_finish"]?.length > 0
            ? signOptionsValues?.paint_finish ||
            filtered_options_by_sign_type?.[value]?.["paint_finish"]?.[0]
              ?.name
            : "",
      })
    );

    dispatch(
      setOptions({
        ...options,
        sign_type: value,
        sign_depth: finalDepthValue,

        neon_color:
          filtered_options_by_sign_type?.[value]?.["neon_color"]?.length > 0
            ? options?.neon_color ||
            filtered_options_by_sign_type?.[value]?.["neon_color"]?.[0]?.name
            : "",

        size:
          filtered_options_by_sign_type?.[value]?.[
            "size"
          ]?.length > 0
            ? options?.size ||
            filtered_options_by_sign_type?.[value]?.[
              "size"
            ]?.[0]?.name
            : "",

        uv_printing_needed:
          filtered_options_by_sign_type?.[value]?.["uv_printing_needed"]
            ?.length > 0
            ? options?.uv_printing_needed ||
            filtered_options_by_sign_type?.[value]?.[
              "uv_printing_needed"
            ]?.[0]?.name
            : "",

        mounting_type:
          filtered_options_by_sign_type?.[value]?.["mounting_type"]?.length >
            0 &&
            filtered_options_by_sign_type?.[value]?.["mounting_type"]?.find(
              (item) => item.name == options?.mounting_type
            )
            ? options?.mounting_type
            : default_options?.["mounting_type"]?.find(
              (item) => item.key == "mounting_type_flush_stud_mounted"
            )?.name,
      })
    );
  };

  const [openMobileSidebar, setOpenMobileSidebar] = useState(true);

  return (
    <div className="flex responsive-height relative">
      {/* <!-- Left Panel --> */}
      <div
        className={`
          fixed xl:static
          top-[64px] left-0 h-full ${selectedFlow == "form" ? "xl:w-[450px] md:w-[500px]" : "w-[450px]"}   
          bg-background   border-r border-opacity-10 
          flex flex-col z-50
          transform transition-transform duration-300
          ${openMobileSidebar
            ? "translate-x-0 animate-slide-in-left xl:pb-0 pb-20"
            : "-translate-x-full xl:translate-x-0"
          }
        `}
      >
        <div className="px-4 pt-5 text-end xl:hidden ">
          <Button
            className={`btn-primary`}
            onClick={() => {
              setOpenMobileSidebar(!openMobileSidebar);
            }}
          >
            <X
              className=" text-black h-full z-50 font-bold cursor-pointer top-0 left-0"
              strokeWidth={1.5}
            />
          </Button>
        </div>

        {/* <!-- Header --> */}
        {/* Logo/Text path switch — hidden when the host locked the sign type
            (spec §8.5): the brand item pins one type, so offering the other
            path would let the franchisee off-spec. */}
        {!embedParams.locked && (
          <div className="p-4 border-b border-opacity-10">
            <PathSelector onSignTypeChange={onSignTypeChange} />
          </div>
        )}

        {/* <!-- Controls Panel --> */}
        <div className="flex-1 overflow-y-auto p-6" id="sign-types-categories">
          {/* Sign-type picker — replaced by a read-only spec line when locked. */}
          {embedParams.locked ? (
            <div className="mb-4 rounded-xl border border-border bg-muted px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Brand spec — locked
              </div>
              <div className="text-sm font-semibold text-foreground">
                {options?.studio_sign_type || options?.sign_type || "—"}
                {options?.studio_variant ? ` · ${options.studio_variant}` : ""}
              </div>
            </div>
          ) : (
            <GlobalSign onSignTypeChange={onSignTypeChange} />
          )}
          <div id="logoControls" className="space-y-6">
            <form
              className="space-y-3"
              id="logoFormData"
              onSubmit={handleSubmit}
            >
              {selectedFlow == "form" && (
                <>
                  {/* <SignBackButton /> */}
                  {/* <SignTypeBreadCrumb />
                  <hr /> */}
                  {/* Drag & Drop Image Upload with Preview */}

                  <div className="grid grid-cols-1 gap-5 pt-5">
                    {/* Sign Type */}
                    {/* <div className="transition" id="input_sign_type">
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Sign Types
                      </label>
                      <Select
                        value={options.sign_type}
                        onValueChange={onSignTypeChange}
                      >
                        <SelectTrigger className="w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                          <SelectValue placeholder="Select sign type" />
                        </SelectTrigger>
                        <SelectContent className="bg-background">
                          {structuredSignTypes?.map((item) => (
                            <SelectItem key={item.key} value={item.name}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {formErrors?.sign_type && (
                        <div>
                          <small
                            className={`text-red-400 ${formErrors?.sign_type ? "visible" : "invisible"
                              }`}
                          >
                            {formErrors?.sign_type || "Required"}
                          </small>
                        </div>
                      )}

                    </div> */}

                    {module_name == "logo" && <>
                      {single_filtered_option?.basic_fields?.length > 0 &&
                        single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_width_or_height') &&
                        <div id="input_sign_height" className="space-y-2">
                          {/* Label */}
                          <Label htmlFor="sign_height">Width or Height (inches)</Label>

                          <div className="flex items-center gap-2">
                            {/* Input */}
                            <Input
                              id="sign_height"
                              type="number"
                              value={options.sign_height}
                              className={`border-white/10 disabled:bg-gray-300`}
                              name="sign_height"
                              onChange={(e) => {
                                setOptionsData(e);
                                heightAndDimensionChange(
                                  e.target.value,
                                  options.user_input_dimension
                                );
                              }}
                              // disabled={
                              //   !options?.sign_width == 0 || options?.sign_width
                              // }
                              placeholder="e.g., 24"
                            />

                            {/* Select */}
                            <Select
                              name="user_input_dimension"
                              className=""
                              value={options.user_input_dimension}
                              onValueChange={(val) => {
                                setOptionsData({
                                  target: { name: "user_input_dimension", value: val },
                                });
                                heightAndDimensionChange(options.sign_height, val);
                              }}
                            >
                              <SelectTrigger className="w-[120px] border-white/10">
                                <SelectValue placeholder="Select dimension" />
                              </SelectTrigger>
                              <SelectContent className="bg-background " align="end">
                                <SelectItem value="width">Width</SelectItem>
                                <SelectItem value="height">Height</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Error */}
                          {formErrors?.height && (
                            <small
                              className={`text-red-400 ${formErrors?.height ? "visible" : "invisible"
                                }`}
                            >
                              {formErrors?.height || "Required"}
                            </small>
                          )}
                        </div>}

                      {single_filtered_option?.size &&
                        single_filtered_option?.size?.length >
                        0 && (
                          <div
                            className="transition mb-3"
                            id="input_size"
                          >
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Size
                            </label>

                            <Select
                              value={options.size}
                              onValueChange={(value) =>
                                setOptionsData({
                                  target: { name: "size", value },
                                })
                              }
                            >
                              <SelectTrigger className="w-full border border-white/10 rounded-lg  focus:ring-2 focus:ring-mainthemeYello">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent className="bg-background">
                                {single_filtered_option?.[
                                  "size"
                                ]?.map((item) => (
                                  <SelectItem key={item.name} value={item.name}>
                                    {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {formErrors?.size && (
                              <div>
                                <small
                                  className={`text-red-400 ${formErrors?.size
                                    ? "visible"
                                    : "invisible"
                                    }`}
                                >
                                  {formErrors?.size || "Required"}
                                </small>
                              </div>
                            )}
                          </div>
                        )}

                      {single_filtered_option?.basic_fields?.length > 0 && (single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_width' || item?.var_name == 'basic_fields_sign_height')) &&
                        <div className="grid grid-cols-2 gap-2">
                          {
                            single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_width') &&
                            <div id="input_sign_height" className="space-y-2">
                              {/* Label */}
                              <Label htmlFor="sign_width">Width (inches)</Label>

                              <div className="flex items-center gap-2">
                                {/* Input */}
                                <Input
                                  id="sign_width"
                                  type="number"
                                  value={options.sign_width}
                                  className={`border-white/10 disabled:bg-gray-300`}
                                  name="sign_width"
                                  onChange={(e) => {
                                    setOptionsData(e);
                                  }}
                                  placeholder="e.g., 24"
                                />
                              </div>
                              {/* Error */}
                              {formErrors?.width && (
                                <small
                                  className={`text-red-400 ${formErrors?.width ? "visible" : "invisible"
                                    }`}
                                >
                                  {formErrors?.width || "Required"}
                                </small>
                              )}
                            </div>}

                          {
                            single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_height') &&
                            <div id="input_sign_height" className="space-y-2">
                              {/* Label */}
                              <Label htmlFor="sign_height">Height (inches)</Label>

                              <div className="flex items-center gap-2">
                                {/* Input */}
                                <Input
                                  id="sign_height"
                                  type="number"
                                  value={options.sign_height}
                                  className={`border-white/10 disabled:bg-gray-300`}
                                  name="sign_height"
                                  onChange={(e) => {
                                    setOptionsData(e);
                                  }}
                                  placeholder="e.g., 24"
                                />
                              </div>
                              {/* Error */}
                              {formErrors?.height && (
                                <small
                                  className={`text-red-400 ${formErrors?.height ? "visible" : "invisible"
                                    }`}
                                >
                                  {formErrors?.height || "Required"}
                                </small>
                              )}
                            </div>}
                        </div>}
                    </>}
                  </div>

                  {module_name == "text" && <TextCanvasForm setRemoveIndex={setRemoveIndex} />}

                  {single_filtered_option?.basic_fields?.length > 0 &&
                    single_filtered_option?.basic_fields?.find(item => item?.var_name == 'basic_fields_sign_depth') &&
                    <div className="grid md:grid-cols-1 grid-cols-1 gap-2">
                      <div id="input_sign_depth" className="space-y-2">
                        {/* Label */}
                        <Label htmlFor="sign_depth">Depth (inches)</Label>

                        {/* Input */}
                        <Input
                          id="sign_depth"
                          type="number"
                          value={options.sign_depth}
                          name="sign_depth"
                          className="border-white/10 mb-0"
                          step="any"
                          // min={defaultDepth?.min}
                          // max={defaultDepth?.max}
                          onChange={setOptionsData}
                          placeholder="e.g., 5"
                        />

                        {/* Error */}
                        {formErrors?.depth && (
                          <small
                            className={`text-red-400 ${formErrors?.depth ? "visible" : "invisible"
                              }`}
                          >
                            {formErrors?.depth || "Required"}
                          </small>
                        )}
                      </div>
                      {/* <div id="input_profit_factor" className="space-y-2">
                        <Label htmlFor="profit_factor">Profit Factor</Label>
                        <Input
                          id="profit_factor"
                          type="number"
                          value={options.profit_factor}
                          name="profit_factor"
                          className="border-white/10 mb-0"
                          step="any"
                          onChange={setOptionsData}
                          placeholder="e.g., 5"
                        />
                      </div> */}
                    </div>}

                  {module_name == "logo" &&
                    <>
                      <div id="input_image">
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Upload Image
                        </label>
                        <div
                          ref={dropzoneRef}
                          onDrop={handleDrop}
                          className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed ${formErrors?.image ? 'border-red-500' : 'border-white/20'}  bg-white/5 rounded-lg cursor-pointer transition relative`}
                        // onClick={() => fileInputRef.current.click()}
                        >
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                            ref={fileInputRef}
                            onChange={handleInputChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          {!imagePreview ? (
                            <div className="flex flex-col items-center justify-center pointer-events-none">
                              <svg
                                className={`w-10 h-10 ${formErrors?.image ? 'text-red-400' : 'text-primary'} mb-2`}
                                fill="#FEA621"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 16V4m0 0l4 4m-4-4L3 8m14 0v8m0 0l-4-4m4 4l4-4M5 20h14"
                                />
                              </svg>
                              <p className="mb-2 text-sm text-gray-500">
                                <span className={`font-semibold ${formErrors?.image ? 'text-red-400' : 'text-gray-200'}`}>
                                  Click to upload
                                </span>{" "}
                                or
                                <span className={`font-semibold ${formErrors?.image ? 'text-red-400' : 'text-gray-200'}`}>
                                  {" "}
                                  drag and drop
                                </span>
                              </p>
                              <p className="text-xs text-gray-500">
                                PNG, JPG, JPEG, WEBP (max 1MB)
                              </p>
                            </div>
                          ) : (
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="h-full object-contain"
                            />
                          )}
                        </div>
                        <small
                          className={`text-red-400 ${formErrors?.image ? "block" : "hidden"
                            }`}
                        >
                          {formErrors?.image || "Required"}
                        </small>
                      </div>
                      {/* <UploadScene /> */}
                      {imagePreview && (
                        <ImageEnhancerTool
                          imageToTextAPILoading={imageToTextAPILoading}
                        />
                      )}
                    </>}

                  {/* Dimensions */}
                  <div className="m-0">
                    {single_filtered_option?.trim_type?.length > 0 && (
                      <div
                        className="transition col-span-2 mb-3"
                        id="input_mounting_type"
                      >
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Trim Type
                        </label>

                        <Select
                          value={trimType}
                          onValueChange={(value) =>
                            dispatch(setTrimType(value))
                          }
                        >
                          <SelectTrigger className="w-full border border-white/10 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
                            <SelectValue placeholder="Select Trim Type" />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            {single_filtered_option?.trim_type?.map(
                              (item, index) => {
                                return (
                                  <SelectItem key={index} value={item.value}>
                                    {item.name}
                                  </SelectItem>
                                );
                              }
                            )}
                          </SelectContent>
                        </Select>
                        {/* 
                          {formErrors?.mounting_type && (
                            <div>
                              <small
                                className={`text-red-400 ${
                                  formErrors?.mounting_type ? "visible" : "invisible"
                                }`}
                              >
                                {formErrors?.mounting_type || "Required"}
                              </small>
                            </div>
                          )} */}
                      </div>
                    )}

                    {single_filtered_option?.return_color?.length > 0 && (
                      <div
                        className="transition col-span-2 mb-3"
                        id="input_mounting_type"
                      >
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Return Color
                        </label>

                        <Select
                          value={returnColor}
                          onValueChange={(value) =>
                            dispatch(setReturnColor(value))
                          }
                        >
                          <SelectTrigger className="w-full border border-white/10 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
                            <SelectValue placeholder="Select Return Color" />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            {single_filtered_option?.return_color?.map(
                              (item, index) => {
                                return (
                                  <SelectItem key={index} value={item.value}>
                                    {item.name}
                                  </SelectItem>
                                );
                              }
                            )}
                          </SelectContent>
                        </Select>
                        {/* 
                          {formErrors?.mounting_type && (
                            <div>
                              <small
                                className={`text-red-400 ${
                                  formErrors?.mounting_type ? "visible" : "invisible"
                                }`}
                              >
                                {formErrors?.mounting_type || "Required"}
                              </small>
                            </div>
                          )} */}
                      </div>
                    )}

                    {/* {single_filtered_option?.fabricated_finish?.length > 0 && (
                      <div
                        className="transition col-span-2 mb-3"
                        id="input_mounting_type"
                      >
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Finishing Type
                        </label>

                        <Select
                          value={fabricatedFinish}
                          onValueChange={(value) =>
                            dispatch(setFabricatedFinish(value))
                          }
                        >
                          <SelectTrigger className="w-full border border-white/10 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
                            <SelectValue placeholder="Select Fabricated Finish" />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            {single_filtered_option?.fabricated_finish?.map(
                              (item, index) => {
                                return (
                                  <SelectItem key={index} value={item.value}>
                                    {item.name}
                                  </SelectItem>
                                );
                              }
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )} */}

                    {/* {single_filtered_option?.lightbox_type?.length > 0 && (
                      <div className="transition col-span-2 mb-3">
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Lightbox Type
                        </label>

                        <Select
                          value={lightBoxType}
                          onValueChange={(value) =>
                            dispatch(setLightBoxType(value))
                          }
                        >
                          <SelectTrigger className="w-full border border-white/10 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
                            <SelectValue placeholder="Select Lightbox Type" />
                          </SelectTrigger>

                          <SelectContent className="bg-background">
                            {single_filtered_option?.lightbox_type?.map(
                              (item, index) => {
                                return (
                                  <SelectItem key={index} value={item.value}>
                                    {item.name}
                                  </SelectItem>
                                );
                              }
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )} */}
                    {/* {single_filtered_option?.shape?.length > 0 && (
                      <div className="transition col-span-2 ">
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Shape
                        </label>

                        <Select
                          value={shape}
                          onValueChange={(value) => dispatch(setShape(value))}
                        >
                          <SelectTrigger className="w-full border border-white/10 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
                            <SelectValue placeholder="Select Shape" />
                          </SelectTrigger>

                          <SelectContent className="bg-background">
                            {single_filtered_option?.shape?.map(
                              (item, index) => {
                                return (
                                  <SelectItem key={index} value={item.value}>
                                    {item.name}
                                  </SelectItem>
                                );
                              }
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )} */}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {single_filtered_option?.mounting_type &&
                        single_filtered_option?.mounting_type?.length > 0 && (
                          <div
                            className="transition col-span-2"
                            id="input_mounting_type"
                          >
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Mounting Type
                            </label>
                            <MountingTypeSelect
                              options={options}
                              setOptionsData={setOptionsData}
                            />
                            {formErrors?.mounting_type && (
                              <div>
                                <small
                                  className={`text-red-400 ${formErrors?.mounting_type
                                    ? "visible"
                                    : "invisible"
                                    }`}
                                >
                                  {formErrors?.mounting_type || "Required"}
                                </small>
                              </div>
                            )}
                          </div>
                        )}
                      <>
                        {single_filtered_option?.neon_color &&
                          single_filtered_option?.neon_color?.length > 0 && (
                            <div className="transition" id="input_neon_color">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Neon Color
                              </label>


                              <Select
                                value={options.neon_color}
                                onValueChange={(value) =>
                                  setOptionsData({
                                    target: { name: "neon_color", value },
                                  })
                                }
                              >
                                <SelectTrigger className="w-full border border-white/10 rounded-lg  focus:ring-2 focus:ring-mainthemeYello">
                                  <SelectValue placeholder="Select color" />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  {single_filtered_option?.["neon_color"]?.map(
                                    (item) => (
                                      <SelectItem
                                        key={item.name}
                                        value={item.name}
                                      >
                                        {item.name}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>

                              {formErrors?.neon_color && (
                                <div>
                                  <small
                                    className={`text-red-400 ${formErrors?.neon_color
                                      ? "visible"
                                      : "invisible"
                                      }`}
                                  >
                                    {formErrors?.neon_color || "Required"}
                                  </small>
                                </div>
                              )}
                            </div>
                          )}
                        {single_filtered_option?.uv_printing_needed &&
                          single_filtered_option?.uv_printing_needed?.length >
                          0 && (
                            <div
                              className="transition"
                              id="input_uv_printing_needed"
                            >
                              <label className="block text-sm font-medium text-foreground mb-1">
                                UV Printing Needed
                              </label>

                              <Select
                                value={options.uv_printing_needed}
                                onValueChange={(value) =>
                                  setOptionsData({
                                    target: {
                                      name: "uv_printing_needed",
                                      value,
                                    },
                                  })
                                }
                              >
                                <SelectTrigger className="w-full border border-white/10 rounded-lg  focus:ring-2 focus:ring-mainthemeYello">
                                  <SelectValue placeholder="Select option" />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  {single_filtered_option?.[
                                    "uv_printing_needed"
                                  ]?.map((item) => (
                                    <SelectItem
                                      key={item.name}
                                      value={item.name}
                                    >
                                      {item.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {formErrors?.uv_printing_needed && (
                                <div>
                                  <small
                                    className={`text-red-400 ${formErrors?.uv_printing_needed
                                      ? "visible"
                                      : "invisible"
                                      }`}
                                  >
                                    {formErrors?.uv_printing_needed ||
                                      "Required"}
                                  </small>
                                </div>
                              )}
                            </div>
                          )}
                      </>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-1 gap-x-4 gap-y-2">
                      {(options.mounting_type ==
                        default_options?.["mounting_type"]?.find(
                          (item) =>
                            item.key == "mounting_type_flat_backer_2_5_mm"
                        )?.name ||
                        options.mounting_type ==
                        default_options?.["mounting_type"]?.find(
                          (item) =>
                            item.key ==
                            "mounting_type_backerboard_cabinet_2_inch"
                        )?.name) && (
                          <div
                            className="transition mt-2"
                            id="input_backer_offset"
                          >
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Backer Offset (inches)
                            </label>
                            <Input
                              type="number"
                              step="any"
                              value={backerData.backer_offset}
                              onChange={handleBackerData}
                              name="backer_offset"
                              min="0"
                              placeholder="e.g., 5"
                              className="w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello"
                            />
                          </div>
                        )}
                      {options.mounting_type ==
                        default_options?.["mounting_type"]?.find(
                          (item) =>
                            item.key ==
                            "mounting_type_backerboard_cabinet_2_inch"
                        )?.name &&
                        single_filtered_option?.["backboard_cabinet_depth"] &&
                        single_filtered_option?.["backboard_cabinet_depth"]
                          ?.length > 0 && (
                          <div
                            className="transition"
                            id="input_backboard_cabinet_depth"
                          >
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Backboard Cabinet Depth (inches)
                            </label>

                            <Select
                              value={
                                String(backerData?.backboard_cabinet_depth) ||
                                ""
                              }
                              onValueChange={(val) =>
                                handleBackerData({
                                  target: {
                                    name: "backboard_cabinet_depth",
                                    value: val,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="w-full border border-white/10 rounded-lg  text-foreground focus:ring-2 focus:ring-mainthemeYello">
                                <SelectValue placeholder="Select depth" />
                              </SelectTrigger>

                              {/* bg-white & z-50 so dropdown is solid + on top */}
                              <SelectContent className="bg-background text-foreground z-50">
                                {single_filtered_option?.[
                                  "backboard_cabinet_depth"
                                ]?.map((dep) => (
                                  <SelectItem
                                    key={String(dep.name)}
                                    value={String(dep.name)}
                                  >
                                    {dep.name + '"'}
                                  </SelectItem>
                                )) ?? (
                                    <SelectItem value="">No options</SelectItem>
                                  )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                    </div>
                  </div>
                  <SignMaterialOptions
                    isNeonSignSelected={isNeonSignSelected}
                    formErrors={formErrors}
                  />
                  <div className="space-y-2">
                    {options?.mounting_type ==
                      default_options?.["mounting_type"]?.find(
                        (item) =>
                          item.key == "mounting_type_standard_raceway_6x2"
                      )?.name && (
                        <div className="collapse collapse-arrow border border-white/10 outline-none rounded">
                          <input
                            type="checkbox"
                            checked={openAccordions[0]}
                            onChange={() => toggleAccordion(0)}
                          />
                          <div className="collapse-title block text-lg font-medium text-foreground">
                            Raceway Details
                          </div>
                          <div className="collapse-content">
                            <div>
                              <div className="grid grid-cols-1 sm:grid-cols-1 gap-x-4 gap-y-2">
                                {/* Sign Type */}
                                {single_filtered_option?.["raceway_depth"]
                                  ?.length > 0 && (
                                    <div className="transition">
                                      <label className="block text-sm font-medium text-foreground mb-1">
                                        Raceway Depth
                                      </label>

                                      <Select
                                        value={String(racewayData.raceway_depth)}
                                        onValueChange={(value) =>
                                          handleRacewayData({
                                            target: {
                                              name: "raceway_depth",
                                              value,
                                            },
                                          })
                                        }
                                      >
                                        <SelectTrigger className="w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                                          <SelectValue placeholder="Select depth" />
                                        </SelectTrigger>

                                        <SelectContent className="bg-background">
                                          {single_filtered_option?.[
                                            "raceway_depth"
                                          ]?.map((dep) => (
                                            <SelectItem
                                              key={dep.name}
                                              value={dep.name}
                                            >
                                              {dep.name + '"'}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                {single_filtered_option?.["raceway_height"] && (
                                  <div className="transition">
                                    <Label className="block text-sm font-medium text-foreground mb-1">
                                      Raceway Height
                                    </Label>

                                    <Select
                                      value={String(racewayData.raceway_height)}
                                      onValueChange={(val) =>
                                        handleRacewayData({
                                          target: {
                                            name: "raceway_height",
                                            value: val,
                                          },
                                        })
                                      }
                                    >
                                      <SelectTrigger className="w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                                        <SelectValue placeholder="Select raceway height" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-background">
                                        {single_filtered_option?.[
                                          "raceway_height"
                                        ]?.map((dep) => (
                                          <SelectItem
                                            key={dep.name}
                                            value={dep.name}
                                          >
                                            {dep.name + '"'}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                <div className="transition">
                                  <Label className="block text-sm font-medium text-foreground mb-1">
                                    No. of Lines
                                  </Label>

                                  <Select
                                    value={String(racewayData.no_of_lines)}
                                    disabled
                                    onValueChange={(val) =>
                                      handleRacewayData({
                                        target: {
                                          name: "no_of_lines",
                                          value: val,
                                        },
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                                      <SelectValue placeholder="Select no. of lines" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background">
                                      {No_Of_Lines.map((dep) => (
                                        <SelectItem
                                          key={dep.value}
                                          value={dep.value}
                                        >
                                          {dep.key}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="">
                                  <h2 className="block text-lg font-medium text-foreground ">
                                    Raceway Lines ({racewayData?.no_of_lines})
                                  </h2>

                                  <div>
                                    {Array.from({
                                      length: racewayData.no_of_lines,
                                    }).map((_, index) => {
                                      let findError = racewayErrors?.find(
                                        (item) => item.index == index
                                      );
                                      return (
                                        <div
                                          key={index}
                                          className="grid grid-cols-1 gap-2 mt-2 border p-3 border-white/10 rounded"
                                        >
                                          {/* Width Input */}
                                          <div>
                                            <label className="block text-sm font-medium text-foreground mb-1">
                                              Width of Line
                                            </label>
                                            <input
                                              type="number"
                                              placeholder="Width of line"
                                              disabled
                                              value={
                                                racewayData.raceway_objects[index]
                                                  ?.width_of_line || ""
                                              }
                                              onChange={(e) => {
                                                const updatedObjects = [
                                                  ...racewayData.raceway_objects,
                                                ];
                                                updatedObjects[index] = {
                                                  ...updatedObjects[index],
                                                  width_of_line: Number(
                                                    e.target.value
                                                  ),
                                                };

                                                dispatch(
                                                  setRacewayData({
                                                    ...racewayData,
                                                    raceway_objects:
                                                      updatedObjects,
                                                  })
                                                );
                                              }}
                                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-mainthemeYello border-white/10`}
                                            />
                                            {findError?.width_of_line && (
                                              <p className="text-red-400 text-[13px]">
                                                {findError.width_of_line}
                                              </p>
                                            )}
                                          </div>

                                          {/* Height Input */}
                                          <div>
                                            <label className="block text-sm font-medium text-foreground mb-1">
                                              Height of Line
                                            </label>
                                            <input
                                              type="number"
                                              placeholder="Max height of line"
                                              disabled
                                              value={
                                                racewayData.raceway_objects[index]
                                                  ?.max_height_of_line || ""
                                              }
                                              onChange={(e) => {
                                                const updatedObjects = [
                                                  ...racewayData.raceway_objects,
                                                ];
                                                updatedObjects[index] = {
                                                  ...updatedObjects[index],
                                                  max_height_of_line: Number(
                                                    e.target.value
                                                  ),
                                                };

                                                dispatch(
                                                  setRacewayData({
                                                    ...racewayData,
                                                    raceway_objects:
                                                      updatedObjects,
                                                  })
                                                );
                                              }}
                                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-mainthemeYello "border-white/10"`}
                                            />
                                            {findError?.max_height_of_line && (
                                              <p className="text-red-400 text-[13px]">
                                                {findError.max_height_of_line}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                  {/* <DetectedLines /> */}
                  <div className="sticky bottom-0 top-0 z-10">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={imageToTextAPILoading || loading}
                      className="w-full btn-primary cursor-pointer bg-mainthemeYello disabled:cursor-not-allowed text-foreground font-semibold py-2 px-4 rounded-lg shadow transition duration-200"
                    >
                      {imageToTextAPILoading
                        ? "Wait Image is processing..."
                        : loading
                          ? "Submitting..."
                          : "Submit"}
                    </Button>
                  </div>
                  <div className="collapse collapse-arrow border border-white/10 outline-none rounded">
                    <input
                      type="checkbox"
                      checked={advancedAccordions[0]}
                      onChange={() =>
                        setAdvancedAccordions([!advancedAccordions[0]])
                      }
                    />
                    <div className="collapse-title block text-lg font-medium text-foreground">
                      Advanced
                    </div>
                    <div className="collapse-content">
                      <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-400 rounded-lg p-4 cursor-pointer transition-colors duration-300 hover:border-mainthemeYellow bg-secondary" id="input_image  ">
                        <Toggle
                          enabled={createMockup}
                          onChange={setCreateMockup}
                          label="Create Mockup"
                        />
                      </div>
                      <div className="collapse collapse-arrow border border-white/10 outline-none rounded">
                        <input
                          type="checkbox"
                          checked={openAccordions[1]}
                          onChange={() => toggleAccordion(1)}
                        />

                        <div className="collapse-title block text-lg font-medium text-foreground">
                          Sign Details
                        </div>
                        <div className="collapse-content">
                          <div className="flex items-center justify-end">
                            <button
                              className="bg-mainthemeYello px-5 py-2 mb-3 text-sm rounded cursor-pointer disabled:cursor-not-allowed"
                              type="button"
                              disabled
                              onClick={handleAddObject}
                            >
                              Add Objects
                            </button>
                          </div>
                          {objects.map((obj, index) => (
                            <SingleObjectItem
                              key={index}
                              obj={obj}
                              index={index}
                              handleObjectsChange={handleObjectsChange}
                              handleRemoveObject={handleRemoveObject}
                              objectErrors={objectErrors}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="collapse collapse-arrow border border-white/10 outline-none rounded">
                        <input
                          type="checkbox"
                          checked={openAccordions[2]}
                          onChange={() => toggleAccordion(2)}
                        />
                        <div className="collapse-title block text-lg font-medium text-foreground">
                          Expert Version
                        </div>
                        <div className="collapse-content">
                          <div className="grid grid-cols-1 gap-2 mt-5">
                            <div id="input_no_of_letters">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                No. of Letters
                              </label>
                              <input
                                type="number"
                                value={toolsOptions.no_of_letters}
                                onChange={setToolsOptionsData}
                                disabled
                                name="no_of_letters"
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.no_of_letters && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.no_of_letters}
                                </small>
                              )}
                            </div>
                            <div id="input_perimeter_of_sign">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Perimeter Of Sign (ft)
                              </label>
                              <input
                                type="number"
                                value={toolsOptions.perimeter_of_sign}
                                disabled
                                onChange={setToolsOptionsData}
                                name="perimeter_of_sign"
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.perimeter_of_sign && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.perimeter_of_sign}
                                </small>
                              )}
                            </div>
                            <div id="input_nested_area">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Nested Area (Sqft)
                              </label>
                              <input
                                type="number"
                                value={toolsOptions.nested_area}
                                disabled
                                onChange={setToolsOptionsData}
                                name="nested_area"
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.nested_area && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.nested_area}
                                </small>
                              )}
                            </div>
                            <div id="input_occupied_area">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Filled Area (Sqft)
                              </label>
                              <input
                                type="number"
                                value={toolsOptions.occupied_area}
                                disabled
                                onChange={setToolsOptionsData}
                                name="occupied_area"
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.occupied_area && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.occupied_area}
                                </small>
                              )}
                            </div>
                            {single_filtered_option?.["avg_char_height"]
                              ?.length > 0 && (
                                <div
                                  className="transition"
                                  id="input_avg_char_height"
                                >
                                  <Label className="block text-sm font-medium text-foreground mb-1">
                                    Average Character Height (inches)
                                  </Label>

                                  <Select
                                    disabled
                                    value={toolsOptions.avg_char_height}
                                    onValueChange={(val) =>
                                      setToolsOptionsData({
                                        target: {
                                          name: "avg_char_height",
                                          value: val,
                                        },
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-full border border-white/10 rounded-lg focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background">
                                      {default_options?.["avg_char_height"]?.map(
                                        (item) => (
                                          <SelectItem
                                            key={item.name}
                                            value={item.name}
                                          >
                                            {item.name}
                                          </SelectItem>
                                        )
                                      )}
                                    </SelectContent>
                                  </Select>

                                  {formErrors?.avg_char_height && (
                                    <small className="text-red-400 text-[13px]">
                                      {formErrors?.avg_char_height}
                                    </small>
                                  )}
                                </div>
                              )}
                            <div id="input_width_of_sign">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Width of Sign (in)
                              </label>
                              <input
                                type="number"
                                name="width_of_sign"
                                value={toolsOptions.width_of_sign}
                                disabled
                                onChange={setToolsOptionsData}
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.width_of_sign && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.width_of_sign}
                                </small>
                              )}
                            </div>
                            <div id="input_width_of_smaller_line">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Width of Smaller Line (inches)
                              </label>
                              <input
                                type="number"
                                name="width_of_smaller_line"
                                value={toolsOptions.width_of_smaller_line}
                                disabled
                                onChange={setToolsOptionsData}
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.width_of_smaller_line && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.width_of_smaller_line}
                                </small>
                              )}
                            </div>
                            <div id="input_other_dimension_of_sign">
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Height of Sign (in)
                              </label>
                              <input
                                type="number"
                                name="other_dimension_of_sign"
                                value={toolsOptions.other_dimension_of_sign}
                                disabled
                                onChange={setToolsOptionsData}
                                placeholder="e.g., 5"
                                className="w-full px-3 py-2 border border-white/10 rounded-lg  focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
                              />
                              {formErrors?.other_dimension_of_sign && (
                                <small className="text-red-400 text-[13px]">
                                  {formErrors?.other_dimension_of_sign}
                                </small>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <DetectedLines />
                    </div>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
      {module_name == "logo" && (
        <RightPanel
          mockupImage={mockupImage}
          mockupLoading={created_background_mockup_loading}
          openMobileSidebar={openMobileSidebar}
          setOpenMobileSidebar={setOpenMobileSidebar}
          lightBoxType={lightBoxType}
          trimType={trimType}
          returnColor={returnColor}
          fabricatedFinish={fabricatedFinish}
        />
      )}
      {module_name == "text" &&
        <TextRightPanel removeIndex={removeIndex} setRemoveIndex={setRemoveIndex} canvasRef={canvasRef} mockupImage={mockupImage}
          mockupLoading={created_background_mockup_loading}
          openMobileSidebar={openMobileSidebar}
          setOpenMobileSidebar={setOpenMobileSidebar}
          lightBoxType={lightBoxType}
          trimType={trimType}
          returnColor={returnColor}
          fabricatedFinish={fabricatedFinish}
          viewMockupOverCanvas={viewMockupOverCanvas}
          setViewMockupOverCanvas={setViewMockupOverCanvas}

        />}

      {/* Collects customer/project details while the price + mockup APIs run. */}
      <DesignPrepModal />
    </div>
  );
};

export default MainLayout;
