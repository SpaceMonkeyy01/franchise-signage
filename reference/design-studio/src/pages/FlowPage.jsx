// Stakeholder-facing walkthrough of the whole system — the visual companion to
// docs/FLOW.md, which is the text of record. Content here must track that file;
// where either disagrees with docs/SPEC.md or the demo, the spec and demo win.
//
// Self-contained on purpose: all styling is scoped under `.fbflow` in one
// <style> block rather than Tailwind utilities, because the studio shell is a
// dark daisyUI theme and this page is a light document. That also makes it a
// straight lift into the Next.js portal at session 6 — copy the file, drop the
// route, nothing else to unpick.
//
// Brand colour and the product name come from brandTheme.js, so a second brand
// re-skins this page by supplying its own object; nothing here is hardcoded.
import { useEffect } from "react";
import { DEFAULT_BRAND, PRODUCT_NAME, applyBrandTheme } from "../brand/brandTheme";

const SECTIONS = [
  ["parties", "Parties"],
  ["journey", "Journey"],
  ["setup", "Brand setup"],
  ["franchisee", "Franchisee flow"],
  ["team", "Team & fulfillment"],
  ["approval", "Approvals"],
  ["gauntlet", "The gauntlet"],
  ["money", "Money"],
  ["machine", "Status machine"],
  ["outputs", "Outputs"],
];

// Three active in the portal, three passive and reached by email — FLOW.md §2.
const PARTIES = [
  ["fr", "Franchisee", "Requests signage for their location. Tokenized links, no login."],
  ["co", "Corporate", "Owns brand standards, approves only exceptions, watches the portfolio."],
  ["sg", "Signage.com", "White-glove setup, runs the queue, prepares packages, routes quotes, fulfills."],
  ["ll", "Landlord & city", "Written consent and the sign permit, both before fabrication."],
  ["bk", "Bank / lender", "Funds the buildout, pays vendor invoices in controlled disbursements."],
  ["vn", "External vendor", "Quotes and fulfills when brand policy routes away from Signage.com."],
];

const TOUCHPOINTS = [
  ["Discovery", "A cost line", null,
   "Signage appears as an estimate range in Item 7 of the FDD. Nobody acts on it yet.", true],
  ["Franchise agreement signed", "A budget number", "portal output",
   "Corporate hands the new franchisee a per-format budget one-pager, generated from the standard package prices. The same moment fires the welcome email that gives the franchisee their brand-email access.", false],
  ["Loan application", "A loan line item", "portal output",
   "The agreement is signed before the loan is approved. Signage is a named use-of-proceeds line, and the budgetary quote is the document behind the number.", false],
  ["Buildout", "The active project", "the portal flow",
   "Lease signed, sign criteria arrives, the request runs: approvals, landlord, permit, fabricate, invoice, install. Under time pressure, because opening day is fixed and permits take weeks.", false],
  ["Operations, forever", "The long tail", "the fast lane",
   "Replacements, additions, eventual rebrands. The location record makes each one a lookup instead of a project.", false],
];

const SETUP = [
  ["Pin the brand items",
   "Signage.com walks corporate through the master catalog and locks the choices into named items, like “Storefront Letters: face-lit premium, trimless, match-logo returns, UL listed.” Only site facts stay variable."],
  ["Define standard packages",
   "One pre-approved sign list per location format: inline, endcap, freestanding."],
  ["Set the vendor policy",
   "One of four: Signage.com direct, approved vendor, preferred vendor, or corporate-first. Per-item overrides on top — a pylon can always go to a local fabricator."],
  ["Set approval rules and prices",
   "Reviewer contact, review SLA and what happens when it lapses, estimated prices on direct-priced items."],
  ["Corporate confirms, brand goes live",
   "Corporate signs off on a preview of the franchisee experience. Franchisees get their links."],
];

const FRANCHISEE = [
  ["Location basics",
   "Name, address, opening date, lender involved yes or no, location format. The format loads their standard package."],
  ["Upload the sign exhibit",
   "The lease sign criteria, often Exhibit C. Never the full lease. Site plan optional — the GC or architect usually has it, not the franchisee."],
  ["The pre-loaded checklist",
   "“Your location requires these signs,” each pre-approved. Per sign: placement photo, sizing or TBD, instant mockup via Design Studio. A standard sign that will not work on site can be flagged, and becomes an exception for corporate."],
  ["Optional add-ons",
   "From the approved catalog, each marked “needs corporate approval,” with price and fulfillment vendor shown. “Design and add” generates the mockup and attaches it."],
  ["Review and submit",
   "Two groups: proceeding immediately, and going to corporate. Estimated total and vendor policy shown. One submission covers the whole location."],
  ["Track on the status page",
   "Per-item statuses, prices, vendors, change requests, the quote, production progress and the full timeline. Same link throughout."],
];

const APPROVAL_ROWS = [
  ["Standard package item, unmodified", "Auto-approved, never seen", true],
  ["Add-on from the catalog", "Reviewed", false],
  ["Exception — a standard sign flagged as unworkable on site", "Always reviewed", false],
  ["Like-for-like replacement of an installed sign", "Auto-approved, always", true],
  ["Modify, remove, rebrand (v1.1)", "Reviewed", false],
];

const GATES = [
  ["co", "Corporate", "Brand approval", "the fast step", true,
   "Only add-ons and exceptions, decided per item from email. Each brand sets a review SLA (default 5 days) and what happens when it lapses: remind, escalate to the secondary reviewer, or auto-forward."],
  ["ll", "Landlord", "Written consent", "days to weeks", false,
   "The lease sign exhibit governs type, size formulas, placement band, illumination, colors and raceway. Drawings must be approved in writing before fabrication. The portal collects the exhibit at setup, the team interprets it, conflicts become exceptions."],
  ["ct", "City", "Sign permit", "weeks, not days", false,
   "Site plan, elevations, mounting and electrical details, stamped engineering where required, landlord consent letter. MVP logs these milestones as events; producing the package becomes part of the service in phase 2, when Signage.com fulfills."],
];

const DOCS = [
  ["Loan application", "Budgetary quote",
   "The signage number behind the use-of-proceeds line, downloadable once a quote exists."],
  ["Disbursement", "Formal invoice",
   "What the lender pays against — payee, amount, date and purpose evident."],
  ["Lender file", "Paid receipt",
   "Marked paid with date and method, closing the loop for the bank’s records."],
];

const OUTPUTS = [
  ["pre-request", "Configured brand program + budget one-pager per format", "Franchisee + lender, corporate"],
  ["submission", "Confirmation with next steps", "Franchisee"],
  ["package prep", "Clean request package: photos, specs, mockups, criteria review, TBD list", "Team, corporate"],
  ["approval", "Decision-ready email, then the approval record", "Corporate"],
  ["landlord", "Drawing submittal per the criteria", "Property manager"],
  ["permit", "Full permit package incl. engineering — phase 2; MVP logs milestones", "Municipality"],
  ["money", "Quote, invoice, paid receipt, or the routed package email", "Franchisee, lender, vendor"],
  ["fulfillment", "The sign, installation, inspection pass, milestone updates", "Franchisee, corporate"],
  ["after install", "The updated location record", "Everyone, forever"],
];

const OUT_OF_SCOPE = [
  "self-serve onboarding", "franchisee accounts", "vendor portal",
  "payment processing (documents are in scope)", "compliance validation",
  "permit stages (phase 2)", "modify / remove / rebrand",
];

const CSS = `
.fbflow{--ink:#20261F;--paper:#FAFAF6;--card:#FFF;--leaf:var(--brand-light,#E8F5E9);
  --brandc:var(--brand,#2E7D32);--brandd:var(--brand-dark,#1B5E20);
  --coral:#C74E28;--coral-soft:#FAECE7;--purple:#4F46A8;--amber:#B57411;
  --slate:#5C635F;--line:#E3E5DF;--facade:#22272A;
  font-family:'Instrument Sans',system-ui,sans-serif;background:var(--paper);color:var(--ink);
  line-height:1.65;font-size:16.5px;-webkit-font-smoothing:antialiased}
/* index.css sets a global \`* { font-family: Inter }\`. That is specificity 0,0,0
   and would otherwise beat the family set on .fbflow for every descendant, so
   reassert inheritance at 0,1,0 and let the rules below take it from there. */
.fbflow *{box-sizing:border-box;margin:0;padding:0;font-family:inherit}
.fbflow h1,.fbflow h2,.fbflow h3{font-family:'Archivo',system-ui,sans-serif;line-height:1.15}
.fbflow .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.fbflow .wrap{max-width:880px;margin:0 auto;padding:0 28px}

/* The facade is a wall: a vertical light gradient plus faint horizontal panel
   joints, so the sign has something to be mounted on. */
.fbflow .facade{position:relative;overflow:hidden;color:#E8EAE6;padding:0 0 60px;
  background:
    linear-gradient(180deg,#1B2023 0%,#22272A 42%,#272D30 100%),
    repeating-linear-gradient(180deg,rgba(255,255,255,.022) 0 1px,transparent 1px 108px);
  background-blend-mode:normal}
.fbflow .facade::after{content:"";position:absolute;left:0;right:0;bottom:0;height:10px;
  background:#161A1C;box-shadow:0 -1px 0 rgba(0,0,0,.5)}

.fbflow .signband{padding:64px 28px 26px;text-align:center;position:relative;z-index:1}

.fbflow .cobrand{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;
  color:#DCE3DC;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);
  border-radius:999px;padding:6px 15px;margin-bottom:44px;backdrop-filter:blur(2px)}
.fbflow .cobrand .swatch{width:9px;height:9px;border-radius:50%;background:var(--brandc);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--brandc) 26%,transparent)}
.fbflow .cobrand .sep{color:#6E7772}
.fbflow .cobrand .op{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;
  text-transform:uppercase;color:#9EA7A0;font-weight:400}

/* The rig: spill behind, letters, raceway under. */
.fbflow .signrig{position:relative;display:inline-block;padding:0 10px}
.fbflow .spill{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);
  width:150%;height:280%;pointer-events:none;
  background:radial-gradient(ellipse at center,
    rgba(150,232,163,.20) 0%, rgba(140,220,150,.10) 32%, rgba(120,210,140,.035) 55%, transparent 72%)}
.fbflow .halo{position:relative;font-family:'Archivo',system-ui,sans-serif;font-weight:700;
  font-size:clamp(30px,6.2vw,60px);letter-spacing:.015em;line-height:1.06;color:#F2F6EE;
  text-shadow:0 0 14px rgba(150,232,163,.34),0 2px 0 rgba(0,0,0,.55)}
.fbflow .halo .unlit{color:#CBD3CB;text-shadow:0 2px 0 rgba(0,0,0,.55)}
.fbflow .halo .lit{color:#C6F5CC;
  text-shadow:0 0 10px rgba(170,245,182,.85),0 0 30px rgba(140,225,155,.55),
              0 0 64px rgba(110,205,132,.35),0 2px 0 rgba(0,0,0,.5)}
/* Mounting bar the letters sit on, with the shadow it casts on the wall. */
.fbflow .raceway{position:relative;height:7px;margin:14px auto 0;width:100%;border-radius:2px;
  background:linear-gradient(180deg,#39413E 0%,#2A312F 55%,#1E2422 100%);
  box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 7px 16px -6px rgba(0,0,0,.75)}

.fbflow .kicker{margin-top:22px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;
  letter-spacing:.26em;text-transform:uppercase;color:#A7B0A8}

.fbflow .lede{max-width:660px;margin:30px auto 0;text-align:center;color:#CAD1CA;font-size:18px;padding:0 28px}
.fbflow .lede strong{color:#EDF2EA;font-weight:600}

/* Sticky so a long document stays navigable; the blur keeps the wall visible. */
.fbflow .nav{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:8px;
  justify-content:center;padding:12px 20px;
  background:rgba(27,32,35,.86);backdrop-filter:blur(8px);
  border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
.fbflow .nav a{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.08em;
  text-decoration:none;color:#C2CAC2;border:1px solid #3A4144;border-radius:999px;
  padding:7px 14px;transition:color .15s,border-color .15s,background .15s}
.fbflow .nav a:hover,.fbflow .nav a:focus-visible{color:#DFF5E1;border-color:#5B8A61;
  background:rgba(120,200,135,.10)}

/* The sign powers on once, like a real one. Motion-safe only. */
@media (prefers-reduced-motion:no-preference){
  .fbflow .halo .lit{animation:fbPowerOn 1.5s ease-out both}
  .fbflow .spill{animation:fbSpillUp 1.9s ease-out both}
}
@keyframes fbPowerOn{
  0%{color:#79857B;text-shadow:none}
  38%{color:#79857B;text-shadow:none}
  46%{color:#C6F5CC;text-shadow:0 0 10px rgba(170,245,182,.85),0 0 30px rgba(140,225,155,.55)}
  52%{color:#8B9A8D;text-shadow:none}
  60%{color:#C6F5CC;text-shadow:0 0 10px rgba(170,245,182,.85),0 0 30px rgba(140,225,155,.55)}
  100%{color:#C6F5CC;
    text-shadow:0 0 10px rgba(170,245,182,.85),0 0 30px rgba(140,225,155,.55),
                0 0 64px rgba(110,205,132,.35),0 2px 0 rgba(0,0,0,.5)}
}
@keyframes fbSpillUp{0%,42%{opacity:0}100%{opacity:1}}

/* scroll-margin clears the sticky nav so anchored headings are not hidden under it. */
.fbflow section{padding:64px 0 8px;scroll-margin-top:76px}
.fbflow .stamp{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:11.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--slate);border:1px solid var(--line);
  border-radius:4px;padding:4px 10px;background:var(--card);margin-bottom:14px}
.fbflow h2{font-size:clamp(24px,3.4vw,32px);font-weight:600;margin-bottom:14px;letter-spacing:-.01em}
.fbflow .sub{color:var(--slate);max-width:640px;margin-bottom:30px}
.fbflow .card{background:var(--card);border:1px solid var(--line);border-radius:12px}

.fbflow .parties{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px}
.fbflow .party{border-radius:12px;padding:16px;border:1px solid var(--line);background:var(--card)}
.fbflow .party .dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-bottom:8px}
.fbflow .party h3{font-size:15px;font-weight:600;margin-bottom:4px}
.fbflow .party p{font-size:13px;color:var(--slate);line-height:1.5}
.fbflow .p-fr .dot{background:var(--coral)}.fbflow .p-co .dot{background:var(--purple)}
.fbflow .p-sg .dot{background:var(--brandc)}.fbflow .p-ll .dot{background:var(--slate)}
.fbflow .p-bk .dot{background:var(--amber)}.fbflow .p-vn .dot{background:#8B9290}

.fbflow .spine{position:relative;padding-left:34px}
.fbflow .spine::before{content:"";position:absolute;left:11px;top:6px;bottom:6px;width:2px;background:var(--line)}
.fbflow .tp{position:relative;margin-bottom:26px}
.fbflow .tp::before{content:"";position:absolute;left:-29px;top:6px;width:12px;height:12px;
  border-radius:50%;background:var(--brandc);border:3px solid var(--paper)}
.fbflow .tp.quiet::before{background:#B7BEB8}
.fbflow .tp .when{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--slate)}
.fbflow .tp h3{font-size:17px;font-weight:600;margin:2px 0 4px}
.fbflow .tp p{font-size:14.5px;color:#454B45;max-width:620px}
.fbflow .tag{display:inline-block;font-size:11.5px;font-weight:600;color:var(--brandd);
  background:var(--leaf);border-radius:999px;padding:2px 10px;margin-left:6px;vertical-align:2px}

.fbflow .steps{counter-reset:s;display:grid;gap:10px}
.fbflow .step{counter-increment:s;display:grid;grid-template-columns:44px 1fr;gap:14px;padding:16px 18px;align-items:start}
.fbflow .step::before{content:counter(s,decimal-leading-zero);font-family:'IBM Plex Mono',monospace;
  font-size:13px;color:var(--brandd);background:var(--leaf);border-radius:8px;width:44px;height:44px;
  display:flex;align-items:center;justify-content:center;font-weight:500}
.fbflow .step h3{font-size:15.5px;font-weight:600;margin-bottom:3px}
.fbflow .step p{font-size:14px;color:#454B45}
.fbflow .step.coral::before{color:var(--coral);background:var(--coral-soft)}

.fbflow .fastlane{border-left:4px solid var(--brandc);border-radius:0 12px 12px 0;background:var(--leaf);
  padding:18px 20px;margin-top:18px}
.fbflow .fastlane h3{font-size:15.5px;color:var(--brandd);margin-bottom:4px}
.fbflow .fastlane p{font-size:14px;color:#2C4A2E}

.fbflow .tails{margin-top:22px;overflow-x:auto;padding:20px}
.fbflow .tails svg{display:block;min-width:640px;width:100%;height:auto}

.fbflow .tablewrap{border-radius:12px;overflow:hidden;border:1px solid var(--line);overflow-x:auto}
.fbflow table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--card)}
.fbflow th{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
  text-align:left;color:var(--slate);font-weight:500;background:#F3F5F1;padding:12px 16px;border-bottom:1px solid var(--line)}
.fbflow td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top}
.fbflow tr:last-child td{border-bottom:0}
.fbflow .ok{color:var(--brandd);font-weight:600}
.fbflow .rev{color:var(--amber);font-weight:600}
.fbflow .outputs td:first-child{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--slate);white-space:nowrap}

.fbflow .gate{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:18px 20px;
  border:1px solid var(--line);background:var(--card)}
.fbflow .gate:first-child{border-radius:12px 12px 0 0}
.fbflow .gate:last-child{border-radius:0 0 12px 12px}
.fbflow .gate+.gate{border-top:0}
.fbflow .gate .who{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.06em;
  text-transform:uppercase;padding-top:2px;color:var(--slate)}
.fbflow .gate.g-co .who{color:var(--purple)}
.fbflow .gate h3{font-size:15.5px;font-weight:600;margin-bottom:3px}
.fbflow .gate p{font-size:14px;color:#454B45}
.fbflow .gate .time{font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--slate);font-weight:400}
.fbflow .gate .time.fast{color:var(--brandd);font-weight:600}

.fbflow .docs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.fbflow .doc{border:1px solid var(--line);border-top:4px solid var(--amber);border-radius:12px;
  background:var(--card);padding:18px}
.fbflow .doc .when{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--amber)}
.fbflow .doc h3{font-size:16px;margin:6px 0}
.fbflow .doc p{font-size:13.5px;color:#454B45}

.fbflow .machine{background:var(--facade);border-radius:12px;padding:26px 24px;overflow-x:auto}
.fbflow .machine pre{font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:1.9;
  color:#CBD3CC;white-space:pre}
.fbflow .machine .g{color:#9FE1AB}.fbflow .machine .a{color:#F3C878}.fbflow .machine .m{color:#8C959B}

.fbflow .scope{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
.fbflow .scope span{font-size:13px;color:var(--slate);border:1px dashed #C9CEC8;border-radius:999px;
  padding:5px 12px;background:var(--card)}
.fbflow .scope .lbl{border:0;background:0;padding-left:0;font-weight:600;color:var(--ink)}
.fbflow footer{margin-top:80px;background:var(--facade);color:#AEB6AF;padding:44px 28px;
  text-align:center;font-size:13.5px}
.fbflow footer .mono{font-size:11px;letter-spacing:.18em;text-transform:uppercase;display:block;
  margin-bottom:10px;color:#7E877F}

@media (max-width:640px){
  .fbflow .gate{grid-template-columns:1fr;gap:6px}
  .fbflow .step{grid-template-columns:36px 1fr}
  .fbflow .step::before{width:36px;height:36px}
}
@media (prefers-reduced-motion:reduce){.fbflow{scroll-behavior:auto}}
`;

// The hero is a lit storefront sign, not a text banner: light spills from the
// letters onto the wall behind them, and the lockup sits on a raceway the way a
// real channel-letter set does. Everything is CSS — no images to ship.
//
// The lockup is PRODUCT_NAME, split so the operator half carries the halo:
// "Franchise" unlit, "by Signage" lit. Never the franchise brand's own name —
// this is the product's sign, and the brand appears on the co-brand plate above
// it, matching the demo's "Freshbites · Powered by SIGNAGE.com" header.
const [PRODUCT_LEAD, PRODUCT_LIT] = (() => {
  const i = PRODUCT_NAME.toLowerCase().indexOf(" by ");
  return i === -1
    ? ["", PRODUCT_NAME]
    : [PRODUCT_NAME.slice(0, i), PRODUCT_NAME.slice(i + 1)];
})();

// The nav is a sibling of <header>, not a child: .facade needs overflow:hidden to
// clip the light spill, and an overflow:hidden ancestor silently disables
// position:sticky on everything inside it.
const Facade = ({ brand }) => (
  <>
  <header className="facade">
    <div className="signband">
      {/* Co-brand plate — the franchisee always sees their brand plus the operator. */}
      <div className="cobrand">
        <span className="swatch" />
        {brand.name}
        <span className="sep">·</span>
        <span className="op">Powered by {brand.operator}</span>
      </div>

      <div className="signrig">
        <div className="spill" aria-hidden="true" />
        <h1 className="halo">
          {PRODUCT_LEAD && <span className="unlit">{PRODUCT_LEAD.toUpperCase()} </span>}
          <span className="lit">{PRODUCT_LIT.toUpperCase()}</span>
        </h1>
        <div className="raceway" aria-hidden="true" />
      </div>

      <div className="kicker">Complete flow</div>
    </div>

    <p className="lede">
      The franchisee&rsquo;s real problem is not ordering a sign. It is coordinating{" "}
      <strong>five parties</strong> &mdash; corporate, landlord, city, bank and vendor &mdash;
      who all need consistent documents about the same sign. The portal is the{" "}
      <strong>single source of truth</strong> those documents flow from.
    </p>
  </header>

  <nav className="nav" aria-label="Sections">
    {SECTIONS.map(([id, label]) => (
      <a key={id} href={`#${id}`}>{label}</a>
    ))}
  </nav>
  </>
);

const Section = ({ id, stamp, title, sub, children }) => (
  <section id={id}>
    <span className="stamp">{stamp}</span>
    <h2>{title}</h2>
    {sub && <p className="sub">{sub}</p>}
    {children}
  </section>
);

// Both tails converge on `completed`, which is the only transition that writes
// installed_signs (SPEC §6). The diagram exists to make that convergence obvious.
const TailsDiagram = () => (
  <svg viewBox="0 0 680 336" role="img" xmlns="http://www.w3.org/2000/svg">
    <title>The two fulfillment tails, both ending at the location record</title>
    <defs>
      <marker id="fbar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
              orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>

    <rect x="240" y="16" width="200" height="46" rx="9" fill="var(--leaf)" stroke="var(--brandc)" />
    <text x="340" y="39" textAnchor="middle" dominantBaseline="central"
          fontFamily="Instrument Sans" fontSize="14" fontWeight="600" fill="var(--brandd)">
      Approved items
    </text>

    <line x1="290" y1="62" x2="180" y2="106" stroke="#5C635F" strokeWidth="1.2" markerEnd="url(#fbar)" />
    <line x1="390" y1="62" x2="500" y2="106" stroke="#5C635F" strokeWidth="1.2" markerEnd="url(#fbar)" />

    <rect x="60" y="110" width="250" height="44" rx="9" fill="#FFF" stroke="var(--brandc)" />
    <text x="185" y="128" textAnchor="middle" dominantBaseline="central"
          fontFamily="Instrument Sans" fontSize="13.5" fontWeight="600" fill="var(--brandd)">
      Internal · Signage.com fulfills
    </text>
    <text x="185" y="145" textAnchor="middle" dominantBaseline="central"
          fontFamily="IBM Plex Mono" fontSize="10.5" fill="#5C635F">
      rich tracking in the portal
    </text>

    <rect x="380" y="110" width="250" height="44" rx="9" fill="#FFF" stroke="#8B9290" />
    <text x="505" y="128" textAnchor="middle" dominantBaseline="central"
          fontFamily="Instrument Sans" fontSize="13.5" fontWeight="600" fill="#3E4441">
      External · outside vendor
    </text>
    <text x="505" y="145" textAnchor="middle" dominantBaseline="central"
          fontFamily="IBM Plex Mono" fontSize="10.5" fill="#5C635F">
      quoted and fulfilled off-platform
    </text>

    <line x1="185" y1="154" x2="185" y2="182" stroke="var(--brandc)" strokeWidth="1.2" markerEnd="url(#fbar)" />
    <line x1="505" y1="154" x2="505" y2="182" stroke="#8B9290" strokeWidth="1.2" markerEnd="url(#fbar)" />

    <g fontFamily="IBM Plex Mono" fontSize="11.5">
      <text x="185" y="200" textAnchor="middle" fill="var(--brandc)">quote_ready → accepted</text>
      <text x="185" y="222" textAnchor="middle" fill="var(--brandc)">in_production → shipped</text>
      <text x="185" y="244" textAnchor="middle" fill="var(--brandc)">landlord + permit handled</text>
      <text x="505" y="200" textAnchor="middle" fill="#5C635F">quote_ready (logged)</text>
      <text x="505" y="222" textAnchor="middle" fill="#5C635F">accepted (logged)</text>
      <text x="505" y="244" textAnchor="middle" fill="#5C635F">corporate copied on package</text>
    </g>

    <line x1="185" y1="256" x2="320" y2="294" stroke="var(--brandc)" strokeWidth="1.2" markerEnd="url(#fbar)" />
    <line x1="505" y1="256" x2="370" y2="294" stroke="#8B9290" strokeWidth="1.2" markerEnd="url(#fbar)" />

    <rect x="215" y="296" width="250" height="32" rx="9" fill="var(--leaf)" stroke="var(--brandc)" />
    <text x="340" y="312" textAnchor="middle" dominantBaseline="central"
          fontFamily="Instrument Sans" fontSize="13" fontWeight="600" fill="var(--brandd)">
      completed · location record updated
    </text>
  </svg>
);

export default function FlowPage() {
  const brand = DEFAULT_BRAND;

  useEffect(() => {
    applyBrandTheme(brand);
    document.title = `${PRODUCT_NAME} · Complete flow`;
  }, [brand]);

  return (
    <div className="fbflow">
      <style>{CSS}</style>
      <Facade brand={brand} />

      <main className="wrap">
        <Section id="parties" stamp="01 · Who is involved" title="Six parties, one sign"
          sub="Three work inside the portal. Three are reached by email and tracked by the team. Everyone needs something about the same sign, in their own format.">
          <div className="parties">
            {PARTIES.map(([k, name, desc]) => (
              <div className={`party p-${k}`} key={k}>
                <span className="dot" />
                <h3>{name}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="journey" stamp="02 · When signage enters"
          title="Five touchpoints on the franchise journey"
          sub="Traditional sign vendors exist only at touchpoint 4. The portal is present at all five.">
          <div className="spine">
            {TOUCHPOINTS.map(([when, head, tag, body, quiet]) => (
              <div className={`tp${quiet ? " quiet" : ""}`} key={head}>
                <div className="when">{when}</div>
                <h3>{head}{tag && <span className="tag">{tag}</span>}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="setup" stamp="03 · Once per brand" title="White-glove brand setup"
          sub="Corporate owns the decisions. Signage.com does the labor. Done once, then every franchisee benefits.">
          <div className="steps">
            {SETUP.map(([h, p]) => (
              <div className="step card" key={h}><div><h3>{h}</h3><p>{p}</p></div></div>
            ))}
          </div>
        </Section>

        <Section id="franchisee" stamp="04 · The franchisee flow" title="Upload, click, submit"
          sub="The franchisee provides photos, the lease sign exhibit and site facts. Nothing else. Anything unknown is TBD, and TBD never blocks submission.">
          <div className="steps">
            {FRANCHISEE.map(([h, p]) => (
              <div className="step coral card" key={h}><div><h3>{h}</h3><p>{p}</p></div></div>
            ))}
          </div>
          <div className="fastlane">
            <h3>The fast lane: replace like-for-like</h3>
            <p>
              For an installed sign that is damaged, worn or vandalized: pick the sign, state the
              reason, add a photo if useful, confirm, submit. Specs come from the installed record,
              corporate review is skipped entirely, and the price shows before submitting. This is
              the retention feature no one-off vendor can match.
            </p>
          </div>
        </Section>

        <Section id="team" stamp="05 · Signage.com operations" title="One queue, two fulfillment tails"
          sub="The team prepares every package and routes each approved item by the brand's vendor policy. One request can split across vendors. Both tails end by writing the location record.">
          <div className="tails card"><TailsDiagram /></div>
          <p className="sub" style={{ marginTop: 16 }}>
            Either way the portal keeps the approval control, the data and the location record.
            Better when Signage.com fulfills, still valuable when it does not.
          </p>
        </Section>

        <Section id="approval" stamp="06 · Corporate's burden, minimized" title="The approval model"
          sub="Approval works per item, not per request. Approved items proceed while others loop or die, so one contested menu board never delays a store opening.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Item origin</th><th>Corporate review?</th></tr></thead>
              <tbody>
                {APPROVAL_ROWS.map(([origin, verdict, auto]) => (
                  <tr key={origin}>
                    <td>{origin}</td>
                    <td className={auto ? "ok" : "rev"}>{verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 16 }}>
            Reviewer choices per item, from email, no login: <strong>approve</strong> with an
            optional condition note, <strong>request changes</strong> with a required note that
            sends the item back to the franchisee to update and resubmit, or <strong>decline</strong>.
          </p>
        </Section>

        <Section id="gauntlet" stamp="07 · Before fabrication" title="The approval gauntlet"
          sub="Three gates in order. Corporate is the fast one. The delays everyone blames on &ldquo;corporate approval&rdquo; actually live in the other two.">
          <div>
            {GATES.map(([k, who, head, time, fast, body]) => (
              <div className={`gate g-${k}`} key={k}>
                <div className="who">{who}</div>
                <div>
                  <h3>{head} <span className={`time${fast ? " fast" : ""}`}>{time}</span></h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="sub" style={{ marginTop: 16 }}>
            The portal never promises compliance or approval outcomes. It collects, routes,
            generates documents and tracks. Humans judge.
          </p>
        </Section>

        <Section id="money" stamp="08 · How the money moves" title="Three documents, three moments"
          sub="Lenders pay in controlled disbursements against vendor documentation, often directly to the vendor. The sign vendor's paperwork becomes bank paperwork. All three are generated from portal data — no payment processing involved.">
          <div className="docs">
            {DOCS.map(([when, head, body]) => (
              <div className="doc" key={head}>
                <div className="when">{when}</div>
                <h3>{head}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="machine" stamp="09 · Under the hood" title="The status machine"
          sub="Every transition writes an event, and events power every timeline. `completed` is the only transition that writes the location record.">
          <div className="machine">
            <pre>
{`draft `}<span className="m">→</span>{` submitted `}<span className="m">→</span>{` `}<span className="a">[needs_review]*</span>{` `}<span className="m">→</span>{` approved `}<span className="m">→</span>{` sent_for_quote

  `}<span className="g">internal tail:</span>{`  quote_ready `}<span className="m">→</span>{` accepted `}<span className="m">→</span>{` in_production `}<span className="m">→</span>{` shipped `}<span className="m">→</span>{` `}<span className="g">completed</span>{`
  `}<span className="m">{`external tail:  quote_ready (logged) → accepted (logged) →`}</span>{` `}<span className="g">completed</span>{`

`}<span className="m">{`* only if any item is pending · changes_requested loops back via resubmission
  item statuses: auto_approved · pending_review · approved · declined · changes_requested`}</span>
            </pre>
          </div>
        </Section>

        <Section id="outputs" stamp="10 · What Signage.com produces" title="Outputs by stage"
          sub="The same sign, rendered as different documents for six audiences. That is the product.">
          <div className="tablewrap">
            <table className="outputs">
              <thead><tr><th>Stage</th><th>Output</th><th>Consumed by</th></tr></thead>
              <tbody>
                {OUTPUTS.map(([stage, out, who]) => (
                  <tr key={stage}><td>{stage}</td><td>{out}</td><td>{who}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scope">
            <span className="lbl">Out of scope for MVP:</span>
            {OUT_OF_SCOPE.map((s) => <span key={s}>{s}</span>)}
          </div>
        </Section>
      </main>

      <footer>
        <span className="mono">{PRODUCT_NAME} · working document</span>
        Companions: docs/SPEC.md (build contract) · docs/FLOW.md (the text of record) ·
        docs/flow-demo.jsx v12 (clickable reference)
      </footer>
    </div>
  );
}
