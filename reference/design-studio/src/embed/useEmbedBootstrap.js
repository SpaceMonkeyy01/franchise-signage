// Reconstruct the studio's sign-type selection from embed params, so an
// embedded studio opens already locked to the brand item's pinned spec (spec
// §8.3 / §8.5) without the user touching the picker.
//
// This mirrors exactly what GlobalSign.jsx dispatches when a user clicks
// through Placement → Category → Type → Option, so downstream pricing and
// mockup calls see identical state.

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  setOptions,
  setSignOptionsValues,
  setMockupSignTypeAndFabfinish,
} from "../store/Slices/SignFormSlice";
import {
  setTypeBasedOnKey,
  setSelectedFlow,
} from "../store/Slices/GlobalSignTypeSlice";
import { findSignTypePath, postToHost } from "./embedParams";

export const useEmbedBootstrap = (params) => {
  const dispatch = useDispatch();
  const { globalSigns } = useSelector((s) => s.GlobalSigns);
  const { options, signOptionsValues } = useSelector((s) => s.SignForm);
  const done = useRef(false);

  useEffect(() => {
    if (!params?.embed || done.current) return;
    // The taxonomy arrives asynchronously (GetGlobalSignTypes); wait for it.
    if (!globalSigns?.length) return;

    if (params.locked) {
      const path = findSignTypePath(globalSigns, params);
      if (!path) {
        // Don't fail silently — the host asked for a type we can't honour.
        console.warn("[embed] sign type not found:", params.signTypeId ?? params.signType);
        postToHost("studio:error", {
          reason: "sign_type_not_found",
          signTypeId: params.signTypeId,
          signType: params.signType,
        }, params);
        done.current = true;
        return;
      }

      const [placement, category, type, variant] = path;
      const leaf = path[path.length - 1];

      // Mockup renderer + finish come off the leaf, same as handleOptionSelect.
      dispatch(
        setMockupSignTypeAndFabfinish({
          mockupSignType: leaf?.mockup_sign_type,
          fabricatedFinish: leaf?.mockup_fabricated_finish,
        })
      );

      // Indoor/Outdoor drives the `application` attribute and the scene image.
      const placementName = placement?.name ?? "";
      if (placementName.toLowerCase().includes("indoor")) {
        dispatch(setSignOptionsValues({ ...signOptionsValues, application: "Interior" }));
      } else if (placementName.toLowerCase().includes("outdoor")) {
        dispatch(setSignOptionsValues({ ...signOptionsValues, application: "Exterior" }));
      }

      dispatch(setTypeBasedOnKey({ key: "main", value: placement?.name }));
      if (category?.name) dispatch(setTypeBasedOnKey({ key: "secondary", value: category.name }));
      if (type?.name && path.length >= 3) dispatch(setTypeBasedOnKey({ key: "tertiary", value: type.name }));
      if (variant?.name && path.length >= 4) dispatch(setTypeBasedOnKey({ key: "option", value: variant.name }));

      // `sign_type` must be the CANONICAL pricing name — the pricing engine
      // keys off it. studio_* are the friendly labels shown in the UI.
      dispatch(
        setOptions({
          ...options,
          sign_type: leaf?.sign_type?.name,
          studio_sign_type: (path.length >= 4 ? type?.name : leaf?.name) ?? leaf?.name,
          studio_variant: path.length >= 4 ? variant?.name : null,
        })
      );

      // Skip straight to the form; the picker is hidden in locked mode.
      dispatch(setSelectedFlow("form"));
    }

    done.current = true;
    postToHost("studio:ready", {
      locked: params.locked,
      signType: params.signType ?? null,
      signTypeId: params.signTypeId ?? null,
    }, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, globalSigns]);
};
