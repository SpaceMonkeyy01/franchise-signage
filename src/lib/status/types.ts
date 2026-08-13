// TypeScript mirrors of the database enums (SPEC §5, §6).
//
// These are hand-maintained rather than generated so the state machine can be
// reasoned about without a running database. When supabase gen types lands in a
// later session, keep this file as the domain vocabulary and let the generated
// types describe row shapes.

export type Placement = 'indoor' | 'outdoor';
export type PricingBasis = 'direct' | 'standin';

export type ApprovalMode = 'standard_model' | 'always' | 'never';

export type VendorPolicy =
  | 'signage_com'
  | 'approved_vendor'
  | 'preferred_vendor'
  | 'corporate_first';

export type LocationFormat = 'inline' | 'endcap' | 'freestanding';

export type RequestIntent =
  | 'initial_setup'
  | 'add'
  | 'replace_like'
  | 'modify'
  | 'remove'
  | 'rebrand';

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'needs_review'
  | 'changes_requested'
  | 'approved'
  | 'sent_for_quote'
  | 'quote_ready'
  | 'accepted'
  | 'in_production'
  | 'shipped'
  | 'completed';

export type LineItemOrigin = 'standard' | 'addon' | 'exception' | 'replacement';

export type LineItemStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'approved'
  | 'declined'
  | 'changes_requested';

export type ReplaceReason = 'damaged' | 'worn' | 'vandalized';

export type EventActor = 'franchisee' | 'team' | 'reviewer' | 'corporate' | 'system';

/** Which lifecycle tail a request runs down after sent_for_quote (SPEC §4). */
export type FulfillmentTail = 'internal' | 'external';

// ---------------------------------------------------------------- domain rows
// Minimal shapes — only the fields the state machine actually reads, so the
// pure functions stay callable from tests with plain object literals.

export interface BrandRules {
  approvalMode: ApprovalMode;
  vendorPolicy: VendorPolicy;
}

export interface BrandItemRules {
  id: string;
  /** Per-item override of the brand approval rules. Null → follow the brand. */
  requiresReviewOverride: boolean | null;
  /** Per-item routing override. Null → brand default. */
  vendorPolicyOverride: VendorPolicy | null;
  /** Null for standin-priced items — always a manual team quote. */
  estPrice: number | null;
}

export interface LineItemState {
  id: string;
  brandItemId: string;
  origin: LineItemOrigin;
  itemStatus: LineItemStatus;
  sizing: string | null;
  mockupFileId: string | null;
  /** Set only on replacement items: the installed sign being replaced. */
  replacesSignId: string | null;
  estPriceSnapshot: number | null;
}

export interface RequestState {
  id: string;
  locationId: string;
  intent: RequestIntent;
  status: RequestStatus;
  packageVersion: number;
}

export interface InstalledSignState {
  id: string;
  locationId: string;
  brandItemId: string;
  sizing: string | null;
  mockupFileId: string | null;
  status: 'active' | 'removed';
}
