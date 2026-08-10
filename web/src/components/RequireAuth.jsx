import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children }) {
<<<<<<< HEAD
  const { isLoggedIn, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;

=======
  const { isLoggedIn } = useAuth();
  const location = useLocation();

>>>>>>> origin/main
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
