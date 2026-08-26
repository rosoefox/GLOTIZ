import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../data/mockData";
import { Button } from "./ui";
import { api } from "../lib/api";

export default function NavUserMenu({ light = false, mobile = false, onNavigate }) {
  const { isLoggedIn, session, logout } = useAuth();
  const navigate = useNavigate();
  const [needsRevisionCount, setNeedsRevisionCount] = useState(0);

  // 사용자가 "보완이 필요해요" 알림을 읽고 넘겨도, 실제로 그 서류를 고쳐서 다시 제출하기 전까지는
  // 상단 "나의 지원사업 현황"에 빨간 점이 계속 깜빡이게 해서 놓치지 않게 한다.
  useEffect(() => {
    if (!isLoggedIn || !session?.access_token) {
      setNeedsRevisionCount(0);
      return;
    }
    let cancelled = false;
    api
      .get("/submissions/needs-revision-count", session.access_token)
      .then(({ count }) => {
        if (!cancelled) setNeedsRevisionCount(count || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, session?.access_token]);

  const needsRevisionDot = needsRevisionCount > 0 && (
    <span className="h-2 w-2 shrink-0 animate-blink rounded-full bg-red-500" aria-label="보완 필요" />
  );

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
    const mobileLinkCls = light ? "text-white/90 hover:bg-white/10" : "text-slate-700 hover:bg-slate-50";
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleMyApplicationsClick}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${mobileLinkCls}`}
        >
          나의 지원사업 현황
          {needsRevisionDot}
        </button>
        <button
          type="button"
          onClick={handleMyPageClick}
          className={`relative rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${mobileLinkCls}`}
        >
          마이페이지
        </button>
        <div className="mt-1.5">
          {isLoggedIn ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleLogout}
              className={`w-full justify-center ${light ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : ""}`}
            >
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
      <button type="button" onClick={handleMyApplicationsClick} className={`${actionCls} ${linkCls} gap-1.5`}>
        나의 지원사업 현황
        {needsRevisionDot}
      </button>
      <span className={`px-0.5 ${light ? "text-white/40" : "text-slate-300"}`}>|</span>
      <button type="button" onClick={handleMyPageClick} className={`${actionCls} ${linkCls}`}>
        마이페이지
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
