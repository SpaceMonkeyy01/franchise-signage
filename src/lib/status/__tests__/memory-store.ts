// In-memory StatusStore, so the transition helper is tested as it actually runs
// (loads, plans, writes, logs) rather than only through its pure pieces.

import type { RequestEventInput } from '../events';
import type { StatusStore } from '../transition';
import type {
  FulfillmentTail,
  InstalledSignState,
  LineItemState,
  LineItemStatus,
  RequestState,
} from '../types';

export interface MemoryStoreSeed {
  request: RequestState;
  lineItems: LineItemState[];
  installedSigns?: InstalledSignState[];
  tail?: FulfillmentTail | null;
}

export interface MemoryStore extends StatusStore {
  request: RequestState;
  lineItems: LineItemState[];
  installedSigns: InstalledSignState[];
  events: RequestEventInput[];
  /** lineItemId → the reviewer's note, so decisions are assertable. */
  reviewNotes: Map<string, string | null>;
  changeRequests: Array<{
    requestId: string;
    lineItemIds: string[];
    comment: string;
    packageVersion: number;
    resolvedAt: Date | null;
  }>;
  submittedAt: Date | null;
}

let sequence = 0;

export function createMemoryStore(seed: MemoryStoreSeed): MemoryStore {
  const store: MemoryStore = {
    request: { ...seed.request },
    lineItems: seed.lineItems.map((i) => ({ ...i })),
    installedSigns: (seed.installedSigns ?? []).map((s) => ({ ...s })),
    events: [],
    reviewNotes: new Map(),
    changeRequests: [],
    submittedAt: null,

    async getRequest(requestId) {
      return requestId === store.request.id ? { ...store.request } : null;
    },
    async getLineItems() {
      return store.lineItems.map((i) => ({ ...i }));
    },
    async getInstalledSigns(locationId) {
      return store.installedSigns.filter((s) => s.locationId === locationId).map((s) => ({ ...s }));
    },
    async getFulfillmentTail() {
      return seed.tail ?? null;
    },
    async updateRequest(_requestId, patch) {
      if (patch.status !== undefined) store.request.status = patch.status;
      if (patch.packageVersion !== undefined) store.request.packageVersion = patch.packageVersion;
      if (patch.submittedAt !== undefined) store.submittedAt = patch.submittedAt;
    },
    async setLineItemStatus(lineItemId: string, status: LineItemStatus) {
      const item = store.lineItems.find((i) => i.id === lineItemId);
      if (!item) throw new Error(`No line item ${lineItemId}`);
      item.itemStatus = status;
    },
    async setLineItemReview(lineItemId, review) {
      const item = store.lineItems.find((i) => i.id === lineItemId);
      if (!item) throw new Error(`No line item ${lineItemId}`);
      item.itemStatus = review.status;
      store.reviewNotes.set(lineItemId, review.note);
    },
    async insertEvent(event) {
      store.events.push(event);
    },
    async insertInstalledSign(row) {
      store.installedSigns.push({
        id: `installed-${++sequence}`,
        locationId: row.locationId,
        brandItemId: row.brandItemId,
        sizing: row.sizing,
        mockupFileId: row.mockupFileId,
        status: 'active',
      });
    },
    async updateInstalledSign(installedSignId, patch) {
      const target = store.installedSigns.find((s) => s.id === installedSignId);
      if (!target) throw new Error(`No installed sign ${installedSignId}`);
      target.sizing = patch.sizing;
      target.mockupFileId = patch.mockupFileId;
      target.status = 'active';
    },
    async insertChangeRequest(row) {
      store.changeRequests.push({ ...row, resolvedAt: null });
    },
    async resolveChangeRequests(requestId) {
      for (const entry of store.changeRequests) {
        if (entry.requestId === requestId && !entry.resolvedAt) entry.resolvedAt = new Date();
      }
    },
  };
  return store;
}

// -------------------------------------------------------------- test fixtures
// The Freshbites pilot data from docs/flow-demo.jsx, so tests read as the
// storyline the demo tells.

export function lineItem(overrides: Partial<LineItemState> & Pick<LineItemState, 'id'>): LineItemState {
  return {
    brandItemId: 'fb_storefront',
    origin: 'standard',
    itemStatus: 'auto_approved',
    sizing: null,
    mockupFileId: null,
    replacesSignId: null,
    estPriceSnapshot: null,
    ...overrides,
  };
}

export function request(overrides: Partial<RequestState> = {}): RequestState {
  return {
    id: 'REQ-0016',
    locationId: 'LOC-0008',
    intent: 'initial_setup',
    status: 'submitted',
    packageVersion: 1,
    ...overrides,
  };
}
