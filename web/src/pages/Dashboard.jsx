<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
=======
import { useEffect, useMemo, useRef, useState } from "react";
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
import { Link, NavLink, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import SearchBar from "../components/SearchBar";
import FloatingChatbot from "../components/FloatingChatbot";
import { brand, dashboard, nav, login, govSupport } from "../data/mockData";
import { CATEGORIES } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";
<<<<<<< HEAD
=======
import { supabase } from "../lib/supabase";
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
import jeonbukLogo from "../assets/jeonbuk-logo.svg";

const CATEGORY_ICONS = {
  cosmetics: "sparkle",
  food: "food",
  electronics: "electronics",
  fashion: "fashion",
  household: "box",
};

<<<<<<< HEAD
=======
const FEATURE_TONES = {
  cream: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
  mint: "bg-emerald-50 text-emerald-600",
};

const CASE_TONES = {
  sunrise: "from-amber-300 to-orange-400",
  forest: "from-emerald-300 to-teal-400",
  ocean: "from-sky-300 to-blue-400",
  grape: "from-violet-300 to-purple-400",
};

>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

<<<<<<< HEAD
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
=======
// 통계 영역이 뷰포트에 들어올 때마다(재진입 포함) 카운트업이 다시 시작되도록 key를 바꿔준다.
function useReplayOnView(threshold = 0.4) {
  const ref = useRef(null);
  const [replayKey, setReplayKey] = useState(0);
  const wasVisible = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !wasVisible.current) {
          wasVisible.current = true;
          setReplayKey((k) => k + 1);
        } else if (!entry.isIntersecting) {
          wasVisible.current = false;
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, replayKey];
}

function useCountUp(target, { duration = 1500, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let startTs;
    let raf;
    function tick(ts) {
      if (startTs === undefined) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      setValue(target * progress);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString();
}

function StatItem({ stat }) {
  const display = useCountUp(stat.value, { decimals: stat.decimals });
  return (
    <div className="flex flex-col">
      <span className="text-3xl font-extrabold text-brand-700 sm:text-4xl">
        {display}
        <span className="ml-0.5 text-lg font-bold text-brand-500">{stat.suffix}</span>
      </span>
      <span className="mt-1 text-sm text-slate-500">{stat.label}</span>
    </div>
  );
}

function ReviewStars({ rating }) {
  return (
    <div className="mb-3 flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => (
        <Icon
          key={idx}
          name="sparkle"
          className={`h-3.5 w-3.5 ${idx < rating ? "text-amber-400" : "text-slate-200"}`}
        />
      ))}
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const [itemFilter, setItemFilter] = useState("all");

<<<<<<< HEAD
=======
  const [statsRef, statsReplayKey] = useReplayOnView();

  const [ongoingPrograms, setOngoingPrograms] = useState([]);
  const [loadingOngoing, setLoadingOngoing] = useState(true);

  useEffect(() => {
    async function loadOngoing() {
      setLoadingOngoing(true);
      const { data } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setOngoingPrograms(data || []);
      setLoadingOngoing(false);
    }
    loadOngoing();
  }, []);

>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
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
<<<<<<< HEAD
            <img src={jeonbukLogo} alt="전북특별자치도" className="h-7 w-auto" />
=======
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
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

<<<<<<< HEAD
      <div className="flex flex-col items-center px-6 pb-12 pt-16">
=======
      <div className="flex w-full flex-col items-center bg-[#deecfb] px-6 pb-12 pt-16">
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
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
<<<<<<< HEAD
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
=======
              className="rounded-full border border-white/40 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
            >
              {item.label}
            </button>
          ))}
        </div>
<<<<<<< HEAD

        <p className="mt-8 text-sm text-slate-500">
          신청 가능한 지원사업{" "}
          <span className="text-slate-400">({formatTodayKorean()} 기준)</span>{" "}
          <span className="text-lg font-extrabold text-brand-600">
            {dashboard.availablePrograms.toLocaleString()}건
          </span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 pb-20">
=======
      </div>

      <div ref={statsRef} className="mx-auto w-full max-w-5xl px-6 pt-10">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-7 shadow-sm sm:px-10">
          <p className="mb-6 text-sm font-bold text-slate-500">
            {dashboard.statsHeadline}
            <span className="ml-2 font-normal text-slate-400">({formatTodayKorean()} 기준)</span>
          </p>
          <div key={statsReplayKey} className="grid grid-cols-2 gap-y-6 divide-slate-100 sm:grid-cols-4 sm:gap-y-0 sm:divide-x">
            {dashboard.stats.map((s) => (
              <div key={s.label} className="px-1 sm:px-6">
                <StatItem stat={s} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
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

<<<<<<< HEAD
          <div className="md:col-span-3">
            <ProgramCardNews items={govSupport.projects} onSelect={goToProgram} />
=======
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:col-span-3">
            <h3 className="mb-2 text-base font-bold text-slate-900">{dashboard.ongoingProgramsTitle}</h3>
            {loadingOngoing ? (
              <p className="py-6 text-sm text-slate-400">불러오는 중...</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {ongoingPrograms.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => goToProgram(b.id)}
                    className="group -mx-2 flex w-full items-center justify-between gap-4 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-brand-50"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                        <Icon name="projects" className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-400">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 transition-colors group-hover:bg-white group-hover:text-brand-600">
                            모집중
                          </span>
                          <span>전북특별자치도</span>
                        </div>
                        <p className="truncate text-sm font-bold leading-snug text-slate-900 transition-colors group-hover:text-brand-700">
                          {b.name}
                        </p>
                      </div>
                    </div>
                    <Icon
                      name="arrowRight"
                      className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600"
                    />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate("/gov-support")}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
            >
              {dashboard.ongoingProgramsMoreLabel}
              <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </button>
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
          </div>
        </div>
      </div>

<<<<<<< HEAD
      <div className="w-full bg-slate-50 px-6 py-20">
=======
      <div className="w-full bg-white px-6 py-20">
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-slate-900">{dashboard.featuresTitle}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            {dashboard.featuresDescription}
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {dashboard.features.map((f) => (
<<<<<<< HEAD
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Icon name={f.icon} className="h-5 w-5" />
                </div>
                <p className="mb-1.5 text-base font-bold text-slate-900">{f.title}</p>
                <p className="text-sm leading-relaxed text-slate-500">{f.description}</p>
=======
              <div key={f.title} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${FEATURE_TONES[f.tone]}`}>
                  <Icon name={f.icon} className="h-7 w-7" />
                </div>
                <p className="mb-1.5 text-base font-bold text-slate-900">{f.title}</p>
                <p className="mb-4 text-sm leading-relaxed text-slate-500">{f.description}</p>
                <Link
                  to={f.to}
                  className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
                >
                  {f.linkLabel}
                  <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </Link>
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
              </div>
            ))}
          </div>
        </div>
<<<<<<< HEAD

        <div className="mx-auto mt-16 max-w-5xl">
=======
      </div>

      <div className="w-full bg-black px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-white">{dashboard.caseStudiesTitle}</h2>
            <p className="mt-2 text-sm text-slate-300">{dashboard.caseStudiesDescription}</p>
          </div>

          {[
            dashboard.caseStudies.slice(0, Math.ceil(dashboard.caseStudies.length / 2)),
            dashboard.caseStudies.slice(Math.ceil(dashboard.caseStudies.length / 2)),
          ].map((row, rowIdx) => (
            <div
              key={rowIdx}
              className={`overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] ${rowIdx === 1 ? "mt-5" : ""}`}
            >
              <div className="flex w-max gap-5 animate-marquee hover:[animation-play-state:paused]">
                {[...row, ...row].map((c, idx) => (
                  <div
                    key={`${c.id}-${idx}`}
                    className="w-64 shrink-0 cursor-default transition-transform duration-300 ease-out hover:-translate-y-2"
                  >
                    <div
                      className={`flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ${CASE_TONES[c.tone]}`}
                    >
                      <Icon name={c.icon} className="h-12 w-12 text-white" strokeWidth={1.3} />
                    </div>
                    <p className="mt-3 text-xs font-bold text-brand-100">{c.tag}</p>
                    <p className="mt-1 text-sm font-bold leading-snug text-white">{c.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full bg-[#067ff8] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <p className="mb-3 text-sm font-bold text-white">고객 만족도 {dashboard.satisfactionRate}%</p>
            <h2 className="text-2xl font-bold text-white">{dashboard.satisfactionTitle}</h2>
          </div>

          <div className="overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
            <div className="flex w-max gap-5 animate-marquee-reverse hover:[animation-play-state:paused]">
              {[...dashboard.reviews, ...dashboard.reviews].map((r, idx) => (
                <div
                  key={`${r.name}-${idx}`}
                  className="w-80 shrink-0 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-lg transition-transform duration-300 ease-out hover:-translate-y-2"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <ReviewStars rating={r.rating} />
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                      {r.rating.toFixed(1)}점
                    </span>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-slate-600">&ldquo;{r.text}&rdquo;</p>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {r.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{r.name}</p>
                      <p className="text-[11px] text-slate-400">{r.company}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate("/gov-support")}
              className="text-sm font-semibold text-white hover:underline"
            >
              {dashboard.reviewMoreLabel} ({dashboard.reviewTotalCount.toLocaleString()}건)
            </button>
          </div>
        </div>
      </div>

      <div className="w-full bg-white px-6 py-20">
        <div className="mx-auto max-w-5xl">
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
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

<<<<<<< HEAD
=======
      <footer className="w-full border-t border-slate-100 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Icon name="sparkle" className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-bold text-slate-900">{brand.name}</span>
            <img src={jeonbukLogo} alt="전북특별자치도" className="h-6 w-auto" />
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
        </div>
      </footer>

>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
      <FloatingChatbot />
    </div>
  );
}
