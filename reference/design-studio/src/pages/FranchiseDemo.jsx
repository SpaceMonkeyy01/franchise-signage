// Hosts the franchise flow demo (the canonical UX reference at the project
// root) inside this app, so its Design Studio modal can reach the real Signize
// mockup engine through src/studio-bridge/.
//
// Public route — no ProtectedRoute wrapper. The demo is a walkthrough of the
// franchisee / corporate / team flows, none of which use portal login. The
// engine call authenticates separately via the dev service account.
import FranchiseFlowDemo from "@demo";

// The studio is a dark-theme app: index.css sets `body { bg-background
// text-foreground }`, i.e. white text on navy. The demo is a light UI and only
// sets colour where it differs from black, so it inherits that white and any
// unstyled text vanishes. Reset the inherited colour for the demo's subtree.
const FranchiseDemo = () => (
  <div className="text-gray-900">
    <FranchiseFlowDemo />
  </div>
);

export default FranchiseDemo;
