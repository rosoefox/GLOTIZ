import { NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { brand, nav, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => {
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6">
      <div className="mb-8 flex items-center gap-2 px-1">
        <NavLink
          to="/"
          aria-label="홈으로 이동"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="home" className="h-5 w-5" />
        </NavLink>
        <NavLink to="/" className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon name="sparkle" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight text-slate-900">{brand.name}</p>
            <p className="truncate text-xs text-slate-500">{brand.tagline}</p>
          </div>
        </NavLink>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {nav.sidebar.map((item) => {
          const locked = item.requiresAuth && !isLoggedIn;

          if (locked) {
            return (
              <button
                key={item.path}
                type="button"
                onClick={goToLogin}
                className="flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-medium text-slate-400 hover:bg-slate-200"
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
                <Icon name="lock" className="ml-auto h-3.5 w-3.5" />
              </button>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon name={item.icon} className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => (isLoggedIn ? navigate("/mypage") : goToLogin())}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-900"
        >
          <Icon name="user" className="h-4 w-4" />
          나의 기본정보
        </button>

        <div className="my-1 border-t border-slate-200" />

        {nav.bottom.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
        <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-100">
          <Icon name="settings" className="h-5 w-5" />
          설정
        </button>
      </div>
    </aside>
  );
}
