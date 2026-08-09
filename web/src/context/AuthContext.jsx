import { createContext, useContext, useState } from "react";
import { user as mockUser } from "../data/mockData";

const AuthContext = createContext(null);
const STORAGE_KEY = "jbxport_remember_login";

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [accountType, setAccountType] = useState("user");
  const [lastQuery, setLastQuery] = useState(null);
  const [lastFilters, setLastFilters] = useState(null);

  const login = ({ remember = false, accountType: type = "user" } = {}) => {
    setIsLoggedIn(true);
    setAccountType(type);
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        user: mockUser,
        login,
        logout,
        lastQuery,
        setLastQuery,
        lastFilters,
        setLastFilters,
        accountType,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
