import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Header from "../components/Header";
import HeroOceanScene from "../components/HeroOceanScene";
import FloatingChatbot from "../components/FloatingChatbot";
import MaskedHeading from "../components/MaskedHeading";
import { brand, dashboard, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";
import {
  periodEndDate as sharedPeriodEndDate,
  periodStartDate as sharedPeriodStartDate,
  formatTodayKorean,
  isClosed as sharedIsClosed,
} from "../lib/period";

const footerLogoUrl = new URL("../../로고최종1.png", import.meta.url).href;

function periodEndDate(business) {
  return sharedPeriodEndDate(business, govAnnouncementDetails);
}

function periodStartDate(business) {
  return sharedPeriodStartDate(business, govAnnouncementDetails);
}

function isOngoing(business) {
  return !sharedIsClosed(business, govAnnouncementDetails);
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

// 섹션이 뷰포트에 들어오고 나갈 때마다 true/false를 토글한다 — 스태거 리빌 애니메이션이
// 지나쳐간 섹션으로 다시 스크롤해 돌아왔을 때도 매번 새로 재생되도록 한다.
function useSectionReveal(threshold = 0.35) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// MaskedHeading의 align prop은 인라인 textAlign이라 Tailwind의 md: 반응형 클래스로는 못
// 바꾼다 — 뷰포트 폭을 직접 추적해서, 모바일에서는 지그재그 우측 정렬 항목의 타이틀도 좌측
// 정렬로 강제로 통일한다(본문/설명/링크는 이미 Tailwind 클래스로 처리됨).
function useIsDesktop(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= breakpoint
  );
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isDesktop;
}

// 제목(H2)/본문(P)/버튼 요소에 공통으로 적용하는 스태거 리빌 스타일. index가 클수록
// 0.15초씩 늦게 나타나 순차적으로 아래에서 위로 올라오며 페이드인된다.
function revealCls(inView) {
  return `transition duration-500 ease-out ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`;
}
function revealStyle(index) {
  return { transitionDelay: `${index * 150}ms` };
}

// "3: 서비스 소개" Z-패턴 섹션 전용 Scroll Float 스타일 — 순번(0) → 타이틀(1) → 설명(2) →
// 액션 링크(3) 순서로 0.15초씩 늦게 나타난다(같은 tier는 3개 행이 동시에 뜬다). 다른 섹션의
// revealCls/revealStyle(ease-out, 24px)보다 더 크게 뜨고(45px) 더 부드럽게 감속하는
// cubic-bezier를 쓰기 때문에 공용 헬퍼를 그대로 쓰지 않고 이 섹션만 따로 둔다.
function floatStyle(tier, inView, extra) {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? "translateY(0)" : "translateY(45px)",
    transition: "opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
    transitionDelay: `${tier * 150}ms`,
    ...extra,
  };
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
      <span className="text-2xl font-extrabold text-white sm:text-3xl">
        {display}
        <span className="ml-0.5 text-base font-bold text-white/80">{stat.suffix}</span>
      </span>
      <span className="mt-1 text-xs text-white/60">{stat.label}</span>
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

const EMPTY_MY_APPLICATION_STATS = {
  total: 0,
  drafting: 0,
  docsCompleted: 0,
  submitted: 0,
  reviewing: 0,
  reviewed: 0,
  expiredDrafting: 0,
};

const MY_APPLICATION_STAT_ROWS = [
  [
    { key: "total", label: "전체건수" },
    { key: "drafting", label: "서류작성중" },
    { key: "docsCompleted", label: "서류작성완료" },
  ],
  [
    { key: "submitted", label: "제출완료" },
    { key: "reviewing", label: "심사중" },
    { key: "reviewed", label: "심사완료" },
  ],
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user, session } = useAuth();
  const [selectedCase, setSelectedCase] = useState(null);

  const [statsRef, statsReplayKey] = useReplayOnView();

  // 홈 화면 히어로 전용: 스크롤하면 상단 네비게이션이 투명→불투명으로 바뀐다.
  const scrollContainerRef = useRef(null);
  const [headerSolid, setHeaderSolid] = useState(false);
  // 히어로 섹션을 벗어난 뒤부터(= 다른 섹션에서만) 맨 위로 가기 버튼을 노출한다.
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setHeaderSolid(el.scrollTop > 8);
    setShowScrollTop(el.scrollTop > el.clientHeight * 0.5);
  };

  // 섹션별 스크롤 트리거 스태거 애니메이션용 ref/inView (섹션마다 독립적으로 재진입 감지)
  const [heroRef, heroInView] = useSectionReveal();
  const [programsRef, programsInView] = useSectionReveal();
  // "3: 서비스 소개"는 이제 세 항목이 각각 자기 화면을 차지하는 별도 스냅 섹션이라, 항목별로
  // 독립된 감지가 필요하다 — 하나로 묶어두면 스크롤이 그 사이에 걸쳐 있을 때 두 항목이 동시에
  // 보이거나, 아직 화면에 안 들어온 항목까지 같이 애니메이션이 튀는 문제가 있었다.
  const [feature0Ref, feature0InView] = useSectionReveal();
  const [feature1Ref, feature1InView] = useSectionReveal();
  const [feature2Ref, feature2InView] = useSectionReveal();
  const featureSections = [
    [feature0Ref, feature0InView],
    [feature1Ref, feature1InView],
    [feature2Ref, feature2InView],
  ];
  const FEATURE_MEDIA = ["/hero-ship.png", "/case-studies/case-01.jpg", "/shopee-onboarding-part1.png"];
  const isDesktop = useIsDesktop();
  const [caseStudiesRef, caseStudiesInView] = useSectionReveal();
  const [satisfactionRef, satisfactionInView] = useSectionReveal();

  const [businesses, setBusinesses] = useState([]);
  const [loadingOngoing, setLoadingOngoing] = useState(true);

  useEffect(() => {
    async function loadOngoing() {
      setLoadingOngoing(true);
      const { businesses: allBusinesses } = await api.get("/businesses?order_by=created_at");
      setBusinesses((allBusinesses || []).reverse());
      setLoadingOngoing(false);
    }
    loadOngoing();
  }, []);

  const ongoingPrograms = useMemo(
    () => businesses.filter(isOngoing).slice(0, 5),
    [businesses]
  );

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
        const start = periodStartDate(b);
        if (!start) return false;
        const days = (now - start) / 86400000;
        return days >= 0 && days <= 7;
      }).length;

      const deadlineSoon = businesses.filter((b) => {
        const end = periodEndDate(b);
        if (!end) return false;
        const daysLeft = (end - now) / 86400000;
        return daysLeft >= 0 && daysLeft <= 14;
      }).length;

      // 인기공고: 실제로 신청(제출)이 한 건이라도 들어온 공고 수를 인기 지표로 쓴다.
      const businessIds = businesses.map((b) => b.id);
      const { templates } = await api.get(`/templates?${idsParam("business_id", businessIds)}`);
      const businessByTemplate = Object.fromEntries((templates || []).map((t) => [t.id, t.business_id]));

      // 인기 지표는 "실제로 신청이 들어온 공고 수" - 비로그인 방문자도 보는 공개 통계라
      // 개인정보 없이 template_id 집합만 주는 전용 엔드포인트를 쓴다.
      const { template_ids: submittedTemplateIds } = await api
        .get("/submissions/submitted-template-ids")
        .catch(() => ({ template_ids: [] }));
      const popular = new Set(
        (submittedTemplateIds || []).map((id) => businessByTemplate[id]).filter(Boolean)
      ).size;

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

  // "내가 지원한 공고 현황": 로그인한 사용자가 서류를 하나라도 제출한 사업(공고)을
  // 사업 단위로 센다. 작성중인 상태에서 마감된 건은 진행 가능한 작성중과 분리한다.
  const [myAppStats, setMyAppStats] = useState(EMPTY_MY_APPLICATION_STATS);

  useEffect(() => {
    if (!isLoggedIn || !user?.id) {
      setMyAppStats(EMPTY_MY_APPLICATION_STATS);
      return;
    }
    let cancelled = false;
    async function loadMyApplicationStatus() {
      const { submissions: mySubs } = await api.get("/submissions", session?.access_token);

      const templateIds = [...new Set((mySubs || []).map((s) => s.template_id))];
      if (!templateIds.length) {
        if (!cancelled) setMyAppStats(EMPTY_MY_APPLICATION_STATS);
        return;
      }

      const { templates: myTemplates } = await api.get(`/templates?${idsParam("id", templateIds)}`);
      const businessIdByTemplate = Object.fromEntries((myTemplates || []).map((t) => [t.id, t.business_id]));
      const businessIds = [...new Set(Object.values(businessIdByTemplate))];

      const [{ templates: allTemplates }, { businesses: bizRows }] = await Promise.all([
        api.get(`/templates?${idsParam("business_id", businessIds)}`),
        api.get(`/businesses?${idsParam("id", businessIds)}`),
      ]);

      const totalByBusiness = {};
      (allTemplates || []).forEach((t) => {
        if (t.reference_only) return;
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
      let docsCompleted = 0;
      let submitted = 0;
      let reviewing = 0;
      let reviewed = 0;
      let expiredDrafting = 0;

      businessIds.forEach((bizId) => {
        const done = submittedByBusiness[bizId]?.size || 0;
        const total = totalByBusiness[bizId] || 0;
        const end = periodEndDate(bizById[bizId] || { id: bizId });
        const isExpired = Boolean(end && end < now);

        if (total === 0 || done < total) {
          if (isExpired) expiredDrafting += 1;
          else drafting += 1;
        } else {
          docsCompleted += 1;
          const statuses = reviewStatusesByBusiness[bizId] || [];
          const hasReviewResult = statuses.some((rs) => rs === "approved" || rs === "needs_revision");
          const allReviewed = statuses.length > 0 && statuses.every((rs) => rs === "approved" || rs === "needs_revision");
          if (allReviewed) {
            reviewed += 1;
          } else if (hasReviewResult || statuses.some(Boolean)) {
            reviewing += 1;
          } else {
            submitted += 1;
          }
        }
      });

      if (!cancelled) {
        setMyAppStats({ total: businessIds.length, drafting, docsCompleted, submitted, reviewing, reviewed, expiredDrafting });
      }
    }
    loadMyApplicationStatus();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.id, session?.access_token]);

  const goToLogin = () => {
    navigate("/login");
  };

  const goToProgram = (id) => {
    navigate(`/gov-support/${id}`);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-white">
      <Header overlay scrolled={headerSolid} />

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth scroll-pt-16 pb-24"
      >
        {/* 1: 히어로 — 배/낙하산 2-레이어 배경(HeroOceanScene) */}
        <section
          ref={heroRef}
          className="relative isolate flex h-[100dvh] w-full snap-start flex-col items-center justify-center overflow-hidden bg-slate-900 px-6 pb-6 pt-20 sm:pb-8 sm:pt-24 lg:pb-10 lg:pt-28"
        >
          <HeroOceanScene />

          <div className="relative z-10 w-full max-w-4xl text-center">
            <img
              src={brand.logo}
              alt={brand.name}
              className={`mx-auto h-16 w-auto object-contain brightness-0 invert sm:h-24 lg:h-28 ${revealCls(heroInView)}`}
              style={revealStyle(0)}
            />
            <p
              className={`mx-auto mt-4 max-w-2xl text-xs font-medium leading-relaxed text-white/80 sm:text-sm lg:whitespace-nowrap ${revealCls(heroInView)}`}
              style={revealStyle(2)}
            >
              {dashboard.heroLines.join(" ")}
            </p>

            <Link
              to="/gov-support"
              state={{ forceWizard: true }}
              className={`mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-100 ${revealCls(heroInView)}`}
              style={revealStyle(3)}
            >
              수출 시작하기
              <Icon name="arrowRight" className="w-5 h-5" />
            </Link>

            <div
              ref={statsRef}
              className={`mx-auto mt-6 max-w-3xl rounded-2xl border border-white/10 bg-black/40 px-4 py-4 shadow-xl backdrop-blur-md sm:mt-8 sm:px-6 sm:py-5 ${revealCls(heroInView)}`}
              style={revealStyle(4)}
            >
              <p className="mb-4 text-[13px] font-bold text-white/80 sm:text-sm">
                {dashboard.statsHeadline.replace("GLOTIZ", "")}
                <span className="text-[#ff5a3d]">GLOTIZ</span>
                <span className="ml-2 font-normal text-white/50">({formatTodayKorean()} 기준)</span>
              </p>
              <div key={statsReplayKey} className="grid grid-cols-2 gap-y-4 divide-white/10 sm:grid-cols-4 sm:gap-y-0 sm:divide-x">
                {dashboard.stats.map((s) => (
                  <div key={s.label} className="px-1 sm:px-4">
                    <StatItem stat={s} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className={`absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-[11px] font-medium text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] ${revealCls(heroInView)}`}
            style={revealStyle(5)}
          >
            스크롤해서 더 보기
            <Icon name="chevronDown" className="w-5 h-5 animate-bounce" />
          </div>
        </section>

        {/* 2: 지원사업공고 — 왼쪽 박스를 위(내가 지원한 공고 현황)/아래(지원사업공고)로 반반 나누고, 오른쪽엔 진행중인 지원사업 */}
        <section
          ref={programsRef}
          className="flex h-[calc(100dvh-4rem)] w-full snap-start flex-col items-center justify-center bg-white px-6 py-6 sm:py-8 lg:py-10"
        >
          <div className="mx-auto w-full max-w-5xl">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white md:col-span-2">
                <div className="relative p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-bold text-slate-900 ${revealCls(programsInView)}`}
                        style={revealStyle(0)}
                      >
                        {dashboard.myApplicationStatusTitle}
                      </h3>
                      {myAppStats.expiredDrafting > 0 && (
                        <button
                          type="button"
                          onClick={() => navigate("/my-applications")}
                          className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                        >
                          작성 중 마감 {myAppStats.expiredDrafting}건
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">({formatTodayKorean()} 기준)</span>
                  </div>
                  <div className={!isLoggedIn ? "pointer-events-none select-none blur-sm" : ""}>
                    <div className="space-y-2">
                      {MY_APPLICATION_STAT_ROWS.map((row, rowIdx) => (
                        <div
                          key={rowIdx}
                          className={`grid grid-cols-3 gap-2 ${rowIdx === 1 ? "border-t border-slate-100 pt-2" : ""}`}
                        >
                          {row.map((s) => (
                            <button
                              type="button"
                              key={s.key}
                              onClick={() => navigate("/my-applications")}
                              className="rounded-lg bg-slate-50 px-2 py-3 text-center transition-colors hover:bg-brand-50"
                            >
                              <p className="text-lg font-extrabold text-brand-700">
                                {myAppStats[s.key] || 0}
                                <span className="ml-0.5 text-[10px] font-normal text-slate-500">건</span>
                              </p>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-500">{s.label}</p>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
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
                <h3
                  className={`mb-2 text-base font-bold text-slate-900 ${revealCls(programsInView)}`}
                  style={revealStyle(1)}
                >
                  {dashboard.ongoingProgramsTitle}
                </h3>
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
                          <Icon
                            name="projects"
                            className="mt-0.5 w-5 h-5 shrink-0 text-slate-500 transition-colors group-hover:text-brand-600"
                          />
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
                          className="w-5 h-5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/gov-support")}
                  className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 ${revealCls(programsInView)}`}
                  style={revealStyle(2)}
                >
                  {dashboard.ongoingProgramsMoreLabel}
                  <Icon name="arrowRight" className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 3-1~3-3: GLOTIZ로 서류 작성/디자인 고민을 해결해보세요! — 세 항목을 각각 독립된
            스냅 섹션으로 나눠서(예전엔 한 섹션에 다 몰아넣어 스크롤이 항목 사이에 걸쳐 보였다)
            한 번에 하나씩만 화면에 뜨게 한다. 카드 박스 없이 순수 텍스트만으로 Z-패턴(지그재그)
            배치하고, 타이틀은 React Bits의 MaskedHeading으로 바꿔 글자 모양대로 이미지가
            비치는 인터랙션을 주고, 나머지(순번/설명/링크)는 스크롤 진입 시 순서대로 떠오르는
            Scroll Float를 유지한다. */}
        {dashboard.features.map((f, i) => {
          const rightAlign = i === 1; // 2번(AI 이미지 생성)만 우측 정렬, 1·3번은 좌측
          const [featureRef, featureInView] = featureSections[i];
          return (
            <section
              key={f.title}
              ref={featureRef}
              className="flex h-[calc(100dvh-4rem)] w-full snap-start flex-col items-center justify-center overflow-hidden bg-black px-6 py-6 sm:py-8 lg:py-10"
            >
              <div className="mx-auto w-full max-w-3xl">
                {i === 0 && (
                  <h2
                    className="mb-10 text-center text-lg font-bold text-white sm:mb-14 sm:text-xl"
                    style={floatStyle(0, featureInView)}
                  >
                    {dashboard.featuresTitle}
                  </h2>
                )}
                <div
                  className={`flex flex-col items-start text-left ${
                    rightAlign ? "md:items-end md:text-right" : ""
                  }`}
                >
                  <span
                    className="text-[0.9rem] font-semibold text-[#666666]"
                    style={floatStyle(1, featureInView, { letterSpacing: "1px" })}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <MaskedHeading
                    text={f.title}
                    tag="h3"
                    src={FEATURE_MEDIA[i]}
                    align={rightAlign && isDesktop ? "right" : "left"}
                    weight={800}
                    textScale={0.09}
                    className="mt-3 w-full"
                    style={{ minHeight: "1.2em" }}
                  />
                  <p
                    className={`mt-4 max-w-md text-[1.05rem] font-normal leading-[1.7] text-[#aaaaaa] ${
                      rightAlign ? "md:ml-auto" : ""
                    }`}
                    style={floatStyle(3, featureInView)}
                  >
                    {f.description}
                  </p>
                  <Link
                    to={f.to}
                    className="group mt-5 inline-flex items-center gap-1.5 border-b-2 border-brand-400 pb-1 text-[1.25rem] font-bold text-brand-400"
                    style={floatStyle(4, featureInView)}
                  >
                    {f.linkLabel}
                    <Icon
                      name="arrowRight"
                      className="w-5 h-5 transition-transform duration-300 ease-out group-hover:translate-x-1.5"
                    />
                  </Link>
                </div>
              </div>
            </section>
          );
        })}

        {/* 4: AI · 디자인 진행 사례 */}
        <section
          ref={caseStudiesRef}
          className="flex h-[calc(100dvh-4rem)] w-full snap-start flex-col items-center justify-center overflow-hidden bg-slate-900 px-6 py-6 sm:py-8 lg:py-10"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 text-center sm:mb-4">
              <h2 className={`text-lg font-bold text-white sm:text-xl ${revealCls(caseStudiesInView)}`} style={revealStyle(0)}>
                {dashboard.caseStudiesTitle}
              </h2>
              <p className={`mt-1.5 text-xs text-slate-300 sm:text-sm ${revealCls(caseStudiesInView)}`} style={revealStyle(1)}>
                {dashboard.caseStudiesDescription}
              </p>
            </div>

            {[
              dashboard.caseStudies.slice(0, Math.ceil(dashboard.caseStudies.length / 2)),
              dashboard.caseStudies.slice(Math.ceil(dashboard.caseStudies.length / 2)),
            ].map((row, rowIdx) => (
              <div
                key={rowIdx}
                className={`overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] ${rowIdx === 1 ? "mt-2.5 sm:mt-3" : ""}`}
              >
                <div className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused] sm:gap-4">
                  {[...row, ...row].map((c, idx) => (
                    <button
                      type="button"
                      key={`${c.id}-${idx}`}
                      onClick={() => c.image && setSelectedCase(c)}
                      className="w-48 shrink-0 text-left transition-transform duration-300 ease-out hover:-translate-y-1 sm:w-56"
                    >
                      {c.image ? (
                        <img
                          src={c.image}
                          alt={c.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-32 w-full rounded-2xl object-cover shadow-lg sm:h-36"
                        />
                      ) : (
                        <div className="flex h-32 w-full items-center justify-center rounded-2xl bg-slate-100 sm:h-36">
                          <Icon name={c.icon} className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                      <p className="mt-2 text-[11px] font-bold text-brand-100">{c.tag}</p>
                      <p className="mt-1 text-xs font-bold leading-snug text-white sm:text-sm">{c.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedCase && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8"
              onClick={() => setSelectedCase(null)}
            >
              <div
                className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:flex-row"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCase(null)}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow hover:bg-white"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
                <div className="flex shrink-0 items-center justify-center bg-slate-100 p-4 sm:max-w-md">
                  <img
                    src={selectedCase.image}
                    alt={selectedCase.title}
                    referrerPolicy="no-referrer"
                    className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto p-6 sm:p-8">
                  <p className="text-xs font-bold text-brand-600">{selectedCase.tag}</p>
                  <h3 className="text-lg font-bold text-slate-900 sm:text-xl">{selectedCase.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">
                    GLOTIZ AI가 상품 사진 한 장으로 완성한 {selectedCase.tag} 결과물입니다.
                  </p>
                  <Link
                    to="/marketing"
                    onClick={() => setSelectedCase(null)}
                    className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700"
                  >
                    <Icon name="sparkle" className="w-4 h-4" />
                    이 스타일로 AI 이미지 생성하기
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 5: 소상공인 · 공공기관의 이유있는 선택 */}
        <section
          ref={satisfactionRef}
          className="flex h-[calc(100dvh-4rem)] w-full snap-start flex-col items-center justify-center overflow-hidden bg-brand-600 px-6 py-6 sm:py-8 lg:py-10"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 text-center sm:mb-4">
              <p
                className={`mb-2 text-xs font-bold text-white sm:text-sm ${revealCls(satisfactionInView)}`}
                style={revealStyle(0)}
              >
                고객 만족도 {dashboard.satisfactionRate}%
              </p>
              <h2 className={`text-xl font-bold text-white sm:text-2xl ${revealCls(satisfactionInView)}`} style={revealStyle(1)}>
                {dashboard.satisfactionTitle}
              </h2>
            </div>

            <div className="overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
              <div className="flex w-max gap-3 animate-marquee-reverse hover:[animation-play-state:paused] sm:gap-4">
                {[...dashboard.reviews, ...dashboard.reviews].map((r, idx) => (
                  <div
                    key={`${r.name}-${idx}`}
                    className="w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-lg transition-transform duration-300 ease-out hover:-translate-y-1 sm:w-72 sm:p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <ReviewStars rating={r.rating} />
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                        {r.rating.toFixed(1)}점
                      </span>
                    </div>
                    <p className="mb-2.5 text-xs leading-relaxed text-slate-600 sm:mb-3 sm:text-sm">&ldquo;{r.text}&rdquo;</p>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                        <img
                          src={r.avatar}
                          alt={r.company}
                          className="h-full w-full origin-top scale-[1.8] object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-900 sm:text-xs">{r.name}</p>
                        <p className="text-[10px] text-slate-400 sm:text-[11px]">{r.company}</p>
                        <p className="text-[10px] font-semibold text-brand-500">{r.segment}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="w-full snap-end border-t border-slate-100 bg-white px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
            <img src={footerLogoUrl} alt={brand.name} className="h-8 w-auto object-contain" />
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {/* 히어로를 벗어난 다른 섹션에서는 계속 보이는 맨 위로 가기 버튼 */}
      <button
        type="button"
        onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
        className={`fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-opacity duration-200 hover:bg-slate-50 ${
          showScrollTop ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Icon name="chevronDown" className="h-4 w-4 rotate-180" />
      </button>

      <FloatingChatbot />
    </div>
  );
}
