import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import "./App.css";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import { useEffect, useState } from "react";
import { localStorageTokenKey } from "./utils/localStorageTokenKey";
import { useDispatch, useSelector } from "react-redux";
import {
  GetDefaultOptions,
  GetLoggedInUser,
} from "./store/action/UserLoginAction";

import { Toaster } from "@/components/ui/sonner";
import Verfiy2fa from "./pages/Verfiy2fa";
import Studio from "./pages/Studio";
import StudioLogo from "./pages/StudioLogo";
import StudioText from "./pages/StudioText";
import AllMockups from "./pages/AllMockups";

import "./config/config";
import NotFound from "./pages/NotFound";
import FranchiseDemo from "./pages/FranchiseDemo";
import FlowPage from "./pages/FlowPage";
import { GetGlobalSignTypes } from "./store/action/GlobalSignTypesAction";
import { DEFAULT_BRAND, PRODUCT_NAME, applyBrandTheme } from "./brand/brandTheme";

// Design Studio only.
//
// This app was the full Signize portal (dashboards, orders, estimates, admin,
// company/user management) sitting on a NestJS+Postgres backend. All of that is
// deleted — the franchise portal owns those records in Supabase. What survives
// is the studio itself plus the auth needed to hold a bearer token for the
// Signize pricing/mockup API (api.signize.ai — see src/json/API.json).
function App() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { default_loading } = useSelector((state) => state.User);
  // Hold routing until the initial auth check resolves. Without this, the first
  // render shows the routes with user=null (role falls back to the restrictive
  // `user`), so ProtectedRoute redirects staff off their pages before the real
  // role loads. If there's no token there's nothing to check.
  const [authChecked, setAuthChecked] = useState(
    () => !localStorage.getItem(localStorageTokenKey)
  );

  const getUser = () => {
    dispatch(GetLoggedInUser({ navigate })).finally(() => setAuthChecked(true));
  };

  useEffect(() => {
    // Paint the active brand's colours onto :root before anything renders. An
    // embed host would resolve the brand from the URL/token and pass it here.
    applyBrandTheme(DEFAULT_BRAND);

    const token = localStorage.getItem(localStorageTokenKey);
    if (token) {
      getUser();
    }
    // Both load the sign taxonomy + attribute options from the Signize API.
    // The studio cannot render its pickers without them.
    dispatch(GetGlobalSignTypes({ navigate }));
    dispatch(GetDefaultOptions({ navigate }));
    // eslint-disable-next-line
  }, []);

  if (!authChecked || default_loading) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-background flex flex-col items-center justify-center">
        {/* White-label: the brand loads, never the engine vendor. */}
        <h1 className="text-4xl font-bold mb-3" style={{ color: "var(--brand)" }}>
          {DEFAULT_BRAND.name}
        </h1>
        <p className="text-xs text-muted-foreground mb-10">
          {PRODUCT_NAME} · {DEFAULT_BRAND.operator}
        </p>
        <div>
          <span className="font-semibold mb-2 text-xl me-4">Loading</span>
          <span className="loading loading-dots loading-xl"></span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background blueprint-grid">
      <Routes>
        <Route path="/" element={<Navigate replace to="/studio" />} />

        <Route
          path="/studio"
          element={
            <ProtectedRoute>
              <Studio />
            </ProtectedRoute>
          }
        >
          <Route
            path=""
            element={
              <ProtectedRoute>
                <StudioLogo />
              </ProtectedRoute>
            }
          />
          <Route
            path="text"
            element={
              <ProtectedRoute>
                <StudioText />
              </ProtectedRoute>
            }
          />
          <Route
            path="logo"
            element={
              <ProtectedRoute>
                <StudioLogo />
              </ProtectedRoute>
            }
          />
          <Route
            path="logo/all-mockups"
            element={
              <ProtectedRoute>
                <AllMockups />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Franchise flow demo (docs/flow-demo.jsx) with the studio bridge wired in. */}
        <Route path="/demo" element={<FranchiseDemo />} />

        {/* Stakeholder walkthrough of the system — the visual form of docs/FLOW.md. */}
        <Route path="/flow" element={<FlowPage />} />

        <Route path="/login" element={<Login />} />
        <Route path="/verification" element={<Verfiy2fa />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          classNames: {
            toast: "text-lg", // affects whole toast
            title: "text-[15px] font-semibold",
            description: "text-base text-gray-300",
            icon: "w-10  h-10",
          },
        }}
      />
    </div>
  );
}
export default App;
