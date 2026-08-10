
import {
  localStorageIs2faVerified,
  localStorageTokenKey,
} from "../utils/localStorageTokenKey";
import { Navigate, useLocation } from "react-router-dom";
import { useRole } from "../hooks/useRole";
import { ROLE_HOME, canAccess } from "../config/roles";

// Access is decided by the current path via ROUTE_ACCESS (config/roles.js): an
// explicit `roles` prop overrides it for a specific route. A signed-in user whose
// role is not allowed is sent to their role's home (not /login), so they are
// never bounced out of the app — just away from a page they can't access.
const ProtectedRoute = ({ children, roles }) => {
  const token = localStorage.getItem(localStorageTokenKey);
  const isVarified = localStorage.getItem(localStorageIs2faVerified);
  const role = useRole();
  const { pathname } = useLocation();

  if (!token) {
    return <Navigate replace to={"/login"} />;
  }

  if (token && isVarified !== "true") {
    return <Navigate replace to={"/verification"} />;
  }

  const allowed =
    roles && roles.length ? roles.includes(role) : canAccess(role, pathname);
  if (!allowed) {
    return <Navigate replace to={ROLE_HOME[role] ?? "/"} />;
  }

  return children;
};

export default ProtectedRoute;
