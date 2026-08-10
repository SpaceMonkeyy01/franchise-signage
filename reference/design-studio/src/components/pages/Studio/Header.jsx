import { Link } from "react-router-dom";
import { Leaf } from "lucide-react";
import ProfileMenu from "../../ProfileMenu";
import { DEFAULT_BRAND } from "../../../brand/brandTheme";

// Co-branded studio header.
//
// The studio is white-label: it renders inside a franchise brand's portal, so
// the underlying engine vendor (Signize) is never named or shown. What appears
// is the brand plus the operator — the same lockup as the flow demo's header.
//
// When the studio is embedded, the host portal already supplies this chrome, so
// Studio.jsx suppresses the header in embed mode.
const Header = ({ brand = DEFAULT_BRAND }) => {
  return (
    <div className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <Link to="/studio" className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-full grid place-items-center shrink-0"
          style={{ background: "var(--brand-light)" }}
        >
          <Leaf size={18} style={{ color: "var(--brand)" }} />
        </span>
        <span className="leading-tight">
          <span
            className="block text-lg font-bold"
            style={{ color: "var(--brand)" }}
          >
            {brand.name}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Powered by <span className="font-semibold">{brand.operator}</span>
          </span>
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <ProfileMenu />
      </div>
    </div>
  );
};

export default Header;
