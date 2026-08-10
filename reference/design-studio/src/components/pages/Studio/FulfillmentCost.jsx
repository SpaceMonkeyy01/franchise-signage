import { useSelector } from "react-redux";

// INTERNAL fulfillment cost (ResponseObject.data.totalCost) — the wholesale cost
// of producing the sign, not a customer-facing price.
//
// Renamed from "Signize Price": the studio is white-label and the engine vendor
// is never named in the UI. Kept staff-only by its call site in
// QuoteAndMockupsResult (`!isCustomer && <FulfillmentCost />`) — a franchisee
// must never see cost, only cost + margin. See studio-bridge/generateBrandPrice.
const FulfillmentCost = () => {
  const { ResponseObject } = useSelector((state) => state.SignForm);

  const cost = ResponseObject?.data?.totalCost;
  if (cost == null) return null;

  const tat = ResponseObject?.data?.tATDays;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Fulfillment cost · internal
      </h2>
      <p className="my-1 text-2xl font-bold text-foreground">
        ${cost.toFixed(2)}
      </p>
      <p className="text-xs text-muted-foreground">
        Wholesale production cost{tat != null ? ` · TAT: ${tat} days` : ""}
      </p>
    </div>
  );
};

export default FulfillmentCost;
