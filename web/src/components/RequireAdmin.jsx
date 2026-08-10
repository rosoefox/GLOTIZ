import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAdmin({ children }) {
<<<<<<< HEAD
  const { isLoggedIn, accountType, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;

=======
  const { isLoggedIn, accountType } = useAuth();
  const location = useLocation();

>>>>>>> origin/main
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (accountType !== "admin") {
    return <Navigate to="/gov-support" replace />;
  }

  return children;
}
