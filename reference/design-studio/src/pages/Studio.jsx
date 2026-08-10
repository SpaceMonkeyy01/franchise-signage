import "../css/studio.css";

import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Header from "../components/pages/Studio/Header";
import { readEmbedParams } from "../embed/embedParams";
import { useEmbedBootstrap } from "../embed/useEmbedBootstrap";

const Studio = () => {
  const location = useLocation();

  // Embed mode (spec §8): the host portal supplies its own chrome, so the
  // co-branded header is suppressed and the studio fills the iframe. Params are
  // read per-location — the host changes them by reloading the frame.
  const embedParams = useMemo(
    () => readEmbedParams(location.search),
    [location.search]
  );

  // Lock the sign type to the brand item's pinned spec before the user sees it.
  useEmbedBootstrap(embedParams);

  const isStudioSurface =
    location.pathname === "/studio/logo" ||
    location.pathname === "/studio/logo/" ||
    location.pathname === "/studio/text" ||
    location.pathname === "/studio/text/";

  return (
    <div
      className={`${
        embedParams.embed
          ? "min-h-full"
          : isStudioSurface
          ? "min-h-screen md:h-screen md:overflow-hidden"
          : "min-h-screen"
      }  max-w-screen`}
    >
      {!embedParams.embed && <Header />}
      <div className="h-full">
        <Outlet />
      </div>
    </div>
  );
};

export default Studio;
