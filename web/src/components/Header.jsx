import { Link, NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import NavUserMenu from "./NavUserMenu";
import { brand, nav, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

// 홈 화면을 포함한 모든 페이지가 공유하는 단일 상단 네비게이션.
// (예전엔 홈만 상단 가로 메뉴, 나머지 페이지는 왼쪽 사이드바를 썼는데 전부 이걸로 통일한다.)
export default function Header() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => {
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Icon name="sparkle" className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-900">{brand.name}</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {nav.top.map((item) => {
            const locked = item.requiresAuth && !isLoggedIn;
            if (locked) {
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={goToLogin}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600"
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
                    isActive ? "text-brand-700" : "text-slate-500 hover:text-slate-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <NavUserMenu />
    </header>
  );
}
