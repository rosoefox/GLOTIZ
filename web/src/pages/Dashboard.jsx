import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Package,
  Briefcase,
  ArrowRight,
  Search,
  FileText,
  FlaskConical,
  Cpu,
  UtensilsCrossed,
  Grid2x2,
} from "lucide-react";
import BaseIcon from "../components/Icon";
import Header from "../components/Header";
import FloatingChatbot from "../components/FloatingChatbot";
import { brand, dashboard, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { periodEndDate as sharedPeriodEndDate, formatTodayKorean } from "../lib/period";
import jeonbukLogo from "../assets/jeonbuk-logo.svg";

// 홈 화면 전용으로 단순하고 깔끔한 라인 아이콘(lucide)을 쓰고, 다른 페이지가 함께 쓰는
// components/Icon.jsx는 건드리지 않도록 이 페이지 안에서만 이름을 덮어써서 렌더링한다.
const HOME_ICONS = {
  sparkle: Sparkles,
  box: Package,
  projects: Briefcase,
  arrowRight: ArrowRight,
  search: Search,
  documents: FileText,
  formulation: FlaskConical,
  electronics: Cpu,
  food: UtensilsCrossed,
  grid: Grid2x2,
};

function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }) {
  const Cmp = HOME_ICONS[name];
  if (Cmp) return <Cmp className={className} strokeWidth={strokeWidth} />;
  return <BaseIcon name={name} className={className} strokeWidth={strokeWidth} />;
}

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

function periodEndDate(business) {
  return sharedPeriodEndDate(business, govAnnouncementDetails);
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

function StatItem({ stat, compact = false }) {
  const display = useCountUp(stat.value, { decimals: stat.decimals });
  return (
    <div className="flex flex-col">
      <span className={`font-extrabold text-brand-700 ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>
        {display}
        <span className={`ml-0.5 font-bold text-brand-500 ${compact ? "text-sm" : "text-lg"}`}>{stat.suffix}</span>
      </span>
      <span className={`mt-1 text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>{stat.label}</span>
    </div>
  );
}

// star.png는 투명 배경 위 흰색 별 아이콘이라 흰 배경 카드 위에서는 안 보인다. alpha 채널을
// CSS mask로 써서 amber/회색으로 칠해서 쓴다. 채워진 별은 윤곽선(star.png) 안쪽을 채운
// star-filled.png를, 빈 별은 원본 윤곽선을 그대로 쓴다.
function ReviewStars({ rating }) {
  return (
    <div className="mb-3 flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => {
        const filled = idx < rating;
        return (
          <span
            key={idx}
            className={`inline-block h-3.5 w-3.5 bg-center bg-no-repeat ${filled ? "bg-amber-400" : "bg-slate-200"}`}
            style={{
              WebkitMaskImage: `url(${filled ? "/star-filled.png" : "/star.png"})`,
              maskImage: `url(${filled ? "/star-filled.png" : "/star.png"})`,
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "contain",
              maskSize: "contain",
            }}
          />
        );
      })}
    </div>
  );
}

const EMPTY_MY_APPLICATION_STATS = { total: 0, drafting: 0, reviewing: 0, reviewed: 0, closed: 0 };

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const [itemFilter, setItemFilter] = useState(dashboard.itemCategories[0].id);
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
        const end = periodEndDate(b);
        if (!end) return false;
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

  // "내가 지원한 공고 현황": 로그인한 사용자가 서류를 하나라도 제출한 사업(공고)들을
  // 진행 단계별로 센다 — 아직 전부 제출 못했으면 서류작성중, 전부 제출했지만 검토가 안
  // 끝났으면 심사진행중, 전부 검토(승인/보완요청)까지 끝났으면 심사완료. 마감건수는 그
  // 공고들 중 접수 마감일이 이미 지난 건수를 별도로 센다.
  const [myAppStats, setMyAppStats] = useState(EMPTY_MY_APPLICATION_STATS);

  useEffect(() => {
    if (!isLoggedIn || !user?.id) {
      setMyAppStats(EMPTY_MY_APPLICATION_STATS);
      return;
    }
    let cancelled = false;
    async function loadMyApplicationStatus() {
      const { data: mySubs } = await supabase
        .from("submissions")
        .select("template_id,review_status")
        .eq("user_id", user.id);

      const templateIds = [...new Set((mySubs || []).map((s) => s.template_id))];
      if (!templateIds.length) {
        if (!cancelled) setMyAppStats(EMPTY_MY_APPLICATION_STATS);
        return;
      }

      const { data: myTemplates } = await supabase
        .from("templates")
        .select("id,business_id")
        .in("id", templateIds);
      const businessIdByTemplate = Object.fromEntries((myTemplates || []).map((t) => [t.id, t.business_id]));
      const businessIds = [...new Set(Object.values(businessIdByTemplate))];

      const [{ data: allTemplates }, { data: bizRows }] = await Promise.all([
        supabase.from("templates").select("id,business_id").in("business_id", businessIds),
        supabase.from("businesses").select("id,basic_info").in("id", businessIds),
      ]);

      const totalByBusiness = {};
      (allTemplates || []).forEach((t) => {
        totalByBusiness[t.business_id] = (totalByBusiness[t.business_id] || 0) + 1;
      });

      const submittedByBusiness = {};
      const reviewStatusesByBusiness = {};
      (mySubs || []).forEach((s) => {
        const bizId = businessIdByTemplate[s.template_id];
        if (!bizId) return;
        (submittedByBusiness[bizId] ??= new Set()).add(s.template_id);
        (reviewStatusesByBusiness[bizId] ??= []).push(s.review_status);
      });

      const bizById = Object.fromEntries((bizRows || []).map((b) => [b.id, b]));
      const now = new Date();

      let drafting = 0;
      let reviewing = 0;
      let reviewed = 0;
      let closed = 0;

      businessIds.forEach((bizId) => {
        const done = submittedByBusiness[bizId]?.size || 0;
        const total = totalByBusiness[bizId] || 0;
        if (total === 0 || done < total) {
          drafting += 1;
        } else {
          const statuses = reviewStatusesByBusiness[bizId] || [];
          const allReviewed = statuses.every((rs) => rs === "approved" || rs === "needs_revision");
          if (allReviewed) reviewed += 1;
          else reviewing += 1;
        }

        const end = periodEndDate(bizById[bizId] || { id: bizId });
        if (end && end < now) closed += 1;
      });

      if (!cancelled) {
        setMyAppStats({ total: businessIds.length, drafting, reviewing, reviewed, closed });
      }
    }
    loadMyApplicationStatus();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.id]);

  const goToLogin = () => {
    navigate("/login");
  };

  const goToProgram = (id) => {
    navigate("/gov-support", { state: { highlightId: id } });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <Header />

      <div className="flex-1 snap-y snap-proximity overflow-y-auto scroll-smooth">
        {/* 1: 인사말 + 통계 (검색창 제거, 두 섹션을 하나로 병합) */}
        <section className="flex min-h-full w-full snap-start flex-col items-center justify-center bg-[#deecfb] px-6 py-16">
          <div className="w-full max-w-5xl text-center">
            <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              {dashboard.greetingTitle}
            </h1>
            <p className="mt-4 text-lg font-medium text-brand-600">{dashboard.greetingSubtitle}</p>

            <div ref={statsRef} className="mx-auto mt-12 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-8 sm:py-6">
              <p className="mb-4 text-xs font-bold text-slate-500">
                {dashboard.statsHeadline}
                <span className="ml-2 font-normal text-slate-400">({formatTodayKorean()} 기준)</span>
              </p>
              <div key={statsReplayKey} className="grid grid-cols-2 gap-y-4 divide-slate-100 sm:grid-cols-4 sm:gap-y-0 sm:divide-x">
                {dashboard.stats.map((s) => (
                  <div key={s.label} className="px-1 sm:px-4">
                    <StatItem stat={s} compact />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2: 지원사업공고 — 왼쪽 박스를 위(내가 지원한 공고 현황)/아래(지원사업공고)로 반반 나누고, 오른쪽엔 진행중인 지원사업 */}
        <section className="min-h-full w-full snap-start bg-white px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white md:col-span-2">
                <div className="relative p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{dashboard.myApplicationStatusTitle}</h3>
                    <span className="text-[11px] text-slate-400">({formatTodayKorean()} 기준)</span>
                  </div>
                  <div
                    className={`grid grid-cols-3 gap-2 ${
                      !isLoggedIn ? "pointer-events-none select-none blur-sm" : ""
                    }`}
                  >
                    {dashboard.myApplicationStats.map((s) => (
                      <div key={s.key} className="rounded-lg bg-slate-50 px-2 py-3 text-center">
                        <p className="text-lg font-extrabold text-brand-700">
                          {myAppStats[s.key] || 0}
                          <span className="ml-0.5 text-[10px] font-normal text-slate-500">건</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {!isLoggedIn && (
                    <button
                      type="button"
                      onClick={goToLogin}
                      className="absolute inset-0 flex items-center justify-center bg-white/50 text-sm font-bold text-brand-700 hover:bg-white/60"
                    >
                      {dashboard.myApplicationLoginGateLabel}
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-100 p-6">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{dashboard.announcementsLabel}</h3>
                    <span className="text-[11px] text-slate-400">({formatTodayKorean()} 기준)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {programStats.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => navigate("/gov-support")}
                        className="flex w-full items-center justify-between py-2.5 text-sm text-slate-600 transition-colors hover:text-brand-600"
                      >
                        <span className="font-medium">{s.label}</span>
                        <span className="text-base font-bold text-brand-600">
                          {s.count}
                          <span className="ml-0.5 text-xs font-normal text-slate-500">건</span>
                        </span>
                      </button>
                    ))}
                  </div>
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
        </section>

        {/* 3: JB-XPORT로 서류 작성/디자인 고민을 해결해보세요! */}
        <section className="flex min-h-full w-full snap-start flex-col items-center justify-center bg-slate-50 px-6 py-16">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-bold text-slate-900">{dashboard.featuresTitle}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              {dashboard.featuresDescription}
            </p>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {dashboard.features.map((f) => (
                <Link
                  key={f.title}
                  to={f.to}
                  className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center transition-shadow hover:shadow-md"
                >
                  <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${FEATURE_TONES[f.tone]}`}>
                    <Icon name={f.icon} className="h-7 w-7" />
                  </div>
                  <p className="mb-1.5 text-base font-bold text-slate-900">{f.title}</p>
                  <p className="mb-4 text-sm leading-relaxed text-slate-500">{f.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    {f.linkLabel}
                    <Icon name="arrowRight" className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* 4: AI · 디자인 진행 사례 */}
        <section className="flex min-h-full w-full snap-start flex-col items-center justify-center bg-black px-6 py-16">
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
                      onMouseEnter={() => {
                        if (!c.image) return;
                        setHoverPreview({ image: c.image, title: c.title });
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
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
              <img
                src={hoverPreview.image}
                alt={hoverPreview.title}
                referrerPolicy="no-referrer"
                className="max-h-[80vh] max-w-[90vw] rounded-xl border border-white/10 object-contain shadow-2xl sm:max-w-[480px]"
              />
            </div>
          )}
        </section>

        {/* 5: 소상공인 · 공공기관의 이유있는 선택 */}
        <section className="flex min-h-full w-full snap-start flex-col items-center justify-center bg-[#067ff8] px-6 py-16">
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
          </div>
        </section>

        {/* 6: 품목별 지원사업 공고 */}
        <section className="min-h-full w-full snap-start bg-white px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-6 text-center text-xl font-bold text-slate-900">{dashboard.itemCategoriesTitle}</h2>

            <div className="mb-8 flex flex-wrap justify-center gap-2">
              {dashboard.itemCategories.map((c) => (
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
                  <Icon name={c.icon} className="h-4 w-4" />
                  {c.label}
                </button>
              ))}
            </div>

            {loadingOngoing ? (
              <p className="text-center text-sm text-slate-400">불러오는 중...</p>
            ) : businesses.length === 0 ? (
              <p className="text-center text-sm text-slate-400">등록된 지원사업이 아직 없어요.</p>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {businesses.slice(0, 6).map((p) => (
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
        </section>

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
      </div>

      <FloatingChatbot />
    </div>
  );
}
