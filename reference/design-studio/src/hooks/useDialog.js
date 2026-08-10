import { useEffect, useRef } from "react";

// Small a11y helper for modal/drawer overlays:
//  - closes on Escape
//  - moves focus into the dialog when it opens (so keyboard users land inside)
// Returns a ref to attach to the dialog panel (give it tabIndex={-1}).
// `active` gates it so it's a no-op while the overlay is closed.
export function useDialog(onClose, active = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, active]);

  return ref;
}
