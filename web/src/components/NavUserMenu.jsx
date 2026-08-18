import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../data/mockData";
import { supabase } from "../lib/supabase";
import { Button } from "./ui";

export default function NavUserMenu({ light = false, mobile = false, onNavigate }) {
  const { isLoggedIn, logout, user } = useAuth();
  const navigate = useNavigate();
  const [needsRevisionCount, setNeedsRevisionCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setNeedsRevisionCount(0);
      return;
    }
    let cancelled = false;
    const loadCount = () => {
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("review_status", "needs_revision")
        .then(({ count }) => {
          if (!cancelled) setNeedsRevisionCount(count || 0);
        });
    };
    loadCount();
    const channel = supabase
      .channel(`nav-submissions-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions", filter: `user_id=eq.${user.id}` }, loadCount)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleMyPageClick = () => {
    onNavigate?.();
    if (!isLoggedIn) {
      window.alert(login.requiredMessage);
      navigate("/login");
      return;
    }
    navigate("/mypage");
  };

  const handleMyApplicationsClick = () => {
    onNavigate?.();
    if (!isLoggedIn) {
      window.alert(login.requiredMessage);
      navigate("/login");
      return;
    }
    navigate("/my-applications");
  };

  const handleLogout = () => {
    onNavigate?.();
    logout();
    navigate("/");
  };

  const handleLoginClick = () => {
    onNavigate?.();
    navigate("/login");
  };

  // 좁은 화면에서는 헤더 안에 한 줄로 우겨넣으면 넘치므로, 햄버거 메뉴 패널 안에서
  // 세로로 쌓이는 형태로 렌더링한다 (같은 상태/핸들러를 재사용).
  if (mobile) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleMyApplicationsClick}
          className="rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          나의 지원사업 현황
        </button>
        <button
          type="button"
          onClick={handleMyPageClick}
          className="relative rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          마이페이지
          {needsRevisionCount > 0 && (
            <span className="animate-blink absolute right-3 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
        </button>
        <div className="mt-1.5">
          {isLoggedIn ? (
            <Button type="button" variant="secondary" onClick={handleLogout} className="w-full justify-center">
              로그아웃
            </Button>
          ) : (
            <Button type="button" onClick={handleLoginClick} className="w-full justify-center">
              로그인
            </Button>
          )}
        </div>
      </div>
    );
  }

  const linkCls = light ? "hover:text-white" : "hover:text-slate-900";
  const actionCls =
    "inline-flex w-[6.5rem] items-center justify-center rounded-lg px-2.5 py-1 text-[13px] font-semibold leading-none transition-colors whitespace-nowrap";
  const authCls =
    "inline-flex w-[4.8rem] items-center justify-center rounded-lg border px-2 py-1 text-[13px] font-semibold leading-none transition-colors whitespace-nowrap";

  return (
    <div className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${light ? "text-white/90" : "text-slate-600"}`}>
      <button type="button" onClick={handleMyApplicationsClick} className={`${actionCls} ${linkCls}`}>
        나의 지원사업 현황
      </button>
      <span className={`px-0.5 ${light ? "text-white/40" : "text-slate-300"}`}>|</span>
      <button type="button" onClick={handleMyPageClick} className={`relative ${actionCls} ${linkCls}`}>
        마이페이지
        {needsRevisionCount > 0 && (
          <span className="animate-blink absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
        )}
      </button>
      <span className={`px-0.5 ${light ? "text-white/40" : "text-slate-300"}`}>|</span>
      {isLoggedIn ? (
        <Button
          type="button"
          variant="secondary"
          onClick={handleLogout}
          className={`${authCls} ${light ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          로그아웃
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate("/login")}
          className={`${authCls} ${light ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          로그인
        </Button>
      )}
    </div>
  );
}
