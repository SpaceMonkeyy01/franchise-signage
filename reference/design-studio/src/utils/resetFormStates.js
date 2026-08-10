import { resetB2SignLogo } from "../store/Slices/B2SignLogoSlice";
import { restoreDefaultSignForm, setOptionField } from "../store/Slices/SignFormSlice";
import { resetTextCanvas } from "../store/Slices/TextCanvasSlice";
import { store } from "../store/store";

export function resetFormStates(signType, onSignTypeChange) {
  store.dispatch(restoreDefaultSignForm()); // 👈 SNAPSHOT RESTORE
  store.dispatch(setOptionField({ field: "sign_type", value: signType }))
  onSignTypeChange?.(signType)
  store.dispatch(resetB2SignLogo());
  store.dispatch(resetTextCanvas())
}
