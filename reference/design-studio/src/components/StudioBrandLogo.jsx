import { useEffect, useState } from "react";
import { useCompanyId } from "../hooks/useRole";
import { getStudioLogo } from "../utils/studioConfig";

// Company branding shown in the studio canvas (top-right). Reads the configured
// logo for the current user's company (set on the Studio Config page). Renders
// nothing when no logo is configured.
const StudioBrandLogo = () => {
  const companyId = useCompanyId() ?? 1;
  const [logo, setLogo] = useState(() => getStudioLogo(companyId));

  useEffect(() => {
    setLogo(getStudioLogo(companyId));
  }, [companyId]);

  if (!logo) return null;

  return (
    <img
      src={logo}
      alt="Company logo"
      // Watermark: translucent + blended so it sits subtly on the scene image.
      className="absolute top-3 right-3 z-20 max-h-12 max-w-[150px] object-contain pointer-events-none select-none opacity-40 mix-blend-luminosity"
    />
  );
};

export default StudioBrandLogo;
