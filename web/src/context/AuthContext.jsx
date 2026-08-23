import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

// 로그인/회원가입은 원래 Supabase Auth를 썼는데, 계정도 Cloud SQL + 자체 JWT로 옮겼다
// (백엔드 /auth/*). 세션은 access_token만 있으면 되므로, 새로고침해도 로그인이 풀리지
// 않도록 localStorage에 토큰만 저장해두고, 페이지가 뜰 때 그 토큰으로 /auth/me를 불러온다.
const TOKEN_KEY = "jbxport:auth-token";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { access_token, user }
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setSessionLoading(false);
      return;
    }
    api
      .get("/auth/me", token)
      .then((user) => setSession({ access_token: token, user }))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setSessionLoading(false));
  }, []);

  const refreshProfile = async () => {
    if (!session?.access_token) return;
    try {
      const user = await api.get("/auth/me", session.access_token);
      setSession((s) => (s ? { ...s, user } : s));
    } catch {
      // 무시 - 다음 새로고침 때 다시 시도됨
    }
  };

  const signup = async ({ email, password, loginId, name, phone, company, categoryId, country, accountType = "user" }) => {
    const { access_token, user } = await api.post("/auth/signup", {
      email,
      password,
      login_id: loginId,
      name,
      phone,
      company,
      category_id: categoryId,
      country,
      account_type: accountType,
    });
    localStorage.setItem(TOKEN_KEY, access_token);
    setSession({ access_token, user });
    // Supabase 시절엔 이메일 확인이 켜져 있으면 session이 없을 수 있었지만, 지금 구조는
    // 이메일 확인 단계가 없어 항상 바로 세션이 생긴다.
    return { session: { access_token, user } };
  };

  const login = async ({ email, password }) => {
    const { access_token, user } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, access_token);
    setSession({ access_token, user });
    return { user, accountType: user.account_type };
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!session,
        ready: !sessionLoading,
        session,
        user: session?.user ?? null,
        profile: session?.user ?? null,
        accountType: session?.user?.account_type ?? "user",
        login,
        signup,
        logout,
        refreshProfile,
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
