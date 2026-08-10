import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAdmin({ children }) {
  const { isLoggedIn, accountType, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (accountType !== "admin") {
    return <Navigate to="/gov-support" replace />;
  }

  return children;
}
