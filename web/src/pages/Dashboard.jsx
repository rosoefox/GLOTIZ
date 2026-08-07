import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import SearchBar from "../components/SearchBar";
import FloatingChatbot from "../components/FloatingChatbot";
import { brand, dashboard, nav, login, govSupport } from "../data/mockData";
import { CATEGORIES } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";
import jeonbukLogo from "../assets/jeonbuk-logo.svg";

const CATEGORY_ICONS = {
  cosmetics: "sparkle",
  food: "food",
  electronics: "electronics",
  fashion: "fashion",
  household: "box",
};

function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

function ProgramCardNews({ items, onSelect }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || items.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 20000);
    return () => clearInterval(id);
  }, [playing, items.length]);

  if (!items.length) return null;
  const current = items[index % items.length];

  return (
    <div className="flex h-full min-h-[260px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-600 to-brand-900 text-white">
      <button
        type="button"
        onClick={() => onSelect(current.id)}
        className="flex flex-1 flex-col justify-center px-8 py-10 text-left transition-opacity hover:opacity-90"
      >
        <span className="mb-4 inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          {current.category}
        </span>
        <h3 className="text-2xl font-bold leading-snug">{current.title}</h3>
        <p className="mt-3 text-sm text-white/80">
          마감일 {current.deadline} · {current.dday}
        </p>
      </button>

      <div className="flex items-center justify-center gap-6 border-t border-white/10 bg-black/10 py-3">
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
          aria-label="이전 공고"
          className="text-white/80 hover:text-white"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "일시정지" : "재생"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % items.length)}
          aria-label="다음 공고"
          className="text-white/80 hover:text-white"
        >
          <Icon name="arrowRight" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const [itemFilter, setItemFilter] = useState("all");

  const handleSearch = (query) => {
    if (!query) return;
    navigate("/analysis", { state: { query } });
  };

  const handleImageSearch = (file) => {
    navigate("/analysis", { state: { query: file.name.replace(/\.[^/.]+$/, ""), imageSearch: true } });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const goToLogin = () => {
    window.alert(login.requiredMessage);
    navigate("/login");
  };

  const goToProgram = (id) => {
    navigate("/gov-support", { state: { highlightId: id } });
  };

  const filteredPrograms = useMemo(() => {
    if (itemFilter === "all") return govSupport.projects;
    return govSupport.projects.filter((p) => p.matchCategories?.includes(itemFilter));
  }, [itemFilter]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Icon name="sparkle" className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-900">{brand.name}</span>
            <img src={jeonbukLogo} alt="전북특별자치도" className="h-7 w-auto" />
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
      </header>

      <div className="flex flex-col items-center px-6 pb-12 pt-16">
        <SearchBar
          heading={dashboard.greetingTitle}
          subtitle={dashboard.greetingSubtitle}
          placeholder={dashboard.searchPlaceholder}
          onSearch={handleSearch}
          onImageSearch={handleImageSearch}
        />

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {[...dashboard.recentSearches, ...dashboard.popularKeywords].map((item) => (
            <button
              key={item.label}
              onClick={() => handleSearch(item.query)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-500">
          신청 가능한 지원사업{" "}
          <span className="text-slate-400">({formatTodayKorean()} 기준)</span>{" "}
          <span className="text-lg font-extrabold text-brand-600">
            {dashboard.availablePrograms.toLocaleString()}건
          </span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:col-span-2">
            <h3 className="mb-4 text-center text-base font-bold text-slate-900">{dashboard.announcementsLabel}</h3>
            <div className="divide-y divide-slate-100">
              {dashboard.programStats.map((s) => (
                <button
                  key={s.label}
                  onClick={() => navigate("/gov-support")}
                  className="flex w-full items-center justify-between py-3.5 text-sm text-slate-600 transition-colors hover:text-brand-600"
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-lg font-bold text-brand-600">
                    {s.count}
                    <span className="ml-0.5 text-xs font-normal text-slate-500">건</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-3">
            <ProgramCardNews items={govSupport.projects} onSelect={goToProgram} />
          </div>
        </div>
      </div>

      <div className="w-full bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-slate-900">{dashboard.featuresTitle}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            {dashboard.featuresDescription}
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {dashboard.features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <p className="mb-1.5 text-base font-bold text-slate-900">{f.title}</p>
                <p className="text-sm leading-relaxed text-slate-500">{f.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <h2 className="mb-6 text-center text-xl font-bold text-slate-900">{dashboard.itemCategoriesTitle}</h2>

          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setItemFilter("all")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                itemFilter === "all"
                  ? "bg-brand-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {dashboard.itemCategoriesAll}
            </button>
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setItemFilter(c.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  itemFilter === c.id
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon name={CATEGORY_ICONS[c.id]} className="h-4 w-4" />
                {c.label}
              </button>
            ))}
          </div>

          {filteredPrograms.length === 0 ? (
            <p className="text-center text-sm text-slate-400">해당 품목에 적합한 지원사업이 아직 없어요.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {filteredPrograms.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => goToProgram(p.id)}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                      {p.category}
                    </span>
                    <span className={`text-xs font-semibold ${p.urgent ? "text-red-500" : "text-slate-400"}`}>
                      {p.dday}
                    </span>
                  </div>
                  <h4 className="mb-2 min-h-[2.5rem] text-sm font-bold leading-snug text-slate-900">{p.title}</h4>
                  <p className="mt-auto text-xs text-slate-500">마감일 {p.deadline}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <FloatingChatbot />
    </div>
  );
}
