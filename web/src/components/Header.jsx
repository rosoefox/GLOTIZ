import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import NavUserMenu from "./NavUserMenu";
import { brand, nav, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import logoImage from "../../로고.png";

// 홈 화면을 포함한 모든 페이지가 공유하는 단일 상단 네비게이션.
// (예전엔 홈만 상단 가로 메뉴, 나머지 페이지는 왼쪽 사이드바를 썼는데 전부 이걸로 통일한다.)
//
// overlay=true (홈 화면 히어로 전용): 처음엔 투명한 배경으로 이미지 위에 떠 있다가,
// 스크롤(scrolled prop)하거나 마우스를 올리면 부드럽게 불투명+블러 배경으로 전환된다.
// 다른 페이지는 overlay를 안 넘기므로 기존과 동일하게 항상 불투명한 흰 배경을 쓴다.
export default function Header({ overlay = false, scrolled = false }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const solid = !overlay || scrolled || hovered;
  const transparent = overlay && !solid;

  const goToLogin = () => {
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  return (
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex h-16 shrink-0 items-center justify-between px-6 transition-all duration-300 ${
        overlay ? "fixed inset-x-0 top-0 z-40" : "relative"
      } ${
        solid
          ? "border-b border-slate-100 bg-white/95 backdrop-blur-md shadow-sm"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Link to="/" className="flex items-center gap-3">
        <img src={brand.logo || logoImage} alt={brand.name} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
        <span className={`text-sm font-bold transition-colors ${transparent ? "text-white" : "text-slate-900"}`}>
          {brand.name}
        </span>
      </Link>

      {/* 메뉴는 좌우 요소 너비와 무관하게 헤더 정중앙에 오도록 절대 위치로 고정한다. */}
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
        {nav.top.map((item) => {
          const locked = item.requiresAuth && !isLoggedIn;
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
                <Icon name="lock" className="h-3 w-3" />
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

      <NavUserMenu light={transparent} />
    </header>
  );
}
