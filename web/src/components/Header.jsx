import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import NavUserMenu from "./NavUserMenu";
import { brand, nav, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import logoImage from "../../로고최종1.png";

// 홈 화면을 포함한 모든 페이지가 공유하는 단일 상단 네비게이션.
// (예전엔 홈만 상단 가로 메뉴, 나머지 페이지는 왼쪽 사이드바를 썼는데 전부 이걸로 통일한다.)
//
// overlay=true (홈 화면 히어로 전용): 처음엔 투명한 배경으로 이미지 위에 떠 있다가,
// 스크롤(scrolled prop)하거나 마우스를 올리면 부드럽게 불투명+블러 배경으로 전환된다.
// 다른 페이지는 overlay를 안 넘기므로 기존과 동일하게 항상 불투명한 흰 배경을 쓴다.
export default function Header({ overlay = false, scrolled = false }) {
  const { isLoggedIn, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // 데스크톱: 펼쳐진 드롭다운의 path
  const [openAccordion, setOpenAccordion] = useState(null); // 모바일: 펼쳐진 아코디언의 path
  const dropdownRef = useRef(null);
  // 로그인 전이거나, 로그인했어도 신청한 공고가 아직 하나도 없으면 "수출지원사업"은 원래처럼
  // "/gov-support"로 바로 이동하는 단순 링크로 남는다 — 신청 이력이 생긴 뒤부터만 맞춤 공고/전체
  // 공고/작성 중인 서류로 갈라지는 드롭다운(모바일은 아코디언)을 보여준다.
  const [hasApplied, setHasApplied] = useState(false);

  const solid = !overlay || scrolled || hovered || mobileOpen;
  const transparent = overlay && !solid;

  useEffect(() => {
    if (!isLoggedIn || !session?.access_token) {
      setHasApplied(false);
      return;
    }
    let cancelled = false;
    api
      .get("/submissions", session.access_token)
      .then(({ submissions }) => {
        if (!cancelled) setHasApplied((submissions || []).length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, session?.access_token]);

  useEffect(() => {
    if (!openDropdown) return;
    const onClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdown(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openDropdown]);

  // "맞춤 공고 확인"/"전체 공고 확인"이 둘 다 to="/gov-support"라서, 경로만 보는 NavLink의
  // 기본 isActive로는 둘 다 동시에 "선택됨"으로 파랗게 뜬다 — 실제로 어느 화면인지는
  // location.state(skipAutoMatch)로만 구분되므로 그것까지 같이 비교해야 진짜 활성 메뉴만 표시된다.
  const isChildActive = (child) => {
    if (location.pathname !== child.path) return false;
    if (child.path === "/gov-support") {
      return Boolean(child.state?.skipAutoMatch) === Boolean(location.state?.skipAutoMatch);
    }
    return true;
  };

  const goToLogin = () => {
    setMobileOpen(false);
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  return (
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex h-16 shrink-0 items-center justify-between px-4 transition-all duration-300 sm:px-6 ${
        overlay ? "fixed inset-x-0 top-0 z-40" : "relative"
      } ${
        solid
          ? "border-b border-slate-100 bg-white/95 backdrop-blur-md shadow-sm"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Link to="/" className="flex min-w-0 shrink-0 items-center" onClick={() => setMobileOpen(false)}>
        {/* brand.logo(정사각 캔버스, 위아래 여백이 커서 작게 보임) 대신 이 헤더 전용으로 꽉 차게
            잘라낸 로고를 쓴다. 이미지 자체에 GLOTIZ 워드마크가 들어있어서 별도 텍스트 라벨은 없앴다.
            투명 헤더(홈 히어로 위에 뜬 상태)에서는 원본이 남색이라 어두운 배경에 묻히므로,
            흰색으로 반전시켜 배경 위에서도 잘 보이게 한다. */}
        <img
          src={logoImage}
          alt={brand.name}
          className={`h-9 w-auto shrink-0 object-contain transition sm:h-10 ${transparent ? "brightness-0 invert" : ""}`}
        />
      </Link>

      {/* 메뉴는 좌우 요소 너비와 무관하게 헤더 정중앙에 오도록 절대 위치로 고정한다. */}
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
        {nav.top.map((item) => {
          const locked = item.requiresAuth && !isLoggedIn;

          if (item.children && isLoggedIn && hasApplied) {
            const linkCls = transparent ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-slate-900";
            return (
              <div key={item.path} className="relative" ref={openDropdown === item.path ? dropdownRef : null}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown((p) => (p === item.path ? null : item.path))}
                  className={`text-sm font-medium transition-colors ${linkCls}`}
                >
                  {item.label}
                </button>
                {openDropdown === item.path && (
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-48 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    {item.children.map((child) => {
                      const childLocked = child.requiresAuth && !isLoggedIn;
                      if (childLocked) {
                        return (
                          <button
                            key={child.label}
                            type="button"
                            onClick={() => {
                              setOpenDropdown(null);
                              goToLogin();
                            }}
                            className="flex w-full items-center justify-between gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400 hover:bg-slate-50"
                          >
                            {child.label}
                            <Icon name="lock" className="w-3.5 h-3.5" />
                          </button>
                        );
                      }
                      return (
                        <Link
                          key={child.label}
                          to={child.path}
                          state={child.state}
                          onClick={() => setOpenDropdown(null)}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                            isChildActive(child) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (locked) {
            return (
              <button
                key={item.path}
                type="button"
                onClick={goToLogin}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  transparent ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {item.label}
                <Icon name="lock" className="w-3.5 h-3.5" />
              </button>
            );
          }
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  transparent
                    ? isActive
                      ? "text-white"
                      : "text-white/80 hover:text-white"
                    : isActive
                      ? "text-brand-700"
                      : "text-slate-500 hover:text-slate-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        <div className="hidden md:block">
          <NavUserMenu light={transparent} />
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={mobileOpen}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors md:hidden ${
            transparent ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <Icon name={mobileOpen ? "x" : "menu"} className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-100 bg-white shadow-lg md:hidden">
          <nav className="flex flex-col px-4 py-2">
            {nav.top.map((item) => {
              const locked = item.requiresAuth && !isLoggedIn;

              if (item.children && isLoggedIn && hasApplied) {
                const expanded = openAccordion === item.path;
                return (
                  <div key={item.path} className="border-b border-slate-50 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenAccordion((p) => (p === item.path ? null : item.path))}
                      className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-slate-700"
                    >
                      {item.label}
                      <Icon name="chevronDown" className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="flex flex-col gap-0.5 pb-2 pl-3">
                        {item.children.map((child) => {
                          const childLocked = child.requiresAuth && !isLoggedIn;
                          if (childLocked) {
                            return (
                              <button
                                key={child.label}
                                type="button"
                                onClick={goToLogin}
                                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-400"
                              >
                                {child.label}
                                <Icon name="lock" className="w-3.5 h-3.5" />
                              </button>
                            );
                          }
                          return (
                            <Link
                              key={child.label}
                              to={child.path}
                              state={child.state}
                              onClick={() => setMobileOpen(false)}
                              className={`rounded-lg px-2 py-2 text-sm font-medium ${
                                isChildActive(child) ? "text-brand-700" : "text-slate-600"
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (locked) {
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={goToLogin}
                    className="flex items-center gap-1.5 border-b border-slate-50 py-3 text-left text-sm font-medium text-slate-400 last:border-b-0"
                  >
                    {item.label}
                    <Icon name="lock" className="w-3.5 h-3.5" />
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `border-b border-slate-50 py-3 text-sm font-medium last:border-b-0 ${
                      isActive ? "text-brand-700" : "text-slate-700"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="border-t border-slate-100 px-4 py-3">
            <NavUserMenu mobile onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
