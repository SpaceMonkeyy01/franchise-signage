import { useState, useEffect } from "react";
import { Store, Upload, ShieldCheck, Mail, ChevronRight, ChevronLeft, Check, X, Clock, FileText, Send, AlertCircle, MapPin, Leaf, Inbox, User, Building2, Plus, Flag, Eye, RefreshCw, Wrench, Trash2, Paintbrush, Zap, Sparkles, Layers } from "lucide-react";
// Real Signize mockup engine, resolved by the host app (reference/design-studio)
// through the "@studio-bridge" alias in its vite.config.js.
//
// NOTE: this makes the demo a module of that app rather than a standalone file —
// pasting it into a bare canvas/artifact environment will no longer resolve.
// Run it at /demo instead.
//
// The RUNTIME fallback is intact: generateBrandMockup returns null on any
// failure (no token, standin sign type, engine down) and the modal keeps the SVG
// placeholder, so the franchise flow never blocks on Design Studio (spec §8).
import { generateBrandMockup } from "@studio-bridge/generateBrandMockup";
import { generateBrandPrice } from "@studio-bridge/generateBrandPrice";
import { pricingSignTypeFor } from "@studio-bridge/renderKeyMap";

// Where the embedded Design Studio lives. Same origin today (the studio is a
// route in this app); in production this becomes the studio's deployed URL and
// nothing else about the integration changes.
const STUDIO_EMBED_URL = "/studio/logo";
const STUDIO_MESSAGE_SOURCE = "signage-studio";

const GREEN = "#2E7D32";
const GREEN_DARK = "#1B5E20";
const GREEN_LIGHT = "#E8F5E9";

// ---------------- MASTER CATALOG (condensed from Signage.com taxonomy) ----------------
// pricing: "direct" = canonical pricing model exists · "standin" = halo-lit stand-in pricing (manual quote for pilot)
const MASTER = [
  // Outdoor · Building/Wall
  { id: "out_ch_prem", placement: "outdoor", category: "Building / Wall", type: "Illuminated Channel Letters", variant: "Face-Lit · Premium (Metallic Trim)", pricing: "direct", render: "channel" },
  { id: "out_ch_std", placement: "outdoor", category: "Building / Wall", type: "Illuminated Channel Letters", variant: "Face-Lit · Standard (Plastic Trim)", pricing: "direct", render: "channel" },
  { id: "out_ch_halo", placement: "outdoor", category: "Building / Wall", type: "Illuminated Channel Letters", variant: "Halo-Lit (Back-lit)", pricing: "direct", render: "channel" },
  { id: "out_ch_fh", placement: "outdoor", category: "Building / Wall", type: "Illuminated Channel Letters", variant: "Face & Halo-Lit", pricing: "direct", render: "channel" },
  { id: "out_fab", placement: "outdoor", category: "Building / Wall", type: "Dimensional Fabricated Letters", variant: "Painted / Brushed / Polished finishes", pricing: "direct", render: "letters" },
  { id: "out_flat", placement: "outdoor", category: "Building / Wall", type: "Dimensional Flat Cut Letters", variant: "Aluminum · Acrylic", pricing: "direct", render: "letters" },
  { id: "out_box", placement: "outdoor", category: "Building / Wall", type: "Lightbox / Cabinet Sign", variant: "Standard or Custom Shape", pricing: "direct", render: "box" },
  { id: "out_push", placement: "outdoor", category: "Building / Wall", type: "Push-Through Signage", variant: "Face-lit · Halo-lit", pricing: "direct", render: "box" },
  { id: "out_neon", placement: "outdoor", category: "Building / Wall", type: "Open Face Neon", variant: "", pricing: "direct", render: "channel" },
  { id: "out_awning", placement: "outdoor", category: "Building / Wall", type: "Awnings & Canopies", variant: "Vinyl · Fabric · Metal", pricing: "standin", render: "box" },
  // Outdoor · Freestanding
  { id: "out_pylon", placement: "outdoor", category: "Freestanding", type: "Pylon Sign", variant: "Single / Double Pole", pricing: "standin", render: "pylon" },
  { id: "out_monument", placement: "outdoor", category: "Freestanding", type: "Monument Sign", variant: "Brick / Stone / Aluminum", pricing: "standin", render: "box" },
  { id: "out_blade", placement: "outdoor", category: "Freestanding", type: "Blade / Projecting Sign", variant: "Double-Sided", pricing: "direct", render: "box" },
  { id: "out_aframe", placement: "outdoor", category: "Freestanding", type: "A-Frame Sign", variant: "", pricing: "direct", render: "box" },
  { id: "out_way", placement: "outdoor", category: "Freestanding", type: "Wayfinding & Directional", variant: "Entrance · Parking · Regulatory", pricing: "standin", render: "letters" },
  // Outdoor · Specialty
  { id: "out_banner", placement: "outdoor", category: "Specialty", type: "Vinyl Banners", variant: "", pricing: "direct", render: "box" },
  // Indoor
  { id: "in_halo", placement: "indoor", category: "Illuminated", type: "Illuminated Dimensional Letters", variant: "Halo-Lit (Back-lit)", pricing: "direct", render: "letters" },
  { id: "in_face", placement: "indoor", category: "Illuminated", type: "Illuminated Dimensional Letters", variant: "Face-Lit · Premium", pricing: "direct", render: "letters" },
  { id: "in_box", placement: "indoor", category: "Illuminated", type: "Lightbox / Cabinet Sign", variant: "Standard or Custom Shape", pricing: "direct", render: "menu" },
  { id: "in_neon", placement: "indoor", category: "Illuminated", type: "LED Neon Sign", variant: "Custom Bent Flex Tubing", pricing: "direct", render: "letters" },
  { id: "in_menu", placement: "indoor", category: "Illuminated", type: "Digital Menu Boards", variant: "", pricing: "standin", render: "menu" },
  { id: "in_fab", placement: "indoor", category: "Non-Illuminated", type: "Dimensional Fabricated Letters", variant: "Painted / Brushed / Polished finishes", pricing: "direct", render: "letters" },
  { id: "in_flat", placement: "indoor", category: "Non-Illuminated", type: "Dimensional Flat Cut Letters", variant: "Acrylic · Metal · PVC", pricing: "direct", render: "letters" },
  { id: "in_vinyl", placement: "indoor", category: "Non-Illuminated", type: "Vinyl Graphics", variant: "Decals · Window Frosting · Wall Wraps", pricing: "standin", render: "window" },
  { id: "in_plaque", placement: "indoor", category: "Non-Illuminated", type: "Wall Plaque", variant: "Acrylic with Standoffs", pricing: "direct", render: "letters" },
];

// ---------------- FRESHBITES BRAND CATALOG (pinned brand items) ----------------
const BRAND_ITEMS = [
  { id: "fb_storefront", masterId: "out_ch_prem", name: "Freshbites Storefront Letters", spec: "Trimless · match-logo returns · gloss · standard raceway · UL listed", siteVars: "size + mounting per site", price: 8400 },
  { id: "fb_window", masterId: "in_vinyl", name: "Freshbites Window Frosting", spec: "Leaf pattern frost · full lower pane coverage", siteVars: "pane count per site", price: null },
  { id: "fb_lobby", masterId: "in_halo", name: "Freshbites Lobby Letters", spec: "Halo-lit · brushed aluminum · flush mounted", siteVars: "size per wall", price: 2900 },
  { id: "fb_entrance", masterId: "out_way", name: "Freshbites Entrance Sign", spec: "Entrance wayfinding · brand green panel", siteVars: "post vs wall mount per site", price: null },
  { id: "fb_pylon", masterId: "out_pylon", name: "Freshbites Road Sign", spec: "Single pole pylon · illuminated cabinet panel", siteVars: "height per code", price: null, vendorOverride: "approved_vendor" },
  { id: "fb_menu", masterId: "in_box", name: "Freshbites Menu Board", spec: "3-panel lightbox · matte diffuser", siteVars: "panel count per layout", price: 3200 },
  { id: "fb_blade", masterId: "out_blade", name: "Freshbites Blade Sign", spec: "Double-sided · bracket mounted · brand green", siteVars: "projection per landlord", price: 1850 },
  { id: "fb_aframe", masterId: "out_aframe", name: "Freshbites Sidewalk A-Frame", spec: "Standard A-frame · swappable insert", siteVars: "none", price: 420 },
  { id: "fb_neon", masterId: "in_neon", name: "Freshbites Neon Leaf", spec: "LED flex neon · leaf mark · simple green", siteVars: "size per wall", price: 1600 },
  { id: "fb_banner", masterId: "out_banner", name: "Freshbites Opening Banner", spec: "Vinyl · 'Now Open' template", siteVars: "size per facade", price: 380 },
];

// Vendor policy presets — which one applies is set at white-glove setup per brand
const VENDOR_PRESETS = {
  signage_com: {
    vendorPolicy: "signage_com",
    policyLabel: "Signage.com direct",
    vendorLabel: "Signage.com Manufacturing",
    vendorEmail: "quotes@signage.com",
    corporateCc: true,
    corporateEmail: "brand@freshbites.com",
    tat: "14 working days",
    external: false,
  },
  approved_vendor: {
    vendorPolicy: "approved_vendor",
    policyLabel: "Approved vendor",
    vendorLabel: "SignCraft Industries",
    vendorEmail: "orders@signcraftindustries.com",
    corporateCc: true,
    corporateEmail: "brand@freshbites.com",
    tat: "per vendor",
    external: true,
  },
};

const fmtPrice = (p) => p == null ? null : "$" + p.toLocaleString("en-US");

const FORMATS = [
  { id: "inline", label: "Inline storefront", desc: "Standard strip-center unit", pkg: ["fb_storefront", "fb_window", "fb_lobby", "fb_entrance"] },
  { id: "endcap", label: "Endcap", desc: "Corner unit, two elevations", pkg: ["fb_storefront", "fb_storefront", "fb_window", "fb_lobby", "fb_entrance"] },
  { id: "freestanding", label: "Freestanding", desc: "Standalone building with road sign", pkg: ["fb_storefront", "fb_pylon", "fb_window", "fb_lobby", "fb_entrance"] },
];

const bi = (id) => BRAND_ITEMS.find((b) => b.id === id);
const master = (id) => MASTER.find((m) => m.id === id);
const biMaster = (brandItemId) => master(bi(brandItemId).masterId);
const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
let itemCounter = 100;
let signCounter = 500;

const ITEM_STATUS = {
  auto_approved: { label: "Pre-approved", color: "bg-green-100 text-green-800" },
  pending_review: { label: "Needs corporate approval", color: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  declined: { label: "Declined", color: "bg-rose-100 text-rose-800" },
  changes_requested: { label: "Changes requested", color: "bg-rose-100 text-rose-800" },
};

const REQ_STATUS = {
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  needs_review: { label: "Needs review", color: "bg-amber-100 text-amber-800" },
  changes_requested: { label: "Changes requested", color: "bg-rose-100 text-rose-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  sent_for_quote: { label: "Sent for quote", color: "bg-emerald-100 text-emerald-800" },
  quote_ready: { label: "Quote ready", color: "bg-indigo-100 text-indigo-800" },
  accepted: { label: "Quote accepted", color: "bg-emerald-100 text-emerald-800" },
  in_production: { label: "In production", color: "bg-purple-100 text-purple-800" },
  shipped: { label: "Shipped", color: "bg-sky-100 text-sky-800" },
  completed: { label: "Installed", color: "bg-gray-200 text-gray-700" },
};

const INTENTS = [
  { id: "add", label: "Add a new sign", desc: "From the approved Freshbites catalog", icon: Plus, live: true, rule: "Needs corporate approval" },
  { id: "replace_like", label: "Replace like-for-like", desc: "Damaged, faded, or worn sign", icon: RefreshCw, live: true, rule: "Pre-approved — straight to quote" },
  { id: "modify", label: "Modify an existing sign", desc: "Different size, spec, or position", icon: Wrench, live: false, rule: "Corporate reviews the change" },
  { id: "remove", label: "Remove a sign", desc: "Take down an installed sign", icon: Trash2, live: false, rule: "Logged; review per brand policy" },
  { id: "rebrand", label: "Remodel / rebrand", desc: "Update to new brand standards", icon: Paintbrush, live: false, rule: "Diffed against current package" },
];

const seedLocation = {
  id: "LOC-0007",
  name: "Freshbites — Oak Plaza",
  address: "88 Oak Plaza Dr, Austin, TX",
  format: "inline",
  openingDate: "Sep 15, 2025",
  installedSigns: [
    { id: 501, brandItemId: "fb_storefront", sizing: "22' frontage · 30\" letters", installed: "Sep 2025" },
    { id: 502, brandItemId: "fb_window", sizing: "4 panes", installed: "Sep 2025" },
    { id: 503, brandItemId: "fb_lobby", sizing: "36\" wall set", installed: "Sep 2025" },
    { id: 504, brandItemId: "fb_entrance", sizing: "Wall mounted", installed: "Sep 2025" },
    { id: 505, brandItemId: "fb_menu", sizing: "3 panels", installed: "Oct 2025" },
  ],
};

const makeSeedLocations = () => JSON.parse(JSON.stringify([
  seedLocation,
  { id: "LOC-0008", name: "Freshbites — Cedar Park", address: "412 Whitestone Blvd, Cedar Park, TX", format: "inline", openingDate: "Oct 1, 2026", installedSigns: [] },
]));

const makeSeedRequests = () => JSON.parse(JSON.stringify([
  {
    id: "REQ-0018", locationId: "LOC-0007", intent: "add", status: "needs_review",
    items: [{ id: 918, brandItemId: "fb_neon", origin: "addon", status: "pending_review", photo: true, sizing: "48\" back wall", tbd: false, issue: null }],
    events: [
      { t: "Aug 4, 9:12 AM", e: "1 new sign requested for existing location — needs corporate approval", a: "Franchisee" },
      { t: "Aug 4, 11:30 AM", e: "Package prepared · 1 sent for review", a: "Signage.com team" },
      { t: "Aug 4, 11:31 AM", e: "Approval email sent to corporate reviewer", a: "System" },
    ],
  },
  {
    id: "REQ-0017", locationId: "LOC-0007", intent: "replace_like", status: "in_production",
    items: [{ id: 917, brandItemId: "fb_menu", origin: "replacement", status: "auto_approved", photo: true, sizing: "3 panels", tbd: false, issue: null, replacesSignId: 505, reason: "Damaged" }],
    quote: { recipient: "Signage.com Manufacturing", email: "quotes@signage.com", cc: "brand@freshbites.com", total: 3200, pricedCount: 1, manualCount: 0, tat: "14 working days" },
    events: [
      { t: "Jul 28, 3:02 PM", e: "Like-for-like replacement: Freshbites Menu Board (Damaged) — pinned spec + sizing pulled from installed record", a: "Franchisee" },
      { t: "Jul 28, 4:15 PM", e: "Package prepared · no review needed", a: "Signage.com team" },
      { t: "Jul 28, 4:16 PM", e: "Quote package emailed to Signage.com Manufacturing <quotes@signage.com> · cc brand@freshbites.com — 1 priced item(s) $3,200", a: "System" },
      { t: "Jul 29, 10:05 AM", e: "Quote delivered to franchisee — $3,200", a: "Signage.com team" },
      { t: "Jul 29, 1:40 PM", e: "Quote accepted by franchisee", a: "Franchisee" },
      { t: "Jul 30, 8:00 AM", e: "Production started", a: "Signage.com team" },
    ],
  },
  {
    id: "REQ-0016", locationId: "LOC-0008", intent: "initial_setup", status: "quote_ready",
    items: [
      { id: 911, brandItemId: "fb_storefront", origin: "standard", status: "auto_approved", photo: true, sizing: "18' frontage", tbd: false, issue: null },
      { id: 912, brandItemId: "fb_window", origin: "standard", status: "auto_approved", photo: true, sizing: "3 panes", tbd: false, issue: null },
      { id: 913, brandItemId: "fb_lobby", origin: "standard", status: "auto_approved", photo: false, sizing: "", tbd: true, issue: null },
      { id: 914, brandItemId: "fb_entrance", origin: "standard", status: "auto_approved", photo: true, sizing: "Post mounted", tbd: false, issue: null },
      { id: 915, brandItemId: "fb_neon", origin: "addon", status: "approved", photo: false, sizing: "42\" dining wall", tbd: false, issue: null, reviewNote: "Approved — dining area only." },
    ],
    quote: { recipient: "Signage.com Manufacturing", email: "quotes@signage.com", cc: "brand@freshbites.com", total: 12900, pricedCount: 3, manualCount: 2, tat: "14 working days" },
    events: [
      { t: "Jul 22, 2:20 PM", e: "Initial setup submitted (4 standard + 1 needing review)", a: "Franchisee" },
      { t: "Jul 22, 5:01 PM", e: "Package prepared · 4 auto-approved, 1 sent for review", a: "Signage.com team" },
      { t: "Jul 23, 9:14 AM", e: "Freshbites Neon Leaf approved by corporate", a: "Reviewer" },
      { t: "Jul 23, 9:20 AM", e: "Quote package emailed to Signage.com Manufacturing <quotes@signage.com> · cc brand@freshbites.com — 3 priced item(s) $12,900 + 2 manual-priced", a: "System" },
      { t: "Jul 25, 11:45 AM", e: "Quote delivered to franchisee — $12,900 + 2 custom items", a: "Signage.com team" },
    ],
  },
]));

export default function App() {
  const [persona, setPersona] = useState("franchisee");
  const [locations, setLocations] = useState(makeSeedLocations);
  const [requests, setRequests] = useState(makeSeedRequests);
  const [step, setStep] = useState("home");
  const [viewId, setViewId] = useState(null);
  const [queueSel, setQueueSel] = useState(null);
  const [activeLoc, setActiveLoc] = useState(null);
  const [corpTab, setCorpTab] = useState("dashboard");
  const [vendorPolicy, setVendorPolicy] = useState("signage_com");
  const BRAND_CONFIG = VENDOR_PRESETS[vendorPolicy];

  // Per-item vendor resolution: brand-item override wins, else brand default policy
  const resolveVendor = (brandItemId) => VENDOR_PRESETS[bi(brandItemId).vendorOverride || vendorPolicy];
  const VendorChip = ({ bid }) => {
    const v = resolveVendor(bid);
    return (
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
        style={{ background: v.external ? "#EDE9FE" : GREEN_LIGHT, color: v.external ? "#5B21B6" : GREEN_DARK }}>
        {v.external ? v.vendorLabel : "Signage.com"}
      </span>
    );
  };
  // A request's quotes: one package per distinct resolved vendor
  const buildQuotes = (its) => {
    const ok = its.filter((i) => i.status === "approved" || i.status === "auto_approved");
    const groups = {};
    ok.forEach((i) => {
      const v = resolveVendor(i.brandItemId);
      (groups[v.vendorPolicy] = groups[v.vendorPolicy] || { preset: v, items: [] }).items.push(i);
    });
    return Object.values(groups).map(({ preset, items: gi }) => {
      const priced = gi.filter((i) => bi(i.brandItemId).price != null);
      return {
        recipient: preset.vendorLabel, email: preset.vendorEmail,
        cc: preset.corporateCc ? preset.corporateEmail : null,
        total: priced.reduce((s, i) => s + bi(i.brandItemId).price, 0),
        pricedCount: priced.length, manualCount: gi.length - priced.length,
        itemCount: gi.length, itemNames: gi.map((i) => bi(i.brandItemId).name),
        tat: preset.tat, external: preset.external, policyLabel: preset.policyLabel,
      };
    });
  };
  const reqQuotes = (r) => r.quotes || (r.quote ? [r.quote] : []);

  const resetDemo = () => {
    setLocations(makeSeedLocations());
    setRequests(makeSeedRequests());
    setStep("home"); setViewId(null); setQueueSel(null); setActiveLoc(null); setCorpTab("dashboard"); setAddonMockups({});
    setVendorPolicy("signage_com");
    setPersona("franchisee");
  };

  const [loc, setLoc] = useState({ name: "", address: "", format: null, openingDate: "", requesterName: "" });
  const [items, setItems] = useState([]);
  const [openItem, setOpenItem] = useState(null);
  const [flagging, setFlagging] = useState(null);
  const [flagNote, setFlagNote] = useState("");
  const [reviewNotes, setReviewNotes] = useState({});

  const [intent, setIntent] = useState(null);
  const [replaceSel, setReplaceSel] = useState(null);
  const [replaceReason, setReplaceReason] = useState(null);
  const [replacePhoto, setReplacePhoto] = useState(false);
  const [addonSel, setAddonSel] = useState([]);

  // Design Studio: dsCat = selected category key, dsMaster = selected master row
  // `image` holds the real base64 render from the Signize engine once it lands;
  // null means "fall back to the <Mockup> SVG placeholder".
  const [ds, setDs] = useState({ open: false, step: 1, masterId: null, cat: null, logo: false, brandText: "Freshbites", itemId: null, addBid: null, addMode: null, generating: false, image: null, engineSignType: null, live: null, useEmbeddedStudio: true });
  const [addonMockups, setAddonMockups] = useState({});
  const openStudio = (masterId = null, itemId = null) =>
    setDs({ open: true, step: masterId ? 2 : 1, masterId, cat: null, logo: false, brandText: "Freshbites", itemId, addBid: null, addMode: null, generating: false, image: null, engineSignType: null, live: null, useEmbeddedStudio: true });
  // Design-and-add: open Studio for a catalog brand item; attaching adds it to the request
  const openStudioForAdd = (bid, mode) => {
    const b = bi(bid);
    setDs({ open: true, step: 2, masterId: b.masterId, cat: null, logo: false, brandText: "Freshbites", itemId: null, addBid: bid, addMode: mode, generating: false, image: null, engineSignType: null, live: null, useEmbeddedStudio: true });
  };
  const closeStudio = () => setDs((d) => ({ ...d, open: false }));
  // Calls the real engine (POST /generate-mockup). Advances to step 3 either
  // way — with a real render if one came back, otherwise the placeholder.
  const generateMockup = async () => {
    setDs((d) => ({ ...d, generating: true, image: null, live: null }));
    const m = master(ds.masterId);
    const brandText = ds.brandText || "Freshbites";
    // Two independent engines. Pricing returns in ~2s, the render in ~16s, so
    // fire both at once rather than chaining them.
    const [result, live] = await Promise.all([
      generateBrandMockup({ masterId: ds.masterId, placement: m?.placement, brandText }),
      generateBrandPrice({ masterId: ds.masterId, brandText }),
    ]);
    setDs((d) => ({
      ...d,
      generating: false,
      step: 3,
      image: result?.base64 ?? null,
      engineSignType: result?.signType ?? null,
      live,
    }));
  };
  // Build the embed URL for a master row. `signType` is the CANONICAL pricing
  // name from the validated render-key map — the studio resolves it back to a
  // taxonomy leaf and locks its picker to it (spec §8.3/§8.5).
  const studioEmbedSrc = (masterId, itemRef) => {
    const signType = pricingSignTypeFor(masterId);
    const q = new URLSearchParams({ embed: "1", brandText: ds.brandText || "Freshbites" });
    if (signType) q.set("signType", signType);
    if (itemRef != null) q.set("ref", String(itemRef));
    q.set("origin", window.location.origin);
    return `${STUDIO_EMBED_URL}?${q.toString()}`;
  };

  // Receive the studio's terminal action (spec §8.4, "structured data out").
  useEffect(() => {
    if (!ds.open || !ds.useEmbeddedStudio) return;
    const onMessage = (event) => {
      // Only trust our own origin and our own message envelope.
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.source !== STUDIO_MESSAGE_SOURCE) return;

      if (msg.type === "studio:cancel") { closeStudio(); return; }
      if (msg.type === "studio:error") {
        // Fall back to the demo's own generator rather than dead-ending.
        setDs((d) => ({ ...d, useEmbeddedStudio: false, step: 2 }));
        return;
      }
      if (msg.type === "studio:attach") {
        const p = msg.payload ?? {};
        setDs((d) => ({
          ...d,
          step: 3,
          image: p.mockupImage ?? null,
          engineSignType: p.spec?.signType ?? null,
          live: p.price != null
            ? { price: p.price, tatDays: p.tatDays, pricingSignType: p.spec?.signType }
            : null,
        }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ds.open, ds.useEmbeddedStudio]);

  const attachMockup = () => {
    // The real render travels with the line item — this is spec §8's "structured
    // data out", the value that becomes line_items.mockup_file_id.
    if (ds.itemId) patchItem(ds.itemId, { mockup: true, mockupImage: ds.image, livePrice: ds.live?.price ?? null, tatDays: ds.live?.tatDays ?? null });
    if (ds.addBid) {
      setAddonMockups((m) => ({ ...m, [ds.addBid]: ds.image ?? true }));
      if (ds.addMode === "addpick") {
        setAddonSel((sel) => sel.includes(ds.addBid) ? sel : [...sel, ds.addBid]);
      } else if (ds.addMode === "setup3") {
        setItems((xs) => xs.some((x) => x.origin === "addon" && x.brandItemId === ds.addBid)
          ? xs.map((x) => x.origin === "addon" && x.brandItemId === ds.addBid ? { ...x, mockup: true, mockupImage: ds.image } : x)
          : [...xs, { id: ++itemCounter, brandItemId: ds.addBid, origin: "addon", status: "pending_review", photo: false, sizing: "", tbd: false, issue: null, mockup: true, mockupImage: ds.image }]);
      }
    }
    closeStudio();
  };

  const patchItem = (id, patch) => setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const loadPackage = (formatId) => {
    const f = FORMATS.find((x) => x.id === formatId);
    setItems(f.pkg.map((bid) => ({ id: ++itemCounter, brandItemId: bid, origin: "standard", status: "auto_approved", photo: false, sizing: "", tbd: false, issue: null, mockup: false })));
  };
  const flagIssue = (id) => { patchItem(id, { origin: "exception", status: "pending_review", issue: flagNote }); setFlagging(null); setFlagNote(""); };

  const updateReq = (id, patch, event) =>
    setRequests((rs) => rs.map((r) => r.id === id ? { ...r, ...patch, events: event ? [...r.events, { t: now(), ...event }] : r.events } : r));

  const submitSetup = () => {
    const pending = items.filter((i) => i.status === "pending_review").length;
    const locId = "LOC-" + String(8 + locations.length).padStart(4, "0");
    setLocations((ls) => [...ls, { id: locId, name: loc.name || "New Freshbites Location", address: loc.address || "Address TBD", format: loc.format, openingDate: loc.openingDate || "TBD", installedSigns: [] }]);
    const id = "REQ-" + String(20 + requests.length).padStart(4, "0");
    setRequests((rs) => [{
      id, locationId: locId, intent: "initial_setup", status: "submitted",
      items: items.map((i) => ({ ...i })),
      events: [{ t: now(), e: `Initial setup submitted (${items.length - pending} standard + ${pending} needing review)`, a: "Franchisee" }],
    }, ...rs]);
    setViewId(id); setStep("status");
  };

  const submitReplace = () => {
    const l = locations.find((x) => x.id === activeLoc);
    const installed = l.installedSigns.find((s) => s.id === replaceSel);
    const id = "REQ-" + String(20 + requests.length).padStart(4, "0");
    setRequests((rs) => [{
      id, locationId: l.id, intent: "replace_like", status: "submitted",
      items: [{ id: ++itemCounter, brandItemId: installed.brandItemId, origin: "replacement", status: "auto_approved", photo: replacePhoto, sizing: installed.sizing, tbd: false, issue: null, replacesSignId: installed.id, reason: replaceReason }],
      events: [{ t: now(), e: `Like-for-like replacement: ${bi(installed.brandItemId).name} (${replaceReason}) — pinned spec + sizing pulled from installed record`, a: "Franchisee" }],
    }, ...rs]);
    setViewId(id); setStep("status");
    setReplaceSel(null); setReplaceReason(null); setReplacePhoto(false);
  };

  const submitAddons = () => {
    const l = locations.find((x) => x.id === activeLoc);
    const id = "REQ-" + String(20 + requests.length).padStart(4, "0");
    setRequests((rs) => [{
      id, locationId: l.id, intent: "add", status: "submitted",
      items: addonSel.map((bid) => ({ id: ++itemCounter, brandItemId: bid, origin: "addon", status: "pending_review", photo: false, sizing: "", tbd: false, issue: null, mockup: !!addonMockups[bid] })),
      events: [{ t: now(), e: `${addonSel.length} new sign(s) requested for existing location — needs corporate approval`, a: "Franchisee" }],
    }, ...rs]);
    setViewId(id); setStep("status"); setAddonSel([]); setAddonMockups({});
  };

  const decideItem = (reqId, itemId, decision) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== reqId) return r;
      const its = r.items.map((it) => it.id === itemId ? { ...it, status: decision, reviewNote: reviewNotes[itemId] || null } : it);
      const anyPending = its.some((i) => i.status === "pending_review");
      const anyChanges = its.some((i) => i.status === "changes_requested");
      const verb = decision === "approved" ? "approved" : decision === "declined" ? "declined" : "sent back with change request";
      const ev = { t: now(), e: `${bi(r.items.find(i=>i.id===itemId).brandItemId).name} ${verb} by corporate${decision === "changes_requested" && reviewNotes[itemId] ? `: "${reviewNotes[itemId]}"` : ""}`, a: "Reviewer" };
      return { ...r, items: its, status: anyPending ? "needs_review" : anyChanges ? "changes_requested" : "approved", events: [...r.events, ev] };
    }));
  };
  // Franchisee resubmits a changed item (demo: simulated edit)
  const resubmitItem = (reqId, itemId) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== reqId) return r;
      const its = r.items.map((it) => it.id === itemId ? { ...it, status: "pending_review", priorNote: it.reviewNote, reviewNote: null } : it);
      return { ...r, items: its, status: "needs_review",
        events: [...r.events,
          { t: now(), e: `${bi(r.items.find(i=>i.id===itemId).brandItemId).name} updated and resubmitted by franchisee`, a: "Franchisee" },
          { t: now(), e: "Approval email re-sent to corporate reviewer", a: "System" }] };
    }));
  };

  const markCompleted = (reqId) => {
    const r = requests.find((x) => x.id === reqId);
    const okItems = r.items.filter((i) => i.status === "approved" || i.status === "auto_approved");
    setLocations((ls) => ls.map((l) => {
      if (l.id !== r.locationId) return l;
      let signs = [...l.installedSigns];
      okItems.forEach((it) => {
        if (it.replacesSignId) {
          signs = signs.map((s) => s.id === it.replacesSignId ? { ...s, installed: now().split(",")[0] + " (replaced)", sizing: it.sizing } : s);
        } else {
          signs.push({ id: ++signCounter, brandItemId: it.brandItemId, sizing: it.sizing || "Per approved spec", installed: now().split(",")[0] });
        }
      });
      return { ...l, installedSigns: signs };
    }));
    updateReq(reqId, { status: "completed" }, { e: `Marked installed — ${okItems.length} sign(s) written to location record`, a: "Signage.com team" });
  };

  const IBadge = ({ s }) => <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ITEM_STATUS[s].color}`}>{ITEM_STATUS[s].label}</span>;
  const RBadge = ({ s }) => <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${REQ_STATUS[s].color}`}>{REQ_STATUS[s].label}</span>;
  const OriginTag = ({ o }) => {
    const map = { standard: ["Standard", GREEN_LIGHT, GREEN_DARK], addon: ["Add-on", "#FEF3C7", "#92400E"], exception: ["Exception", "#FFE4E6", "#9F1239"], replacement: ["Replacement", "#DBEAFE", "#1E40AF"] };
    const [t, bg, fg] = map[o] || map.standard;
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: bg, color: fg }}>{t}</span>;
  };
  const PricingTag = ({ masterId }) => master(masterId).pricing === "standin"
    ? <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Custom quote</span>
    : null;

  const Logo = () => (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GREEN_LIGHT }}>
        <Leaf size={18} style={{ color: GREEN }} />
      </div>
      <div>
        <div className="font-bold text-lg leading-none"><span style={{ color: GREEN_DARK }}>Fresh</span><span style={{ color: GREEN }}>bites</span></div>
        <div className="text-[10px] text-gray-500 tracking-wide">Powered by <span className="font-semibold text-gray-700">SIGNAGE.com</span></div>
      </div>
    </div>
  );

  const NavBtn = ({ to, children }) => (
    <button onClick={() => setStep(to)} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"><ChevronLeft size={14} /> {children}</button>
  );

  const BrandCard = ({ bid }) => {
    const b = bi(bid); const m = master(b.masterId);
    return (
      <>
        <div className="text-sm font-medium text-gray-900 flex items-center justify-between">
          <span>{b.name}</span>
          <span className="text-[11px] font-semibold shrink-0 ml-1" style={{ color: b.price ? GREEN_DARK : "#9CA3AF" }}>{b.price ? "from " + fmtPrice(b.price) : ""}</span>
        </div>
        <div className="text-[10px] text-gray-500">{m.type}{m.variant ? ` · ${m.variant}` : ""}</div>
        <div className="text-[10px] text-gray-400">{b.spec}</div>
      </>
    );
  };

  // (single-vendor buildQuote superseded by buildQuotes above)

  // ---------------- DESIGN STUDIO ----------------
  // `image` = a real base64 render from the Signize engine. When present it wins;
  // otherwise we draw the placeholder SVG, which is still the right answer for
  // standin sign types (pylons, awnings, monuments) the engine can't render.
  const Mockup = ({ masterId, brandText, image = null }) => {
    if (image) {
      return (
        <img
          src={image}
          alt={`${master(masterId)?.type} mockup for ${brandText}`}
          className="w-full rounded-xl object-cover"
        />
      );
    }
    const m = master(masterId);
    const render = m.render;
    const outdoor = m.placement === "outdoor";
    const glow = render === "channel";
    return (
      <svg viewBox="0 0 340 200" className="w-full rounded-xl" style={{ background: outdoor ? "linear-gradient(#BFDBFE 0%, #E0F2FE 55%, #D1D5DB 55%)" : "#F5F5F4" }}>
        {outdoor ? (
          <>
            <rect x="30" y="52" width="250" height="96" rx="2" fill="#374151" />
            <rect x="30" y="100" width="250" height="8" fill="#1F2937" />
            <path d="M30 108 L280 108 L270 122 L40 122 Z" fill="#14532D" />
            <rect x="48" y="122" width="52" height="26" fill="#93C5FD" opacity="0.7" />
            <rect x="112" y="122" width="52" height="26" fill="#93C5FD" opacity="0.7" />
            <rect x="200" y="118" width="40" height="30" rx="1" fill="#4B5563" />
            {render === "box" ? (
              <g>
                <rect x="75" y="62" width="160" height="32" rx="6" fill="#FFFFFF" stroke="#D1D5DB" />
                <text x="155" y="83" textAnchor="middle" fontSize="19" fontWeight="700" fill={GREEN}>{brandText}</text>
              </g>
            ) : (
              <g>
                {glow && <text x="155" y="84" textAnchor="middle" fontSize="24" fontWeight="800" fill="#86EFAC" opacity="0.55" style={{ filter: "blur(3px)" }}>{brandText}</text>}
                <text x="155" y="84" textAnchor="middle" fontSize="22" fontWeight="800" fill={glow ? "#BBF7D0" : "#E5E7EB"}>{brandText}</text>
              </g>
            )}
            {render === "pylon" && (
              <g>
                <rect x="296" y="70" width="6" height="78" fill="#4B5563" />
                <rect x="278" y="40" width="44" height="34" rx="4" fill="#FFFFFF" stroke="#D1D5DB" />
                <text x="300" y="61" textAnchor="middle" fontSize="9" fontWeight="700" fill={GREEN}>{brandText}</text>
              </g>
            )}
            <circle cx="300" cy="28" r="12" fill="#FDE68A" />
          </>
        ) : (
          <>
            <rect x="0" y="0" width="340" height="150" fill="#E7E5E4" />
            <rect x="0" y="150" width="340" height="50" fill="#A8A29E" />
            {render === "window" ? (
              <g>
                <rect x="60" y="30" width="220" height="120" rx="3" fill="#BFDBFE" opacity="0.8" stroke="#78716C" strokeWidth="4" />
                <text x="170" y="95" textAnchor="middle" fontSize="24" fontWeight="800" fill={GREEN} opacity="0.9">{brandText}</text>
              </g>
            ) : render === "menu" ? (
              <g>
                {[0, 1, 2].map((i) => <rect key={i} x={54 + i * 82} y="34" width="72" height="96" rx="4" fill="#1F2937" />)}
                <text x="170" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill={GREEN_DARK}>{brandText} Menu</text>
              </g>
            ) : (
              <text x="170" y="88" textAnchor="middle" fontSize="26" fontWeight="800" fill={GREEN_DARK}>{brandText}</text>
            )}
            <ellipse cx="90" cy="168" rx="26" ry="8" fill="#78716C" opacity="0.4" />
            <rect x="82" y="130" width="16" height="36" rx="8" fill="#14532D" />
          </>
        )}
      </svg>
    );
  };

  const designStudioModal = () => {
    if (!ds.open) return null;
    const cats = [...new Set(MASTER.map((m) => `${m.placement === "outdoor" ? "Outdoor" : "Indoor"} · ${m.category}`))];
    const catRows = ds.cat ? MASTER.filter((m) => `${m.placement === "outdoor" ? "Outdoor" : "Indoor"} · ${m.category}` === ds.cat) : [];
    const selMaster = ds.masterId ? master(ds.masterId) : null;
    const fromItem = ds.itemId != null;
    const fromAdd = ds.addBid != null;
    const pinnedBrandItem = fromAdd ? bi(ds.addBid) : (fromItem ? BRAND_ITEMS.find((b) => b.masterId === ds.masterId) : null);
    // Step 2 is where the design happens — either the real embedded studio or,
    // if the host couldn't lock a sign type, the demo's own generator.
    const embeddedStudioVisible = ds.step === 2 && ds.useEmbeddedStudio && Boolean(ds.masterId);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={closeStudio}>
        {/* The embedded studio needs real estate; the wizard steps don't. */}
        <div className={`bg-white rounded-2xl w-full shadow-xl max-h-[92vh] overflow-y-auto ${embeddedStudioVisible ? "max-w-6xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GREEN_LIGHT }}>
                <Sparkles size={15} style={{ color: GREEN }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Design Studio</div>
                <div className="text-[10px] text-gray-400">Instant signage mockups · powered by Signage.com</div>
              </div>
            </div>
            <button onClick={closeStudio} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="p-5">
            {ds.step === 1 && (
              <>
                <div className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Layers size={13} className="text-gray-400" /> 1 · Choose from the Signage.com catalog</div>
                {!ds.cat ? (
                  <div className="grid grid-cols-2 gap-2">
                    {cats.map((c) => (
                      <button key={c} onClick={() => setDs((d) => ({ ...d, cat: c }))}
                        className="border border-gray-200 rounded-lg px-3 py-3 text-left text-xs text-gray-700 hover:border-gray-300 bg-white">
                        <div className="font-medium">{c}</div>
                        <div className="text-[10px] text-gray-400">{MASTER.filter((m) => `${m.placement === "outdoor" ? "Outdoor" : "Indoor"} · ${m.category}` === c).length} sign types</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <button onClick={() => setDs((d) => ({ ...d, cat: null, masterId: null }))} className="text-[11px] text-gray-400 mb-2 flex items-center gap-1"><ChevronLeft size={11} /> {ds.cat}</button>
                    <div className="grid grid-cols-1 gap-1.5 mb-3">
                      {catRows.map((m) => (
                        <button key={m.id} onClick={() => setDs((d) => ({ ...d, masterId: m.id }))}
                          className={`border rounded-lg px-3 py-2 text-left text-xs bg-white flex items-center justify-between ${ds.masterId === m.id ? "font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                          style={ds.masterId === m.id ? { borderColor: GREEN, background: GREEN_LIGHT, color: GREEN_DARK } : {}}>
                          <span>{m.type}{m.variant && <span className="block text-[10px] font-normal opacity-70">{m.variant}</span>}</span>
                          {m.pricing === "standin" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0 ml-2">Custom quote</span>}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setDs((d) => ({ ...d, step: 2 }))} disabled={!ds.masterId}
                      className="w-full text-sm font-medium text-white py-2.5 rounded-lg disabled:opacity-40" style={{ background: GREEN }}>
                      Continue
                    </button>
                  </>
                )}
              </>
            )}
            {embeddedStudioVisible && (
              <>
                {selMaster && (
                  <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-gray-50 text-gray-600">
                    <span className="font-medium text-gray-800">{selMaster.type}</span>{selMaster.variant ? ` · ${selMaster.variant}` : ""}
                    {pinnedBrandItem && <div className="text-[10px] text-gray-400 mt-0.5">Brand spec locked: {pinnedBrandItem.spec}</div>}
                  </div>
                )}
                {/* The real Design Studio, embedded. Params lock it to this sign
                    type; it posts the mockup + price back on "Attach to request"
                    (spec §8). Same-origin today, cross-origin in production —
                    the contract is identical either way. */}
                <iframe
                  key={ds.masterId}
                  title="Design Studio"
                  src={studioEmbedSrc(ds.masterId, ds.itemId ?? ds.addBid)}
                  className="w-full rounded-xl border border-gray-200"
                  style={{ height: "min(70vh, 720px)" }}
                />
                <div className="text-[10px] text-gray-400 mt-2">
                  Upload the brand logo, set the size, then Submit. Rendering takes
                  about 15 seconds; “Attach to request” returns it here.
                </div>
              </>
            )}
            {ds.step === 2 && !embeddedStudioVisible && (
              <>
                {selMaster && (
                  <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-gray-50 text-gray-600">
                    <span className="font-medium text-gray-800">{selMaster.type}</span>{selMaster.variant ? ` · ${selMaster.variant}` : ""}
                    {pinnedBrandItem && <div className="text-[10px] text-gray-400 mt-0.5">Brand spec locked: {pinnedBrandItem.spec}</div>}
                  </div>
                )}
                <div className="text-xs font-medium text-gray-700 mb-2">{fromItem ? "1" : "2"} · Your logo</div>
                <button onClick={() => setDs((d) => ({ ...d, logo: true }))}
                  className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-1.5 mb-3 ${ds.logo ? "" : "border-gray-300 hover:border-gray-400"}`}
                  style={ds.logo ? { borderColor: GREEN, background: GREEN_LIGHT } : {}}>
                  {ds.logo ? (
                    <>
                      <div className="flex items-center gap-1.5"><Leaf size={16} style={{ color: GREEN }} /><span className="text-sm font-bold" style={{ color: GREEN_DARK }}>{ds.brandText}</span></div>
                      <span className="text-[10px]" style={{ color: GREEN_DARK }}>logo.svg uploaded · click to replace</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} className="text-gray-400" />
                      <span className="text-xs text-gray-600 font-medium">Upload your logo (click to simulate)</span>
                      <span className="text-[10px] text-gray-400">SVG, PNG, or JPG</span>
                    </>
                  )}
                </button>
                <div className="text-[10px] text-gray-400 mb-1">Brand text on the sign</div>
                <input value={ds.brandText} onChange={(e) => setDs((d) => ({ ...d, brandText: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />
                <button onClick={generateMockup} disabled={!ds.logo || ds.generating}
                  className="w-full text-sm font-medium text-white py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: GREEN }}>
                  {ds.generating ? <><RefreshCw size={14} className="animate-spin" /> Rendering your sign…</> : <><Sparkles size={14} /> Generate instant mockup</>}
                </button>
                {ds.generating && (
                  // The real engine takes ~15s, not the 900ms this used to fake.
                  <div className="text-[10px] text-gray-400 text-center mt-2">
                    Photorealistic rendering usually takes about 15 seconds.
                  </div>
                )}
              </>
            )}
            {ds.step === 3 && selMaster && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-700">{selMaster.type} · instant mockup</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: GREEN_LIGHT, color: GREEN_DARK }}>
                    {ds.image ? `✓ Rendered · ${ds.engineSignType}` : "✓ Brand colors applied"}
                  </span>
                </div>
                <Mockup masterId={ds.masterId} brandText={ds.brandText || "Freshbites"} image={ds.image} />
                {fromAdd && pinnedBrandItem && (
                  <div className="flex items-center justify-between text-xs mt-2 px-1">
                    <span className="text-gray-600">{pinnedBrandItem.name}</span>
                    {/* A live quote from /sign-pricing wins over the static
                        catalog figure. ds.live.price is cost + margin — the raw
                        engine cost is never surfaced to a franchisee. */}
                    {ds.live?.price ? (
                      <span className="font-semibold" style={{ color: GREEN_DARK }}>{fmtPrice(ds.live.price)}</span>
                    ) : (
                      <span className="font-semibold" style={{ color: pinnedBrandItem.price ? GREEN_DARK : "#9CA3AF" }}>{pinnedBrandItem.price ? "from " + fmtPrice(pinnedBrandItem.price) : "Custom quote"}</span>
                    )}
                  </div>
                )}
                {ds.live && (
                  <div className="flex items-center justify-between text-[10px] mt-1.5 px-1">
                    <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: GREEN_LIGHT, color: GREEN_DARK }}>
                      ✓ Live quote · {ds.live.pricingSignType}
                    </span>
                    {ds.live.tatDays && <span className="text-gray-400">Lead time ~{ds.live.tatDays} days</span>}
                  </div>
                )}
                <div className="text-[10px] text-gray-400 mt-2 mb-4">Digital rendering for preview purposes only. Final product may vary in color and scale.{selMaster.pricing === "standin" && " This sign type is quoted manually by the Signage.com team."}{fromAdd && " Adding this sign requires corporate approval."}</div>
                <div className="flex gap-2">
                  <button onClick={() => setDs((d) => ({ ...d, step: 2 }))}
                    className="flex-1 text-sm font-medium text-gray-600 border border-gray-300 py-2.5 rounded-lg bg-white flex items-center justify-center gap-1.5">
                    <RefreshCw size={13} /> Regenerate
                  </button>
                  <button onClick={attachMockup}
                    className="flex-1 text-sm font-medium text-white py-2.5 rounded-lg flex items-center justify-center gap-1.5" style={{ background: GREEN }}>
                    <Check size={14} /> {fromAdd ? "Add to request" : fromItem ? "Attach to request" : "Looks great"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------------- FRANCHISEE ----------------
  const franchiseeView = () => {
    if (step === "home") return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your <span style={{ color: GREEN }}>Freshbites</span> locations</h1>
          <p className="text-gray-500 max-w-lg mx-auto">Each location keeps a record of its installed signage — brand specs stay locked, so replacements and additions take minutes.</p>
        </div>
        {locations.map((l) => {
          const openReqs = requests.filter((r) => r.locationId === l.id && r.status !== "completed");
          return (
            <div key={l.id} className="border border-gray-200 bg-white rounded-xl p-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-base font-semibold text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12} /> {l.address}</div>
                </div>
                <button onClick={() => { setActiveLoc(l.id); setIntent(null); setStep("intent"); }}
                  className="text-sm font-medium text-white px-4 py-2 rounded-lg flex items-center gap-1.5" style={{ background: GREEN }}>
                  <Plus size={14} /> Request signage
                </button>
              </div>
              {l.installedSigns.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {l.installedSigns.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-2">
                      <div className="w-14 shrink-0 rounded overflow-hidden border border-gray-200">
                        <Mockup masterId={bi(s.brandItemId).masterId} brandText="Freshbites" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-800 truncate">{bi(s.brandItemId).name}</div>
                        <div className="text-gray-400 truncate">{s.sizing} · installed {s.installed}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">Setup in progress — signs will appear here once installed.</div>
              )}
              {openReqs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {openReqs.map((r) => (
                    <button key={r.id} onClick={() => { setViewId(r.id); setStep("status"); }} className="w-full flex items-center justify-between py-1.5 text-sm hover:bg-gray-50 rounded px-2">
                      <span className="text-gray-600">{r.id} · {r.intent === "initial_setup" ? "Initial setup" : r.intent === "replace_like" ? "Replacement" : "New signs"} · {r.items.length} item(s)</span>
                      <RBadge s={r.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button onClick={() => { setStep("setup1"); setItems([]); setLoc({ name: "", address: "", format: null, openingDate: "", requesterName: "" }); }}
          className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm font-medium text-gray-500 hover:border-gray-400 flex items-center justify-center gap-2">
          <Store size={16} /> Set up a new location
        </button>
      </div>
    );

    if (step === "intent") {
      const l = locations.find((x) => x.id === activeLoc);
      return (
        <div className="max-w-2xl mx-auto">
          <NavBtn to="home">Back to locations</NavBtn>
          <h2 className="text-xl font-semibold text-gray-900 mt-4 mb-1">What does {l.name.split("— ")[1] || l.name} need?</h2>
          <p className="text-sm text-gray-500 mb-5">The approval path depends on what you're requesting — replacements of approved signs skip review entirely.</p>
          {INTENTS.map((it) => (
            <button key={it.id} disabled={!it.live}
              onClick={() => { setIntent(it.id); setStep(it.id === "replace_like" ? "replace" : "addpick"); }}
              className={`w-full flex items-center justify-between border rounded-xl px-4 py-3.5 mb-2.5 text-left bg-white ${it.live ? "border-gray-200 hover:border-gray-300" : "border-gray-100 opacity-50 cursor-not-allowed"}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_LIGHT }}>
                  <it.icon size={16} style={{ color: GREEN }} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{it.label} {!it.live && <span className="text-[10px] text-gray-400 font-normal">· coming in v1.1</span>}</div>
                  <div className="text-xs text-gray-500">{it.desc}</div>
                </div>
              </div>
              <div className="text-[11px] text-right shrink-0 ml-3" style={{ color: it.id === "replace_like" ? GREEN : "#92400E" }}>
                {it.id === "replace_like" && <Zap size={11} className="inline mr-0.5" />}{it.rule}
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (step === "replace") {
      const l = locations.find((x) => x.id === activeLoc);
      const selSign = l.installedSigns.find((s) => s.id === replaceSel);
      return (
        <div className="max-w-2xl mx-auto">
          <NavBtn to="intent">Back</NavBtn>
          <div className="flex items-center gap-2 mt-4 mb-1">
            <Zap size={16} style={{ color: GREEN }} />
            <h2 className="text-xl font-semibold text-gray-900">Replace like-for-like</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">Brand spec and your sizing are already on file from the original approval — no forms to refill, no corporate review.</p>
          <div className="text-xs font-medium text-gray-700 mb-2">1 · Which sign needs replacing?</div>
          {l.installedSigns.map((s) => (
            <button key={s.id} onClick={() => setReplaceSel(s.id)}
              className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 mb-2 text-left bg-white ${replaceSel === s.id ? "" : "border-gray-200 hover:border-gray-300"}`}
              style={replaceSel === s.id ? { borderColor: GREEN, boxShadow: `0 0 0 1px ${GREEN}` } : {}}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-20 shrink-0 rounded-md overflow-hidden border border-gray-100">
                  <Mockup masterId={bi(s.brandItemId).masterId} brandText="Freshbites" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{bi(s.brandItemId).name}</div>
                  <div className="text-xs text-gray-400 truncate">{biMaster(s.brandItemId).type} · {s.sizing} · installed {s.installed}</div>
                </div>
              </div>
              {replaceSel === s.id && <Check size={16} style={{ color: GREEN }} className="shrink-0 ml-2" />}
            </button>
          ))}
          {replaceSel && (
            <>
              <div className="text-xs font-medium text-gray-700 mb-2 mt-4">2 · What happened to it?</div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {["Damaged", "Faded / worn", "Vandalized"].map((r) => (
                  <button key={r} onClick={() => setReplaceReason(r)}
                    className={`border rounded-lg py-2 text-sm bg-white ${replaceReason === r ? "font-medium" : "border-gray-200 text-gray-600"}`}
                    style={replaceReason === r ? { borderColor: GREEN, background: GREEN_LIGHT, color: GREEN_DARK } : {}}>
                    {r}
                  </button>
                ))}
              </div>
              <button onClick={() => setReplacePhoto(true)}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-xs text-gray-500 hover:border-gray-400 mb-4">
                <Upload size={13} className="inline mr-1" /> {replacePhoto ? "current-condition.jpg uploaded" : "Optional: photo of current condition (click to simulate)"}
              </button>
            </>
          )}
          {replaceSel && replaceReason && (
            <div className="border rounded-xl p-4 mb-4" style={{ borderColor: GREEN, background: GREEN_LIGHT }}>
              <div className="text-sm font-medium mb-1" style={{ color: GREEN_DARK }}>Ready to submit — pre-approved</div>
              <div className="text-xs" style={{ color: GREEN_DARK }}>
                Replacing your {bi(selSign.brandItemId).name} ({selSign.sizing}) like-for-like against the locked brand spec: {bi(selSign.brandItemId).spec}. Skips corporate review, straight to quote preparation.
                {BRAND_CONFIG.external
                  ? <span className="block mt-1 font-semibold">Will be sent to {BRAND_CONFIG.vendorLabel} for pricing per Freshbites vendor policy{bi(selSign.brandItemId).price ? ` · Signage.com reference estimate ${fmtPrice(bi(selSign.brandItemId).price)}` : ""}</span>
                  : bi(selSign.brandItemId).price && <span className="block mt-1 font-semibold">Estimated: {fmtPrice(bi(selSign.brandItemId).price)} · via {BRAND_CONFIG.vendorLabel} · TAT {BRAND_CONFIG.tat}</span>}
              </div>
            </div>
          )}
          <button onClick={submitReplace} disabled={!replaceSel || !replaceReason}
            className="w-full text-sm font-medium text-white py-3 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: GREEN }}>
            Submit replacement request <Send size={15} />
          </button>
        </div>
      );
    }

    if (step === "addpick") {
      const l = locations.find((x) => x.id === activeLoc);
      const installedIds = l.installedSigns.map((s) => s.brandItemId);
      return (
        <div className="max-w-2xl mx-auto">
          <NavBtn to="intent">Back</NavBtn>
          <h2 className="text-xl font-semibold text-gray-900 mt-4 mb-1">Add signs to {l.name.split("— ")[1] || l.name}</h2>
          <p className="text-sm text-gray-500 mb-5">From the approved Freshbites catalog — every item carries a locked brand spec. New additions need corporate approval.</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {BRAND_ITEMS.map((b) => {
              const added = addonSel.includes(b.id);
              const has = installedIds.includes(b.id);
              return (
                <div key={b.id} className={`border rounded-xl p-3 bg-white ${added ? "" : "border-gray-200"}`}
                  style={added ? { borderColor: GREEN, boxShadow: `0 0 0 1px ${GREEN}` } : {}}>
                  <div className="rounded-lg mb-2 overflow-hidden border border-gray-100">
                    <Mockup masterId={b.masterId} brandText="Freshbites" />
                  </div>
                  <BrandCard bid={b.id} />
                  <div className="flex items-center justify-between mt-2">
                    {added ? (
                      <button onClick={() => { setAddonSel(addonSel.filter((x) => x !== b.id)); setAddonMockups((m) => { const n = { ...m }; delete n[b.id]; return n; }); }} className="text-[11px] font-medium text-gray-500 flex items-center gap-1"><X size={11} /> Remove</button>
                    ) : (
                      <button onClick={() => setAddonSel([...addonSel, b.id])} className="text-[11px] font-medium flex items-center gap-1" style={{ color: GREEN }}>
                        <Plus size={11} /> Add · needs approval
                      </button>
                    )}
                    <div className="flex items-center gap-1">
                      {has && <span className="text-[9px] text-gray-400">installed</span>}
                      <VendorChip bid={b.id} />
                      <PricingTag masterId={b.masterId} />
                    </div>
                  </div>
                  <button onClick={() => openStudioForAdd(b.id, "addpick")}
                    className="w-full mt-2 rounded-lg py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium border"
                    style={{ background: added && addonMockups[b.id] ? GREEN_LIGHT : "#FFFFFF", borderColor: GREEN, color: GREEN_DARK }}>
                    {added && addonMockups[b.id]
                      ? <><Check size={12} style={{ color: GREEN }} /> Your mockup attached · edit in Studio</>
                      : <><Sparkles size={12} style={{ color: GREEN }} /> Design & add in Studio</>}
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={submitAddons} disabled={addonSel.length === 0}
            className="w-full text-sm font-medium text-white py-3 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: GREEN }}>
            Submit {addonSel.length || ""} sign request{addonSel.length !== 1 ? "s" : ""} for approval <Send size={15} />
          </button>
        </div>
      );
    }

    if (step === "setup1") return (
      <div className="max-w-2xl mx-auto">
        <NavBtn to="home">Back to locations</NavBtn>
        <div className="text-xs font-medium tracking-wide mb-1 mt-4" style={{ color: GREEN }}>NEW LOCATION · STEP 1 OF 4</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Tell us about your location</h2>
        <p className="text-sm text-gray-500 mb-6">Your location format determines which standard sign package loads.</p>
        {[["Location name", "name", "Freshbites — Riverside"], ["Address", "address", "123 Main St, City, State"], ["Your name", "requesterName", "Full name"], ["Target opening date", "openingDate", "e.g. Oct 1, 2026"]].map(([label, key, ph]) => (
          <div key={key} className="mb-4">
            <label className="text-xs font-medium text-gray-700 block mb-1">{label}</label>
            <input value={loc[key]} onChange={(e) => setLoc({ ...loc, [key]: e.target.value })} placeholder={ph}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
        ))}
        <label className="text-xs font-medium text-gray-700 block mb-2">Location format</label>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {FORMATS.map((f) => (
            <button key={f.id} onClick={() => { setLoc({ ...loc, format: f.id }); loadPackage(f.id); }}
              className={`text-left border rounded-xl p-4 bg-white ${loc.format === f.id ? "" : "border-gray-200 hover:border-gray-300"}`}
              style={loc.format === f.id ? { boxShadow: `0 0 0 2px ${GREEN}`, borderColor: GREEN } : {}}>
              <Store size={18} style={{ color: loc.format === f.id ? GREEN : "#9CA3AF" }} className="mb-2" />
              <div className="text-sm font-medium text-gray-900">{f.label}</div>
              <div className="text-[11px] text-gray-500">{f.desc}</div>
              <div className="text-[11px] mt-1.5 font-medium" style={{ color: GREEN }}>{f.pkg.length}-sign standard package</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={() => setStep("setup2")} disabled={!loc.format}
            className="flex items-center gap-2 text-sm font-medium text-white px-6 py-2.5 rounded-lg disabled:opacity-40" style={{ background: GREEN }}>
            Load my sign package <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );

    if (step === "setup2") {
      const standardItems = items.filter((i) => i.origin !== "addon");
      const done = standardItems.filter((i) => i.photo || i.sizing || i.tbd).length;
      return (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs font-medium tracking-wide mb-1" style={{ color: GREEN }}>NEW LOCATION · STEP 2 OF 4</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Your location requires these {standardItems.length} signs</h2>
          <p className="text-sm text-gray-500 mb-5">Pre-approved for {FORMATS.find((f) => f.id === loc.format)?.label.toLowerCase()} locations — brand specs are locked, you only provide site details.</p>
          {standardItems.map((it) => {
            const b = bi(it.brandItemId);
            const m = master(b.masterId);
            const open = openItem === it.id;
            const configured = it.photo || it.sizing || it.tbd;
            return (
              <div key={it.id} className={`border rounded-xl bg-white mb-3 ${it.origin === "exception" ? "border-rose-200" : "border-gray-200"}`}>
                <button onClick={() => setOpenItem(open ? null : it.id)} className="w-full flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${configured ? "" : "border border-gray-300"}`} style={configured ? { background: GREEN_LIGHT } : {}}>
                      {configured && <Check size={13} style={{ color: GREEN }} />}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-2">{b.name} <OriginTag o={it.origin} /><VendorChip bid={b.id} /><PricingTag masterId={b.masterId} /></div>
                      <div className="text-[11px] text-gray-400">{m.type}{m.variant ? ` · ${m.variant}` : ""}{it.origin === "exception" && <span className="text-rose-500"> · issue flagged</span>}</div>
                      <div className="text-[10px] text-gray-400">{b.spec}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className={`text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <div className="rounded-lg overflow-hidden border border-gray-100 mb-3">
                      <Mockup masterId={b.masterId} brandText="Freshbites" />
                    </div>
                    <button onClick={() => patchItem(it.id, { photo: true })}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 flex items-center justify-center gap-2 text-sm text-gray-600 hover:border-gray-400 mb-3">
                      <Upload size={15} /> {it.photo ? "photo-1.jpg uploaded" : "Upload placement photo (click to simulate)"}
                    </button>
                    <button onClick={() => openStudio(b.masterId, it.id)}
                      className="w-full rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm font-medium mb-3 border"
                      style={{ background: it.mockup ? GREEN_LIGHT : "#FFFFFF", borderColor: GREEN, color: GREEN_DARK }}>
                      {it.mockup ? <><Check size={14} style={{ color: GREEN }} /> Mockup attached · open Design Studio</> : <><Sparkles size={14} style={{ color: GREEN }} /> Instant mockup in Design Studio</>}
                    </button>
                    <div className="text-[10px] text-gray-400 mb-1">Site details — {b.siteVars}</div>
                    <div className="flex items-center gap-2 mb-3">
                      <input value={it.tbd ? "" : it.sizing} disabled={it.tbd} onChange={(e) => patchItem(it.id, { sizing: e.target.value })}
                        placeholder="Sizing / site notes" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 bg-white" />
                      <button onClick={() => patchItem(it.id, { tbd: !it.tbd })}
                        className={`text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap ${it.tbd ? "font-medium" : "text-gray-400 border-gray-200"}`}
                        style={it.tbd ? { color: GREEN_DARK, borderColor: GREEN, background: GREEN_LIGHT } : {}}>
                        Not sure / TBD
                      </button>
                    </div>
                    {it.origin === "standard" ? (
                      flagging === it.id ? (
                        <div className="border border-rose-200 bg-rose-50 rounded-lg p-3">
                          <div className="text-xs font-medium text-rose-800 mb-1">What's the issue with this standard sign?</div>
                          <textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} rows={2}
                            placeholder="e.g. Landlord prohibits illuminated signage" className="w-full border border-rose-200 rounded-lg px-2 py-1.5 text-xs mb-2" />
                          <div className="flex gap-2">
                            <button onClick={() => flagIssue(it.id)} disabled={!flagNote.trim()}
                              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-40 bg-rose-600">Flag for corporate review</button>
                            <button onClick={() => { setFlagging(null); setFlagNote(""); }} className="text-xs text-gray-500 px-2">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setFlagging(it.id)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-rose-600">
                          <Flag size={12} /> This standard sign won't work at my site
                        </button>
                      )
                    ) : (
                      <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">Issue: "{it.issue}" — corporate will review this item.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep("setup1")} className="flex items-center gap-1 text-sm text-gray-600 px-4 py-2"><ChevronLeft size={16} /> Back</button>
            <button onClick={() => setStep("setup3")} className="flex items-center gap-2 text-sm font-medium text-white px-6 py-2.5 rounded-lg" style={{ background: GREEN }}>
              Continue · {done}/{standardItems.length} configured <ChevronRight size={16} />
            </button>
          </div>
        </div>
      );
    }

    if (step === "setup3") {
      const addons = items.filter((i) => i.origin === "addon");
      const inPkg = items.filter((i) => i.origin !== "addon").map((i) => i.brandItemId);
      const available = BRAND_ITEMS.filter((b) => !inPkg.includes(b.id));
      return (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs font-medium tracking-wide mb-1" style={{ color: GREEN }}>NEW LOCATION · STEP 3 OF 4</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Anything beyond the standard package?</h2>
          <p className="text-sm text-gray-500 mb-5">Optional items from the approved Freshbites catalog. Add-ons require corporate approval before quoting.</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {available.map((b) => {
              const added = addons.some((a) => a.brandItemId === b.id);
              return (
                <div key={b.id} className={`border rounded-xl p-3 bg-white ${added ? "" : "border-gray-200"}`}
                  style={added ? { borderColor: GREEN, boxShadow: `0 0 0 1px ${GREEN}` } : {}}>
                  <div className="rounded-lg mb-2 overflow-hidden border border-gray-100">
                    <Mockup masterId={b.masterId} brandText="Freshbites" />
                  </div>
                  <BrandCard bid={b.id} />
                  <div className="flex items-center justify-between mt-2">
                    {added ? (
                      <button onClick={() => setItems((xs) => xs.filter((x) => !(x.origin === "addon" && x.brandItemId === b.id)))}
                        className="text-[11px] font-medium text-gray-500 flex items-center gap-1"><X size={11} /> Remove</button>
                    ) : (
                      <button onClick={() => setItems((xs) => [...xs, { id: ++itemCounter, brandItemId: b.id, origin: "addon", status: "pending_review", photo: false, sizing: "", tbd: false, issue: null }])}
                        className="text-[11px] font-medium flex items-center gap-1" style={{ color: GREEN }}>
                        <Plus size={11} /> Add · needs approval
                      </button>
                    )}
                    <span className="flex items-center gap-1"><VendorChip bid={b.id} /><PricingTag masterId={b.masterId} /></span>
                  </div>
                  <button onClick={() => openStudioForAdd(b.id, "setup3")}
                    className="w-full mt-2 rounded-lg py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium border"
                    style={{ background: added && items.some((x) => x.origin === "addon" && x.brandItemId === b.id && x.mockup) ? GREEN_LIGHT : "#FFFFFF", borderColor: GREEN, color: GREEN_DARK }}>
                    {added && items.some((x) => x.origin === "addon" && x.brandItemId === b.id && x.mockup)
                      ? <><Check size={12} style={{ color: GREEN }} /> Your mockup attached · edit in Studio</>
                      : <><Sparkles size={12} style={{ color: GREEN }} /> Design & add in Studio</>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep("setup2")} className="flex items-center gap-1 text-sm text-gray-600 px-4 py-2"><ChevronLeft size={16} /> Back</button>
            <button onClick={() => setStep("setup4")} className="flex items-center gap-2 text-sm font-medium text-white px-6 py-2.5 rounded-lg" style={{ background: GREEN }}>
              {addons.length ? "Continue" : "No add-ons needed"} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      );
    }

    if (step === "setup4") {
      const auto = items.filter((i) => i.status === "auto_approved");
      const pending = items.filter((i) => i.status === "pending_review");
      return (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs font-medium tracking-wide mb-1" style={{ color: GREEN }}>NEW LOCATION · STEP 4 OF 4</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">{loc.name || "Your location"} · {items.length} signs</h2>
          <p className="text-sm text-gray-500 mb-5">Opens {loc.openingDate || "TBD"} · {FORMATS.find((f) => f.id === loc.format)?.label}</p>
          <div className="border border-gray-200 rounded-xl bg-white p-4 mb-3">
            <div className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
              <ShieldCheck size={15} style={{ color: GREEN }} /> Proceeding immediately ({auto.length})
            </div>
            {auto.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700 flex items-center gap-2">{bi(it.brandItemId).name} <OriginTag o={it.origin} /><VendorChip bid={it.brandItemId} /></span>
                <span className="text-xs text-gray-400">{it.tbd ? "TBD flagged" : it.sizing || (it.photo ? "photo attached" : "—")}</span>
              </div>
            ))}
          </div>
          {pending.length > 0 && (
            <div className="border border-amber-200 rounded-xl bg-white p-4 mb-3">
              <div className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                <Clock size={15} className="text-amber-600" /> Going to corporate for approval ({pending.length})
              </div>
              {pending.map((it) => (
                <div key={it.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-700 flex items-center gap-2">{bi(it.brandItemId).name} <OriginTag o={it.origin} /><VendorChip bid={it.brandItemId} /></span>
                  {it.issue && <span className="text-xs text-rose-500 truncate max-w-[200px]">"{it.issue}"</span>}
                </div>
              ))}
            </div>
          )}
          {(() => {
            const priced = items.filter((i) => bi(i.brandItemId).price != null);
            const manual = items.filter((i) => bi(i.brandItemId).price == null);
            const total = priced.reduce((s, i) => s + bi(i.brandItemId).price, 0);
            return (
              <div className="border border-gray-200 rounded-xl bg-white p-4 mb-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">Estimated total ({priced.length} priced item{priced.length !== 1 ? "s" : ""})</span>
                  <span className="font-semibold" style={{ color: GREEN_DARK }}>{fmtPrice(total)}</span>
                </div>
                {manual.length > 0 && (
                  <div className="text-[11px] text-gray-400 mt-1">+ {manual.length} custom-quote item{manual.length !== 1 ? "s" : ""} priced by the Signage.com team after submission</div>
                )}
                <div className="text-[10px] text-gray-400 mt-1">{BRAND_CONFIG.external
                  ? `Per Freshbites vendor policy, approved items route to ${BRAND_CONFIG.vendorLabel}${BRAND_CONFIG.corporateCc ? " (corporate copied)" : ""} — they provide final pricing directly. Figures shown are Signage.com reference estimates.`
                  : `Estimates from standard brand specs; final quote follows approval. Per Freshbites vendor policy, approved items route to ${BRAND_CONFIG.vendorLabel}${BRAND_CONFIG.corporateCc ? " (corporate copied)" : ""}.`}</div>
              </div>
            );
          })()}
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep("setup3")} className="flex items-center gap-1 text-sm text-gray-600 px-4 py-2"><ChevronLeft size={16} /> Back</button>
            <button onClick={submitSetup} className="flex items-center gap-2 text-sm font-medium text-white px-6 py-2.5 rounded-lg" style={{ background: GREEN }}>
              Submit location request <Send size={15} />
            </button>
          </div>
        </div>
      );
    }

    const req = requests.find((r) => r.id === viewId);
    if (!req) { setStep("home"); return null; }
    const l = locations.find((x) => x.id === req.locationId);
    return (
      <div className="max-w-2xl mx-auto">
        <NavBtn to="home">Back to locations</NavBtn>
        <div className="flex items-center justify-between mt-4 mb-1">
          <div>
            <div className="text-xs text-gray-400">{req.id} · {l?.name}</div>
            <h2 className="text-xl font-semibold text-gray-900">
              {req.intent === "initial_setup" ? "Initial signage setup" : req.intent === "replace_like" ? "Like-for-like replacement" : "New sign request"}
            </h2>
          </div>
          <RBadge s={req.status} />
        </div>
        <div className="border border-gray-200 rounded-xl bg-white p-4 my-4">
          {req.items.map((it) => (
            <div key={it.id} className="py-2 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 flex items-center gap-2">
                {bi(it.brandItemId).name} <OriginTag o={it.origin} />
                {it.reason && <span className="text-[10px] text-gray-400">({it.reason})</span>}
              </div>
              <div className="flex items-center gap-2">
                {it.reviewNote && <span className="text-[10px] text-gray-400 max-w-[140px] truncate">"{it.reviewNote}"</span>}
                <VendorChip bid={it.brandItemId} />
                <span className="text-[11px] font-medium" style={{ color: bi(it.brandItemId).price ? GREEN_DARK : "#9CA3AF" }}>{bi(it.brandItemId).price ? fmtPrice(bi(it.brandItemId).price) : "custom"}</span>
                <IBadge s={it.status} />
              </div>
            </div>
            {it.status === "changes_requested" && (
              <div className="mt-2 border border-rose-200 bg-rose-50 rounded-lg p-2.5">
                <div className="text-xs text-rose-800"><span className="font-medium">Corporate requested changes:</span> "{it.reviewNote}"</div>
                <button onClick={() => resubmitItem(req.id, it.id)}
                  className="mt-2 text-xs font-medium text-white px-3 py-1.5 rounded-lg" style={{ background: GREEN }}>
                  Update & resubmit this item (demo)
                </button>
              </div>
            )}
            </div>
          ))}
        </div>
        {reqQuotes(req).length > 0 && (() => {
          const qs = reqQuotes(req);
          const anyInternal = qs.some((q) => !q.external);
          return (
            <div className="border rounded-xl p-4 mb-4" style={{ borderColor: GREEN, background: GREEN_LIGHT }}>
              <div className="text-sm font-medium mb-1 flex items-center gap-2" style={{ color: GREEN_DARK }}>
                <Send size={14} /> {qs.length > 1 ? `Your signs are with ${qs.length} fulfillment partners` : qs[0].external ? `Quote requested from ${qs[0].recipient}` : req.status === "sent_for_quote" ? `Quote in progress with ${qs[0].recipient}` : req.status === "quote_ready" ? "Your quote is ready" : `Order with ${qs[0].recipient}`}
              </div>
              {qs.map((q, i) => (
                <div key={i} className={`text-xs ${i > 0 ? "mt-2 pt-2 border-t border-green-200" : ""}`} style={{ color: GREEN_DARK }}>
                  {qs.length > 1 && <div className="font-medium">{q.recipient}: {q.itemNames ? q.itemNames.join(", ") : `${q.pricedCount + q.manualCount} item(s)`}</div>}
                  {q.external ? (
                    <>Sent to {q.recipient} per Freshbites vendor policy — they'll contact you directly with pricing{q.cc ? "; corporate copied" : ""}.</>
                  ) : (
                    <>{q.pricedCount} item(s) at <span className="font-semibold">{fmtPrice(q.total)}</span>{q.manualCount ? ` · ${q.manualCount} item(s) ${req.status === "sent_for_quote" ? "being priced by the Signage.com team" : "priced separately"}` : ""} · TAT {q.tat}{q.cc ? " · corporate copied" : ""}</>
                  )}
                </div>
              ))}
              {req.status === "quote_ready" && anyInternal && (
                <button onClick={() => updateReq(req.id, { status: "accepted" }, { e: "Quote accepted by franchisee", a: "Franchisee" })}
                  className="mt-3 w-full text-sm font-medium text-white py-2.5 rounded-lg flex items-center justify-center gap-2" style={{ background: GREEN }}>
                  <Check size={15} /> Accept quote · {fmtPrice(qs.filter((q) => !q.external).reduce((s, q) => s + q.total, 0))}{qs.some((q) => !q.external && q.manualCount) ? " + custom items" : ""}
                </button>
              )}
              {["accepted", "completed"].includes(req.status) && !anyInternal && (
                <div className="text-xs mt-2 font-medium" style={{ color: GREEN_DARK }}>Ordered with vendor — tracked by the Signage.com team.</div>
              )}
              {anyInternal && ["accepted", "in_production", "shipped", "completed"].includes(req.status) && (
                <div className="flex items-center gap-1 mt-3">
                  {["Accepted", "In production", "Shipped", "Installed"].map((s, i) => {
                    const idx = ["accepted", "in_production", "shipped", "completed"].indexOf(req.status);
                    const on = i <= idx;
                    return (
                      <div key={s} className="flex-1">
                        <div className="h-1.5 rounded-full" style={{ background: on ? GREEN : "#D1D5DB" }} />
                        <div className="text-[9px] mt-1 text-center" style={{ color: on ? GREEN_DARK : "#9CA3AF" }}>{s}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        <div className="border border-gray-200 rounded-xl bg-white p-4 mb-4">
          <div className="text-sm font-medium text-gray-900 mb-3">Timeline</div>
          {req.events.map((ev, i) => (
            <div key={i} className="flex gap-3 mb-3 last:mb-0">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_LIGHT }}>
                <Check size={12} style={{ color: GREEN }} />
              </div>
              <div>
                <div className="text-sm text-gray-900">{ev.e}</div>
                <div className="text-xs text-gray-400">{ev.t} · {ev.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---------------- TEAM ----------------
  const teamView = () => {
    const sel = requests.find((r) => r.id === queueSel);
    if (sel) {
      const l = locations.find((x) => x.id === sel.locationId);
      const pending = sel.items.filter((i) => i.status === "pending_review");
      const approvedItems = sel.items.filter((i) => i.status === "approved" || i.status === "auto_approved");
      const manualQuote = sel.items.filter((i) => (i.status === "approved" || i.status === "auto_approved") && biMaster(i.brandItemId).pricing === "standin");
      const selQuotes = reqQuotes(sel);
      const allExternal = selQuotes.length > 0 && selQuotes.every((q) => q.external);
      const internalQs = selQuotes.filter((q) => !q.external);
      const internalTotal = internalQs.reduce((s, q) => s + q.total, 0);
      const internalManual = internalQs.reduce((s, q) => s + q.manualCount, 0);
      const externalNames = selQuotes.filter((q) => q.external).map((q) => q.recipient).join(", ");
      return (
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setQueueSel(null)} className="text-sm text-gray-500 mb-4 flex items-center gap-1"><ChevronLeft size={14} /> Back to queue</button>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-gray-400">{sel.id} · {sel.intent === "initial_setup" ? "Initial setup" : sel.intent === "replace_like" ? "Like-for-like replacement" : "Add signs"}</div>
              <h2 className="text-lg font-semibold text-gray-900">{l?.name}</h2>
              <div className="text-sm text-gray-500 flex items-center gap-2"><MapPin size={13} /> {l?.address}</div>
            </div>
            <RBadge s={sel.status} />
          </div>
          {sel.intent === "replace_like" && (
            <div className="text-xs rounded-lg px-3 py-2.5 mb-4 flex items-start gap-2" style={{ background: GREEN_LIGHT, color: GREEN_DARK }}>
              <Zap size={13} className="mt-0.5 shrink-0" style={{ color: GREEN }} />
              <span>Fast lane: pinned brand spec + sizing pulled from the installed-sign record. No corporate review — prepare and route directly.</span>
            </div>
          )}
          {manualQuote.length > 0 && (
            <div className="text-xs rounded-lg px-3 py-2.5 mb-4 flex items-start gap-2 bg-gray-50 text-gray-600 border border-gray-200">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{manualQuote.length} item(s) use stand-in pricing — quote manually: {manualQuote.map((i) => bi(i.brandItemId).name).join(", ")}</span>
            </div>
          )}
          <div className="border border-gray-200 rounded-xl bg-white p-4 mb-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Line items ({sel.items.length})</div>
            {sel.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="text-sm text-gray-700 flex items-center gap-2 min-w-0">
                  <span className="truncate">{bi(it.brandItemId).name}</span> <OriginTag o={it.origin} /><VendorChip bid={it.brandItemId} /><PricingTag masterId={bi(it.brandItemId).masterId} />
                  {it.reason && <span className="text-[10px] text-gray-400 shrink-0">({it.reason})</span>}
                  {it.tbd && <span className="text-[10px] text-amber-600 font-medium shrink-0">TBD</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-medium" style={{ color: bi(it.brandItemId).price ? GREEN_DARK : "#9CA3AF" }}>{bi(it.brandItemId).price ? fmtPrice(bi(it.brandItemId).price) : "manual"}</span>
                  <IBadge s={it.status} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100 text-xs">
              <span className="text-gray-500">Default vendor: <span className="font-medium text-gray-700">{BRAND_CONFIG.vendorLabel}</span> · per-item overrides apply (chips above){BRAND_CONFIG.corporateCc ? " · corporate copied" : ""}</span>
              <span className="font-semibold" style={{ color: GREEN_DARK }}>{fmtPrice(sel.items.filter((i) => bi(i.brandItemId).price != null).reduce((s, i) => s + bi(i.brandItemId).price, 0))} est.</span>
            </div>
          </div>
          {selQuotes.length > 0 && (
            <div className="border rounded-xl p-4 mb-4" style={{ borderColor: GREEN, background: GREEN_LIGHT }}>
              <div className="text-sm font-medium mb-1 flex items-center gap-2" style={{ color: GREEN_DARK }}><Send size={14} /> Quote package(s) sent · {selQuotes.length}</div>
              {selQuotes.map((q, i) => (
                <div key={i} className={`text-xs ${i > 0 ? "mt-2 pt-2 border-t border-green-200" : ""}`} style={{ color: GREEN_DARK }}>
                  <span className="font-medium">{q.recipient}</span> &lt;{q.email}&gt;{q.cc ? <> · cc {q.cc}</> : null}{q.external ? " · off-platform fulfillment" : ""}
                  <div className="mt-0.5">{q.itemNames ? q.itemNames.join(", ") : `${q.pricedCount + q.manualCount} item(s)`} — {q.pricedCount ? <><span className="font-semibold">{fmtPrice(q.total)}</span></> : "manual pricing"}{q.manualCount && q.pricedCount ? ` + ${q.manualCount} manual-priced` : ""} · TAT {q.tat}</div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {sel.status === "submitted" && (
              <button onClick={() => {
                const ev = pending.length
                  ? { e: `Package prepared · ${sel.items.length - pending.length} auto-approved, ${pending.length} sent for review`, a: "Signage.com team" }
                  : { e: "Package prepared · no review needed", a: "Signage.com team" };
                updateReq(sel.id, { status: pending.length ? "needs_review" : "approved" }, ev);
                if (pending.length) updateReq(sel.id, {}, { e: "Approval email sent to corporate reviewer", a: "System" });
              }} className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <FileText size={15} /> Prepare package {pending.length ? `· ${pending.length} need review` : "· no review needed"}
              </button>
            )}
            {sel.status === "approved" && approvedItems.length === 0 && (
              <div className="text-sm text-gray-500 flex items-center justify-center gap-2 py-2"><AlertCircle size={15} /> All items were declined — nothing to route. Advise franchisee or close.</div>
            )}
            {sel.status === "approved" && approvedItems.length > 0 && (
              <button onClick={() => {
                const qs = buildQuotes(sel.items);
                updateReq(sel.id, { status: "sent_for_quote", quotes: qs },
                  { e: `Quote package(s) emailed: ${qs.map((q) => `${q.recipient} <${q.email}> — ${q.itemCount} item(s)${q.pricedCount ? ` ${fmtPrice(q.total)}` : ""}${q.manualCount ? ` + ${q.manualCount} manual-priced` : ""}`).join(" · ")}${qs.some((q) => q.cc) ? " · corporate copied" : ""}`, a: "System" });
              }}
                className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <Send size={15} /> Route {approvedItems.length} item(s) · {[...new Set(approvedItems.map((i) => resolveVendor(i.brandItemId).vendorLabel))].join(" + ")}
              </button>
            )}
            {sel.status === "sent_for_quote" && !allExternal && (
              <button onClick={() => updateReq(sel.id, { status: "quote_ready" }, { e: `Quote delivered to franchisee — ${fmtPrice(internalTotal)}${internalManual ? ` + ${internalManual} custom item(s)` : ""}${externalNames ? ` (external package(s) with ${externalNames} quoted separately)` : ""}`, a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <FileText size={15} /> Mark quote delivered to franchisee
              </button>
            )}
            {sel.status === "sent_for_quote" && allExternal && (
              <button onClick={() => updateReq(sel.id, { status: "quote_ready" }, { e: `Logged: ${externalNames} quoted the franchisee directly (off-platform)`, a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg bg-white">
                <FileText size={15} /> Log: vendor has quoted (off-platform)
              </button>
            )}
            {sel.status === "quote_ready" && !allExternal && (
              <div className="text-sm text-gray-500 flex items-center justify-center gap-2 py-2"><Clock size={15} /> Waiting on franchisee to accept the quote</div>
            )}
            {sel.status === "quote_ready" && allExternal && (
              <button onClick={() => updateReq(sel.id, { status: "accepted" }, { e: `Logged: franchisee ordered with ${externalNames} (off-platform)`, a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg bg-white">
                <Check size={15} /> Log: franchisee ordered with vendor
              </button>
            )}
            {sel.status === "accepted" && !allExternal && (
              <button onClick={() => updateReq(sel.id, { status: "in_production" }, { e: "Production started", a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <Wrench size={15} /> Start production
              </button>
            )}
            {sel.status === "accepted" && allExternal && (
              <button onClick={() => markCompleted(sel.id)}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg bg-white">
                <Check size={15} /> Mark installed · writes signs to location record
              </button>
            )}
            {sel.status === "in_production" && (
              <button onClick={() => updateReq(sel.id, { status: "shipped" }, { e: "Order shipped to location", a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <Send size={15} /> Mark shipped
              </button>
            )}
            {sel.status === "in_production" && (
              <button onClick={() => updateReq(sel.id, { status: "shipped" }, { e: "Order shipped to location", a: "Signage.com team" })}
                className="flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-lg" style={{ background: GREEN }}>
                <Send size={15} /> Mark shipped
              </button>
            )}
            {sel.status === "shipped" && (
              <button onClick={() => markCompleted(sel.id)}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg bg-white">
                <Check size={15} /> Mark installed · writes signs to location record
              </button>
            )}
            {sel.status === "needs_review" && (
              <div className="text-sm text-gray-500 flex items-center justify-center gap-2 py-2"><Clock size={15} /> Waiting on corporate review</div>
            )}
            {sel.status === "changes_requested" && (
              <div className="text-sm text-gray-500 flex items-center justify-center gap-2 py-2"><Clock size={15} /> Waiting on franchisee to update & resubmit changed item(s)</div>
            )}
            {sel.status === "completed" && (
              <div className="text-sm flex items-center justify-center gap-2 py-2" style={{ color: GREEN_DARK }}><Check size={15} /> Installed — location record updated</div>
            )}
          </div>
          <div className="border border-gray-200 rounded-xl bg-white p-4 mt-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Timeline</div>
            {sel.events.map((ev, i) => (
              <div key={i} className="text-xs mb-2"><span className="text-gray-900">{ev.e}</span><div className="text-gray-400">{ev.t} · {ev.a}</div></div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-1"><Inbox size={18} className="text-gray-400" /><h2 className="text-lg font-semibold text-gray-900">Request queue</h2></div>
        <p className="text-sm text-gray-500 mb-3">All requests across locations. Replacements arrive pre-approved and ready to route.</p>
        <div className="flex items-center justify-between border border-gray-200 bg-white rounded-xl px-4 py-2.5 mb-4">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">Freshbites vendor policy</span> <span className="text-gray-400">(set at white-glove setup — toggle to simulate)</span>
            <div className="text-[10px] text-gray-400 mt-0.5">Routes to {BRAND_CONFIG.vendorLabel}{BRAND_CONFIG.external ? " · quoting & fulfillment happen off-platform, tracked manually" : " · full quote-to-installed tracking in portal"}</div>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
            {Object.values(VENDOR_PRESETS).map((p) => (
              <button key={p.vendorPolicy} onClick={() => setVendorPolicy(p.vendorPolicy)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md ${vendorPolicy === p.vendorPolicy ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                {p.policyLabel}
              </button>
            ))}
          </div>
        </div>
        {requests.length === 0 && (
          <div className="text-sm text-gray-400 text-center border border-dashed border-gray-200 rounded-xl py-10">
            No open requests. Submit one as the franchisee — try a like-for-like replacement on Oak Plaza to see the fast lane.
          </div>
        )}
        {requests.map((r) => {
          const l = locations.find((x) => x.id === r.locationId);
          const pend = r.items.filter((i) => i.status === "pending_review").length;
          return (
            <button key={r.id} onClick={() => setQueueSel(r.id)}
              className="w-full flex items-center justify-between border border-gray-200 bg-white rounded-xl px-4 py-3 mb-2 hover:border-gray-300 text-left">
              <div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  {l?.name} <span className="text-gray-400 font-normal">· {r.id}</span>
                  {r.intent === "replace_like" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: GREEN_LIGHT, color: GREEN_DARK }}><Zap size={9} /> Fast lane</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {r.intent === "initial_setup" ? "Initial setup" : r.intent === "replace_like" ? "Like-for-like replacement" : "Add signs"} · {r.items.length} item(s)
                  {pend > 0 && <span className="text-amber-600"> · {pend} awaiting approval</span>}
                </div>
              </div>
              <RBadge s={r.status} />
            </button>
          );
        })}
      </div>
    );
  };

  // ---------------- REVIEWER ----------------
  const reviewerView = () => {
    const withPending = requests.filter((r) => r.status === "needs_review" && r.items.some((i) => i.status === "pending_review"));
    if (withPending.length === 0) return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: GREEN_LIGHT }}>
          <Check size={22} style={{ color: GREEN }} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Nothing awaiting your decision</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Standard packages and like-for-like replacements never reach you. You only see add-ons, exceptions, and modifications. Try adding a new sign to Oak Plaza as the franchisee.</p>
      </div>
    );
    const r = withPending[0];
    const l = locations.find((x) => x.id === r.locationId);
    const auto = r.items.filter((i) => i.status === "auto_approved").length;
    const pending = r.items.filter((i) => i.status === "pending_review");
    return (
      <div className="max-w-xl mx-auto">
        <div className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Mail size={13} /> This is the approval email the corporate reviewer receives</div>
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 text-sm">
            <div className="text-gray-500 text-xs">From: Freshbites · Franchise by Signage &lt;noreply@signage.com&gt;</div>
            <div className="font-medium text-gray-900 mt-1">{pending.length} item(s) need your decision — {l?.name}</div>
          </div>
          <div className="p-5">
            {auto > 0 && (
              <div className="text-xs mb-4 flex items-center gap-1.5" style={{ color: GREEN_DARK }}>
                <ShieldCheck size={13} style={{ color: GREEN }} /> {auto} item(s) auto-approved — no action needed
              </div>
            )}
            {pending.map((it) => {
              const b = bi(it.brandItemId); const m = master(b.masterId);
              return (
                <div key={it.id} className="border border-amber-200 rounded-xl p-4 mb-3">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-0.5">{b.name} <OriginTag o={it.origin} /><VendorChip bid={b.id} />
                    <span className="ml-auto text-xs font-semibold" style={{ color: b.price ? GREEN_DARK : "#9CA3AF" }}>{b.price ? fmtPrice(b.price) : "Custom quote"}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mb-2">{m.type}{m.variant ? ` · ${m.variant}` : ""} · {b.spec}</div>
                  {it.issue && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-2.5 py-1.5 mb-2">Franchisee: "{it.issue}"</div>}
                  <div className="rounded-lg overflow-hidden border border-gray-100 mb-3">
                    <Mockup masterId={b.masterId} brandText="Freshbites" />
                  </div>
                  <input value={reviewNotes[it.id] || ""} onChange={(e) => setReviewNotes({ ...reviewNotes, [it.id]: e.target.value })}
                    placeholder="Optional note or condition" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs mb-2" />
                  <div className="flex gap-2">
                    <button onClick={() => decideItem(r.id, it.id, "approved")}
                      className="flex-1 text-xs font-medium text-white py-2 rounded-lg" style={{ background: GREEN }}>Approve</button>
                    <button onClick={() => decideItem(r.id, it.id, "changes_requested")} disabled={!(reviewNotes[it.id] || "").trim()}
                      title="Write the change in the note field above"
                      className="flex-1 text-xs font-medium text-amber-800 border border-amber-300 bg-amber-50 py-2 rounded-lg disabled:opacity-40">Request changes</button>
                    <button onClick={() => decideItem(r.id, it.id, "declined")}
                      className="flex-1 text-xs font-medium text-rose-700 border border-rose-200 bg-rose-50 py-2 rounded-lg">Decline</button>
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1.5">Request changes needs a note — it goes back to the franchisee to update and resubmit.</div>
                </div>
              );
            })}
            <div className="text-[11px] text-gray-400 mt-2">Decisions apply per item. Approved items proceed to quote immediately.</div>
          </div>
        </div>
      </div>
    );
  };

  // ---------------- CORPORATE (dashboard + approvals) ----------------
  const corporateView = () => {
    const pendingApprovals = requests.reduce((n, r) => n + r.items.filter((i) => i.status === "pending_review").length, 0);
    const openReqs = requests.filter((r) => r.status !== "completed");
    const totalSigns = locations.reduce((n, l) => n + l.installedSigns.length, 0);
    const programSpend = requests.reduce((s, r) => s + reqQuotes(r).reduce((t, q) => t + q.total, 0), 0);
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Freshbites Signage Program</h2>
            <p className="text-sm text-gray-500">Brand control across all locations — powered by Signage.com</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[["dashboard", "Dashboard"], ["approvals", `Approvals${pendingApprovals ? ` (${pendingApprovals})` : ""}`]].map(([id, lbl]) => (
              <button key={id} onClick={() => setCorpTab(id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md ${corpTab === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {corpTab === "approvals" ? reviewerView() : (
          <>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {[
                ["Locations", locations.length],
                ["Installed signs", totalSigns],
                ["Open requests", openReqs.length],
                ["Awaiting approval", pendingApprovals, pendingApprovals > 0],
                ["Program spend", fmtPrice(programSpend)],
              ].map(([lbl, val, alert]) => (
                <div key={lbl} className={`border rounded-xl bg-white p-3 text-center ${alert ? "border-amber-300" : "border-gray-200"}`}>
                  <div className="text-lg font-semibold" style={{ color: alert ? "#B45309" : GREEN_DARK }}>{val}</div>
                  <div className="text-[10px] text-gray-500">{lbl}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border border-gray-200 bg-white rounded-xl px-4 py-2.5 mb-4">
              <div className="text-xs text-gray-600">
                <span className="font-medium text-gray-800">Vendor policy: {BRAND_CONFIG.policyLabel}</span> — quote packages route to {BRAND_CONFIG.vendorLabel} by default; per-sign overrides apply (e.g. Road Sign → SignCraft Industries){BRAND_CONFIG.corporateCc ? ". Corporate copied on every package" : ""}
                <div className="text-[10px] text-gray-400 mt-0.5">{BRAND_CONFIG.external ? "External vendor quotes and fulfills directly; the portal keeps your approval control and location records." : "Signage.com quotes and fulfills; full production tracking in the portal."} Set during white-glove setup — contact your Signage.com manager to change.</div>
              </div>
            </div>
            {pendingApprovals > 0 && (
              <button onClick={() => setCorpTab("approvals")}
                className="w-full flex items-center justify-between border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 mb-4 text-left">
                <div className="text-sm text-amber-800 flex items-center gap-2"><AlertCircle size={15} /> {pendingApprovals} item(s) awaiting your approval</div>
                <ChevronRight size={16} className="text-amber-600" />
              </button>
            )}
            {locations.map((l) => {
              const locReqs = requests.filter((r) => r.locationId === l.id && r.status !== "completed");
              const complete = l.installedSigns.length >= (FORMATS.find((f) => f.id === l.format)?.pkg.length || 4);
              return (
                <div key={l.id} className="border border-gray-200 bg-white rounded-xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={11} /> {l.address}</div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${complete ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                      {complete ? "Package complete" : "Setup in progress"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{l.installedSigns.length} installed sign(s)</span>
                    {!complete && l.openingDate && <span className="text-amber-700 font-medium">opens {l.openingDate}</span>}
                    {l.installedSigns.length > 0 && <span>oldest: {l.installedSigns[0].installed}</span>}
                    {locReqs.length > 0 && (
                      <span className="flex items-center gap-1.5 ml-auto">
                        {locReqs.map((r) => <RBadge key={r.id} s={r.status} />)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="text-[11px] text-gray-400 text-center mt-2">Standard packages and like-for-like replacements auto-approve per your brand rules — only add-ons and exceptions reach your approval queue.</div>
          </>
        )}
      </div>
    );
  };

  const personas = [
    { id: "franchisee", label: "Franchisee", icon: User },
    { id: "team", label: "Signage.com team", icon: Inbox },
    { id: "corporate", label: "Freshbites Corporate", icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <button onClick={() => openStudio()}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border" style={{ borderColor: GREEN, color: GREEN_DARK }}>
              <Sparkles size={13} style={{ color: GREEN }} /> Design Studio
            </button>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {personas.map((p) => (
                <button key={p.id} onClick={() => { setPersona(p.id); setQueueSel(null); }}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md ${persona === p.id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                  <p.icon size={13} /> {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {persona === "franchisee" && franchiseeView()}
        {persona === "team" && teamView()}
        {persona === "corporate" && corporateView()}
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-6 text-center text-[11px] text-gray-400">
        Flow demo v12 · per-item change-request loop restored · <button onClick={resetDemo} className="underline hover:text-gray-600">reset demo</button>
      </div>
      {designStudioModal()}
    </div>
  );
}
