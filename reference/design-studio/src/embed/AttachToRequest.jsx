import { useSelector } from "react-redux";
import { Check, X } from "lucide-react";

import { postToHost } from "./embedParams";
import { priceFromCost } from "../studio-bridge/generateBrandPrice";

// Terminal action for embed mode (spec §8.2): no retail checkout — the studio
// hands its output back to the portal, which owns ordering after approval.
//
// This is spec §8.4's "structured data out": mockup image, chosen size, spec
// fields, price. The portal writes it to line_items.mockup_file_id and uses the
// price for the quote when the item is direct-priced.
const AttachToRequest = ({ params }) => {
  const { ResponseObject, created_background_mockup_URL, options } = useSelector(
    (s) => s.SignForm
  );

  const cost = ResponseObject?.data?.totalCost;
  const hasResult = Boolean(created_background_mockup_URL || cost != null);
  if (!hasResult) return null;

  const attach = () => {
    postToHost(
      "studio:attach",
      {
        // Rendered mockup as a data URL. The portal uploads it to Storage and
        // sets mockup_file_id; it is never hot-linked from here.
        mockupImage: created_background_mockup_URL ?? null,
        // Customer-facing estimate only. Raw fulfillment cost stays server-side —
        // a franchisee must never receive it.
        price: priceFromCost(Number(cost)),
        tatDays: ResponseObject?.data?.tATDays ?? null,
        spec: {
          signType: options?.sign_type ?? null,
          studioSignType: options?.studio_sign_type ?? null,
          studioVariant: options?.studio_variant ?? null,
          width: ResponseObject?.data?.signWidth ?? null,
          height: ResponseObject?.data?.signHeight ?? null,
          depth: ResponseObject?.data?.signDepth ?? null,
          mountingType: ResponseObject?.data?.mountingType ?? null,
        },
      },
      params
    );
  };

  const cancel = () => postToHost("studio:cancel", {}, params);

  return (
    <div className="mt-4 flex gap-2">
      <button
        type="button"
        onClick={cancel}
        className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5"
      >
        <X size={14} /> Cancel
      </button>
      <button
        type="button"
        onClick={attach}
        className="flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"
        style={{ background: "var(--brand)", color: "var(--brand-foreground)" }}
      >
        <Check size={15} /> Attach to request
      </button>
    </div>
  );
};

export default AttachToRequest;
