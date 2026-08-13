import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState(undefined); // undefined = 아직 조회 전

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
    // sessionLoading이 끝나기 전에는 session이 아직 확정되지 않은 상태라
    // profile을 섣불리 null로 정리하면 "세션은 확인됐지만 프로필은 이전
    // 비로그인 상태의 null이 남아있는" 찰나에 ready=true / accountType="user"로
    // 잘못 판정되어 관리자가 새로고침 시 일반 사용자 화면으로 튕기는 문제가 생긴다.
    if (sessionLoading) return;
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
  }, [session?.user?.id, sessionLoading]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile(data);
  };

  const signup = async ({ email, password, loginId, name, phone, company, categoryId, country, accountType = "user" }) => {
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
          account_type: accountType,
        },
      },
    });
    if (error) throw error;
    return data;
  };

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", data.user.id)
      .maybeSingle();
    return { ...data, accountType: profileRow?.account_type ?? "user" };
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
