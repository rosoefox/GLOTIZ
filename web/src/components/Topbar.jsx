import { NavLink, Link, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { nav, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function Topbar({ showSearch = true }) {
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => {
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
      <nav className="flex items-center gap-6">
        {nav.top.map((item) => {
          const locked = item.requiresAuth && !isLoggedIn;

          if (locked) {
            return (
              <button
                key={item.path}
                type="button"
                onClick={goToLogin}
                className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-400 hover:bg-slate-200"
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

      <div className="flex items-center gap-4">
        {showSearch && (
          <div className="relative hidden md:block">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="검색..."
              className="w-56 rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <Link to="/mypage" className="flex items-center gap-2.5 hover:opacity-80">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {user.name[0]}
              </div>
              <span className="text-sm font-semibold text-slate-800">마이페이지</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
