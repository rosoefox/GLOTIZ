import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Lock,
  Package,
  Briefcase,
  ArrowRight,
  Search,
  FileText,
  FlaskConical,
  Cpu,
  UtensilsCrossed,
  Shirt,
} from "lucide-react";
import BaseIcon from "../components/Icon";
import SearchBar from "../components/SearchBar";
import FloatingChatbot from "../components/FloatingChatbot";
import { brand, dashboard, nav, login, govAnnouncementDetails } from "../data/mockData";
import { CATEGORIES } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import jeonbukLogo from "../assets/jeonbuk-logo.svg";

// 홈 화면 전용으로 단순하고 깔끔한 라인 아이콘(lucide)을 쓰고, 다른 페이지가 함께 쓰는
// components/Icon.jsx는 건드리지 않도록 이 페이지 안에서만 이름을 덮어써서 렌더링한다.
const HOME_ICONS = {
  sparkle: Sparkles,
  lock: Lock,
  box: Package,
  projects: Briefcase,
  arrowRight: ArrowRight,
  search: Search,
  documents: FileText,
  formulation: FlaskConical,
  electronics: Cpu,
  food: UtensilsCrossed,
  fashion: Shirt,
};

function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }) {
  const Cmp = HOME_ICONS[name];
  if (Cmp) return <Cmp className={className} strokeWidth={strokeWidth} />;
  return <BaseIcon name={name} className={className} strokeWidth={strokeWidth} />;
}

const CATEGORY_ICONS = {
  cosmetics: "sparkle",
  food: "food",
  electronics: "electronics",
  fashion: "fashion",
  household: "box",
};

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

function orgNameFor(business) {
  const detail = govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function matchesCategory(business, category) {
  const haystack = `${business.name} ${business.description || ""}`;
  return category.keywords.some((k) => haystack.includes(k)) || haystack.includes(category.label);
}

function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

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
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, profile, logout } = useAuth();
  const avatarInitial = (profile?.company || user?.email || "U")[0].toUpperCase();
  const [itemFilter, setItemFilter] = useState("all");
  const [hoverPreview, setHoverPreview] = useState(null);

  const [statsRef, statsReplayKey] = useReplayOnView();

  const [businesses, setBusinesses] = useState([]);
  const [loadingOngoing, setLoadingOngoing] = useState(true);

  useEffect(() => {
    async function loadOngoing() {
      setLoadingOngoing(true);
      // templates!inner: 서류 양식이 하나라도 업로드된 사업만 노출한다 (GovSupport.jsx와 동일한 규칙).
      const { data } = await supabase
        .from("businesses")
        .select("*, templates!inner(id)")
        .order("created_at", { ascending: false });
      setBusinesses(data || []);
      setLoadingOngoing(false);
    }
    loadOngoing();
  }, []);

  const ongoingPrograms = useMemo(() => businesses.slice(0, 5), [businesses]);

  const [programCounts, setProgramCounts] = useState({ latest: 0, deadlineSoon: 0, popular: 0 });

  useEffect(() => {
    if (!businesses.length) {
      setProgramCounts({ latest: 0, deadlineSoon: 0, popular: 0 });
      return;
    }

    let cancelled = false;
    async function loadCounts() {
      const now = new Date();

      const latest = businesses.filter((b) => {
        const days = (now - new Date(b.created_at)) / 86400000;
        return days <= 30;
      }).length;

      const deadlineSoon = businesses.filter((b) => {
        const detail = b.basic_info || govAnnouncementDetails[b.id];
        const endStr = detail?.period?.split("~")[1]?.trim();
        if (!endStr) return false;
        const end = new Date(endStr.replace(/\./g, "-"));
        const daysLeft = (end - now) / 86400000;
        return daysLeft >= 0 && daysLeft <= 14;
      }).length;

      // 인기공고: 실제로 신청(제출)이 한 건이라도 들어온 공고 수를 인기 지표로 쓴다.
      const businessIds = businesses.map((b) => b.id);
      const { data: templates } = await supabase
        .from("templates")
        .select("id,business_id")
        .in("business_id", businessIds);
      const businessByTemplate = Object.fromEntries((templates || []).map((t) => [t.id, t.business_id]));
      const templateIds = Object.keys(businessByTemplate);

      let popular = 0;
      if (templateIds.length) {
        const { data: submissions } = await supabase
          .from("submissions")
          .select("template_id")
          .in("template_id", templateIds);
        popular = new Set((submissions || []).map((s) => businessByTemplate[s.template_id])).size;
      }

      if (!cancelled) setProgramCounts({ latest, deadlineSoon, popular });
    }
    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [businesses]);

  const programStats = [
    { label: dashboard.programStats[0].label, count: programCounts.latest },
    { label: dashboard.programStats[1].label, count: programCounts.deadlineSoon },
    { label: dashboard.programStats[2].label, count: programCounts.popular },
  ];

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
    if (itemFilter === "all") return businesses;
    const category = CATEGORIES.find((c) => c.id === itemFilter);
    if (!category) return businesses;
    return businesses.filter((b) => matchesCategory(b, category));
  }, [businesses, itemFilter]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-6">
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

        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <Link to="/mypage" className="flex items-center gap-2.5 hover:opacity-80">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {avatarInitial}
              </div>
              <span className="text-sm font-semibold text-slate-800">마이페이지</span>
            </Link>
            <Link
              to={nav.exportStatus.path}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Icon name={nav.exportStatus.icon} className="h-4 w-4" />
              {nav.exportStatus.label}
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

      <div className="flex w-full flex-col items-center bg-[#deecfb] px-6 pb-24 pt-28">
        <SearchBar
          heading={dashboard.greetingTitle}
          subtitle={dashboard.greetingSubtitle}
          placeholder={dashboard.searchPlaceholder}
          onSearch={handleSearch}
          onImageSearch={handleImageSearch}
        />

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {[...dashboard.recentSearches, ...dashboard.popularKeywords].map((item) => (
            <button
              key={item.label}
              onClick={() => handleSearch(item.query)}
              className="rounded-full border border-white/40 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </div>
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
          <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 md:col-span-2">
            <h3 className="mb-4 text-center text-base font-bold text-slate-900">{dashboard.announcementsLabel}</h3>
            <div className="flex flex-1 flex-col justify-center divide-y divide-slate-100">
              {programStats.map((s) => (
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
          </div>
        </div>
      </div>

      <div className="w-full bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-slate-900">{dashboard.featuresTitle}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            {dashboard.featuresDescription}
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {dashboard.features.map((f) => (
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
              </div>
            ))}
          </div>
        </div>
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
                    onMouseMove={(e) => {
                      if (!c.image) return;
                      setHoverPreview({ image: c.image, title: c.title, x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoverPreview(null)}
                  >
                    {c.image ? (
                      <img
                        src={c.image}
                        alt={c.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-40 w-full rounded-2xl object-cover shadow-lg"
                      />
                    ) : (
                      <div
                        className={`flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ${CASE_TONES[c.tone]}`}
                      >
                        <Icon name={c.icon} className="h-12 w-12 text-white" strokeWidth={1.3} />
                      </div>
                    )}
                    <p className="mt-3 text-xs font-bold text-brand-100">{c.tag}</p>
                    <p className="mt-1 text-sm font-bold leading-snug text-white">{c.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {hoverPreview && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full pb-3"
            style={{ left: hoverPreview.x, top: hoverPreview.y }}
          >
            <img
              src={hoverPreview.image}
              alt={hoverPreview.title}
              referrerPolicy="no-referrer"
              className="max-h-[65vh] max-w-[320px] rounded-xl border border-white/10 object-contain shadow-2xl"
            />
          </div>
        )}
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

          {loadingOngoing ? (
            <p className="text-center text-sm text-slate-400">불러오는 중...</p>
          ) : filteredPrograms.length === 0 ? (
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
                  <span className="mb-3 w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    모집중
                  </span>
                  <h4 className="mb-2 min-h-[2.5rem] text-sm font-bold leading-snug text-slate-900">{p.name}</h4>
                  <p className="mt-auto text-xs text-slate-500">모집처 {orgNameFor(p)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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

      <FloatingChatbot />
    </div>
  );
}
