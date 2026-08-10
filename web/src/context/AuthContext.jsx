<<<<<<< HEAD
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState(undefined); // undefined = 아직 조회 전
  const [lastQuery, setLastQuery] = useState(null);
  const [lastFilters, setLastFilters] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile(data);
  };

  const signup = async ({ email, password, loginId, name, phone, company, categoryId, country }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          login_id: loginId,
          name,
          phone,
          company,
          category_id: categoryId,
          country,
          account_type: "user",
        },
      },
    });
    if (error) throw error;
    return data;
  };

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = () => supabase.auth.signOut();

  const profileLoading = !!session?.user && profile === undefined;

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!session,
        ready: !sessionLoading && !profileLoading,
        session,
        user: session?.user ?? null,
        profile: profile ?? null,
        accountType: profile?.account_type ?? "user",
        login,
        signup,
        logout,
        refreshProfile,
=======
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
>>>>>>> origin/main
        lastQuery,
        setLastQuery,
        lastFilters,
        setLastFilters,
<<<<<<< HEAD
=======
        accountType,
>>>>>>> origin/main
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
