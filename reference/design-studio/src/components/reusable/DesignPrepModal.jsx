import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";

import { setCustomerInfo } from "../../store/Slices/SignFormSlice";
import { useRole } from "../../hooks/useRole";
import { ROLES } from "../../config/roles";
import { useDialog } from "../../hooks/useDialog";
import { readEmbedParams } from "../../embed/embedParams";

// Shown over the studio canvas the moment a design is submitted: while the
// Signize pricing/mockup APIs run, we ask the customer for their contact +
// project details so the wait is productive. The captured info lands in
// SignForm.customerInfo and flows into the logged estimate.
//
// Self-contained: it watches the studio loading flags and opens itself on the
// rising edge of a price calculation (i.e. when the user clicks Submit). It
// stays open after the design is ready until the user dismisses it.

const prepSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Customer email is required")
    .email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[+\d][\d\s().-]{6,}$/, "Enter a valid phone number"),
  projectName: z.string().trim(),
});

const inputClass =
  "w-full bg-white border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

const DesignPrepModal = () => {
  const dispatch = useDispatch();
  const { loading, created_background_mockup_loading, customerInfo } =
    useSelector((s) => s.SignForm);
  const user = useSelector((s) => s.User?.user);
  // Only a customer buying for themselves is the customer on the estimate. Staff
  // (admins / reps) create estimates ON BEHALF OF a customer, so we must NOT
  // prefill their own account — the fields start blank for them to fill in.
  const isCustomer = useRole() === ROLES.USER;

  const preparing = loading || created_background_mockup_loading;
  const [open, setOpen] = useState(false);
  const prevLoading = useRef(false);
  const { embed } = readEmbedParams();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(prepSchema),
    defaultValues: { name: "", email: "", phone: "", projectName: "" },
  });

  // Open on the rising edge of the price calculation — that's the Submit click.
  // Skipped entirely in embed mode (spec §8.1): the franchisee is already
  // identified by their request token, so re-asking for contact details is both
  // redundant and a retail-flow artefact.
  useEffect(() => {
    if (embed) return;
    if (loading && !prevLoading.current) {
      reset({
        name: customerInfo?.name || (isCustomer ? user?.name : "") || "",
        email: customerInfo?.email || (isCustomer ? user?.email : "") || "",
        phone: customerInfo?.phone || "",
        projectName: customerInfo?.projectName || "",
      });
      setOpen(true);
    }
    prevLoading.current = loading;
  }, [loading, customerInfo, user, isCustomer, reset]);

  // The popup can't be dismissed until the design is fully prepared (price +
  // mockup done). `preparing` is true while either is still running.
  const requestClose = () => {
    if (!preparing) setOpen(false);
  };
  const panelRef = useDialog(requestClose, open);

  if (!open) return null;

  const onSubmit = (values) => {
    dispatch(setCustomerInfo(values));
    // Only close once the mockup has finished generating.
    if (!preparing) setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Preparing your design"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              {preparing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <CheckCircle2 size={20} />
              )}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {preparing
                  ? "We're Preparing Your Design"
                  : "Your Design Is Ready"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {preparing
                  ? "This takes a moment — please provide the following info."
                  : "Add your details below, then view your design."}
              </p>
            </div>
          </div>
          {/* No close affordance until the design is ready. */}
          {!preparing && (
            <button
              type="button"
              onClick={requestClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Customer name
            </label>
            <input
              className={inputClass}
              placeholder="Jane Doe"
              autoComplete="name"
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Customer email
            </label>
            <input
              className={inputClass}
              type="email"
              placeholder="jane@example.com"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Customer phone number
            </label>
            <input
              className={inputClass}
              type="tel"
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Project name
            </label>
            <input
              className={inputClass}
              placeholder="e.g. Storefront Channel Letters"
              {...register("projectName")}
            />
            {errors.projectName && (
              <p className="mt-1 text-xs text-red-400">
                {errors.projectName.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={preparing}
            className="btn-primary mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {preparing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Preparing your design…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                View My Design
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DesignPrepModal;
