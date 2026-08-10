import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedFlow,
  setTypeBasedOnKey,
} from "../../store/Slices/GlobalSignTypeSlice";
import {
  setMockupSignTypeAndFabfinish,
  setOptions,
  setSignOptionsValues,
} from "../../store/Slices/SignFormSlice";
import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronLeft } from "lucide-react";

const ImageCard = ({ opt, onClick, selected = false }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`cursor-pointer overflow-hidden rounded-lg border transition-colors
        ${selected ? "border-mainthemeYello" : "border-gray-600 hover:border-gray-400"}`}
      onClick={onClick}
    >
      <div className="relative w-full aspect-[3/2] bg-gray-800">
        {!loaded && (
          <img
            src="/empty-image.jpg"
            alt="placeholder"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <img
          src={opt?.image || "/empty-image.jpg"}
          alt={opt.name}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            e.target.src = "/empty-image.jpg";
            setLoaded(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"
            }`}
        />
        {/* selected overlay */}
        {/* {selected && (
          <div className="absolute inset-0 bg-mainthemeYello/20 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-mainthemeYello flex items-center justify-center">
              <svg viewBox="0 0 12 12" className="w-3 h-3 fill-black">
                <path d="M2 6l3 3 5-5" stroke="black" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )} */}
      </div>
      <div
        className={`text-xs py-2 px-1 text-center font-medium truncate
          ${selected ? "text-mainthemeYello" : "text-foreground"}`}
      >
        {opt.name}
      </div>
    </div>
  );
};

const GlobalSign = ({ onSignTypeChange }) => {
  const dispatch = useDispatch();
  const {
    globalSigns,
    mainType,
    secondaryTypes,
    secondaryType,
    tertiaryTypes,
    tertiaryType,
    optionsTypes,
    optionType,
    module_name,
    selectedFlow,
  } = useSelector((state) => state.GlobalSigns);

  useEffect(() => {
  // Reset local state
  setInnerStep("secondary");
  setDropdownOpen(false);

  // Reset Redux flow
  dispatch(setTypeBasedOnKey({ key: "main", value: null }));
  dispatch(setSelectedFlow("main"));
}, [module_name]);

  const { options, signOptionsValues } = useSelector((state) => state.SignForm);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [innerStep, setInnerStep] = useState("secondary");
  const dropdownRef = useRef(null);

  console.log('typessssss', mainType, secondaryType, tertiaryType, optionType)

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (selectedFlow === "secondary") setInnerStep("secondary");
    else if (selectedFlow === "tertiary") setInnerStep("tertiary");
    else if (selectedFlow === "option") setInnerStep("option");
  }, [selectedFlow]);

  // `options.sign_type` carries the backend's CANONICAL pricing category
  // (found.sign_type.name) — that's what the pricing engine needs. Separately we
  // record the friendly studio selection (the Type the user picked + the finish
  // Option) so estimates/orders/dashboards show what was actually chosen instead
  // of the internal pricing name. `display.type` / `display.variant` override the
  // defaults when the caller has the breadcrumb context.
  const mapSignType = (types, value, display = {}) => {
    const found = types?.find((item) => item?.name === value);
    if (found) {
      dispatch(
        setOptions({
          ...options,
          sign_type: found?.sign_type?.name,
          studio_sign_type: display.type ?? value,
          studio_variant: display.variant ?? null,
        })
      );
      onSignTypeChange(found?.sign_type?.name);
    }
  };

  const setGlobalApplication = (val) => {
    if (val?.toLowerCase()?.includes("indoor")) {
      dispatch(setSignOptionsValues({ ...signOptionsValues, application: "Interior" }));
    } else if (val?.toLowerCase()?.includes("outdoor")) {
      dispatch(setSignOptionsValues({ ...signOptionsValues, application: "Exterior" }));
    }
  };

  const handleMainSelect = (sign) => {
    dispatch(setMockupSignTypeAndFabfinish({
      mockupSignType: sign?.mockup_sign_type,
      fabricatedFinish: sign?.mockup_fabricated_finish,
    }));
    setGlobalApplication(sign.name);

    dispatch(setTypeBasedOnKey({ key: "main", value: sign.name }));
    dispatch(setSelectedFlow("tertiary"));
    setInnerStep("tertiary");

    setDropdownOpen(false);
  };

  const handleSecondarySelect = (item) => {
    dispatch(
      setMockupSignTypeAndFabfinish({
        mockupSignType: item?.mockup_sign_type,
        fabricatedFinish: item?.mockup_fabricated_finish,
      })
    );
    dispatch(setTypeBasedOnKey({ key: "secondary", value: item.name }));
    setGlobalApplication(mainType);
    setInnerStep("tertiary");
    dispatch(setSelectedFlow("tertiary"));
  };

  const handleTertiarySelect = (item) => {
    // Find and set the parent secondary automatically
    const parentSecondary = secondaryTypes?.find((sec) =>
      (sec?.types || []).some((t) => t.name === item.name)
    );
    if (parentSecondary) {
      dispatch(setTypeBasedOnKey({ key: "secondary", value: parentSecondary.name }));
    }

    dispatch(setMockupSignTypeAndFabfinish({
      mockupSignType: item?.mockup_sign_type,
      fabricatedFinish: item?.mockup_fabricated_finish,
    }));
    dispatch(setTypeBasedOnKey({ key: "tertiary", value: item.name }));
    setGlobalApplication(mainType);

    const hasOptions = tertiaryTypes.find((t) => t.name === item.name)?.types?.length > 0;

    if (hasOptions) {
      setInnerStep("option");
      dispatch(setSelectedFlow("option"));
    } else {
      // No finish options under this type → the Type itself is the selection.
      mapSignType(tertiaryTypes, item.name, { type: item.name, variant: null });
      dispatch(setSelectedFlow("form"));
      setDropdownOpen(false);
    }
  };

  const handleOptionSelect = (item) => {
    dispatch(
      setMockupSignTypeAndFabfinish({
        mockupSignType: item?.mockup_sign_type,
        fabricatedFinish: item?.mockup_fabricated_finish,
      })
    );
    dispatch(setTypeBasedOnKey({ key: "option", value: item.name }));
    // The picked Option is the finish/variant; its parent (tertiaryType) is the
    // sign type the customer sees, e.g. "Dimensional Fabricated Letters".
    mapSignType(optionsTypes, item.name, {
      type: tertiaryType,
      variant: item.name,
    });
    setGlobalApplication(mainType);
    dispatch(setSelectedFlow("form"));
    setDropdownOpen(false);
  };

  // Current step label + items for the dropdown header
  // stepConfig — just use tertiaryTypes directly
  const stepConfig = {
    secondary: { label: "Category", items: secondaryTypes, selectedVal: secondaryType },
    tertiary: { label: "Type", items: tertiaryTypes, selectedVal: tertiaryType },
    option: { label: "Option", items: optionsTypes, selectedVal: optionType },
  };


  const triggerLabel = (() => {
    const parts = [secondaryType, tertiaryType, optionType].filter(Boolean);
    return parts.length > 0 ? parts.join(" › ") : "Select type...";
  })();

  const triggerSignTypeLabel =
    optionType || tertiaryType || "Select type...";

  const showDropdown = selectedFlow !== "main";

  // Breadcrumb steps that have been selected (excluding current step)
  const breadcrumbSteps = [
    tertiaryType && innerStep === "option" && { label: tertiaryType, goTo: "tertiary" },
  ].filter(Boolean);

  const handleBreadcrumbBack = (goTo) => {
    if (goTo === "tertiary") {
      dispatch(setTypeBasedOnKey({ key: "tertiary", value: null }));
      dispatch(setTypeBasedOnKey({ key: "option", value: null }));
      dispatch(setSelectedFlow("tertiary"));
      setInnerStep("tertiary");
    }
  };

  const { items: currentItems } = stepConfig[innerStep] || {};

  return (
    <div className="mt-4">
      {/* ── Main Types — 2-col image grid ── */}
      <Label className="mb-2" htmlFor='main-type'>Sign Placement</Label>
      {/* <div className="mb-5">
        <RadioGroup
          value={mainType}
          id="main-type"
          onValueChange={(value) => {
            const selected = globalSigns.find((s) => s.name === value);
            handleMainSelect(selected);
          }}
          className="grid grid-cols-2"
        >
          {globalSigns.map((sign) => (
            <div
              key={sign.id}
              className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted transition"
            >
              <RadioGroupItem value={sign.name} id={sign.id} />
              <Label htmlFor={sign.id} className="cursor-pointer w-full">
                {sign.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div> */}


      <div className="grid grid-cols-2 gap-3 mb-5">
        {globalSigns?.map((sign) => (
          <ImageCard
            key={sign.name}
            opt={sign}
            selected={mainType === sign.name}
            onClick={() => handleMainSelect(sign)}
          />
        ))}
      </div>



      {/* ── Cascading Dropdown ── */}

      <div className="relative" ref={dropdownRef} >
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2"></p>
        <Label className="mb-2" htmlFor='sign-details'>Sign Type</Label>

        {/* Trigger button */}
        <button
          type="button"
          disabled={!showDropdown}
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors bg-transparent
              ${dropdownOpen ? "border-mainthemeYello" : "border-gray-600 hover:border-gray-400"}
              ${triggerLabel === "Select type..." ? "text-gray-400" : "text-foreground"} disabled:cursor-not-allowed
              `}
        >
          <span className="truncate">{triggerSignTypeLabel}</span>
          <ChevronDown
            size={16}
            className={`ml-2 shrink-0 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown panel */}
        {dropdownOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-600 bg-background shadow-xl overflow-hidden">

            {/* Header: back button + breadcrumb */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
              {breadcrumbSteps.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBreadcrumbBack(breadcrumbSteps[breadcrumbSteps.length - 1].goTo)}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <div className="flex items-center gap-1 text-xs flex-wrap">
                {breadcrumbSteps.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span
                      className="text-gray-400 hover:text-foreground cursor-pointer"
                      onClick={() => handleBreadcrumbBack(crumb.goTo)}
                    >
                      {crumb.label}
                    </span>
                    <span className="text-gray-600">›</span>
                  </span>
                ))}
                {/* <span className="text-foreground font-medium">{currentStepLabel}</span> */}
              </div>
            </div>

            {/* 2-col image grid inside dropdown */}
            <div className="p-3 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {currentItems?.map((item) => (
                  <ImageCard
                    key={item.name}
                    opt={item}
                    selected={stepConfig[innerStep]?.selectedVal === item.name}
                    onClick={() => {
                      if (innerStep === "secondary") handleSecondarySelect(item);
                      else if (innerStep === "tertiary") handleTertiarySelect(item);
                      else handleOptionSelect(item);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default GlobalSign;