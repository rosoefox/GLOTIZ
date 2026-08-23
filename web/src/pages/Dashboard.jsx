import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Header from "../components/Header";
import HeroOceanScene from "../components/HeroOceanScene";
import FloatingChatbot from "../components/FloatingChatbot";
import { brand, dashboard, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";
import {
  periodEndDate as sharedPeriodEndDate,
  formatTodayKorean,
  isClosed as sharedIsClosed,
} from "../lib/period";

const footerLogoUrl = new URL("../../로고최종1.png", import.meta.url).href;

function periodEndDate(business) {
  return sharedPeriodEndDate(business, govAnnouncementDetails);
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

// 제목(H2)/본문(P)/버튼 요소에 공통으로 적용하는 스태거 리빌 스타일. index가 클수록
// 0.15초씩 늦게 나타나 순차적으로 아래에서 위로 올라오며 페이드인된다.
function revealCls(inView) {
  return `transition duration-500 ease-out ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`;
}
function revealStyle(index) {
  return { transitionDelay: `${index * 150}ms` };
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

const EMPTY_MY_APPLICATION_STATS = { total: 0, drafting: 0, reviewing: 0, reviewed: 0, closed: 0 };

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
  const [featuresRef, featuresInView] = useSectionReveal();
  const [caseStudiesRef, caseStudiesInView] = useSectionReveal();
  const [satisfactionRef, satisfactionInView] = useSectionReveal();

  const [businesses, setBusinesses] = useState([]);
  const [loadingOngoing, setLoadingOngoing] = useState(true);

  useEffect(() => {
    async function loadOngoing() {
      setLoadingOngoing(true);
      // 서류 양식이 하나라도 업로드된 사업만 노출한다 (GovSupport.jsx와 동일한 규칙) - 백엔드가
      // Supabase의 templates!inner 조인을 대신 못 해줘서, 템플릿 목록을 같이 받아 여기서 거른다.
      const [{ businesses: allBusinesses }, { templates: allTemplates }] = await Promise.all([
        api.get("/businesses?order_by=created_at"),
        api.get("/templates"),
      ]);
      const businessIdsWithTemplate = new Set((allTemplates || []).map((t) => t.business_id));
      setBusinesses((allBusinesses || []).filter((b) => businessIdsWithTemplate.has(b.id)).reverse());
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
        const days = (now - new Date(b.created_at)) / 86400000;
        return days <= 7;
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
                    <h3
                      className={`text-sm font-bold text-slate-900 ${revealCls(programsInView)}`}
                      style={revealStyle(0)}
                    >
                      {dashboard.myApplicationStatusTitle}
                    </h3>
                    <span className="text-[11px] text-slate-400">({formatTodayKorean()} 기준)</span>
                  </div>
                  <div
                    className={`grid grid-cols-3 gap-2 ${
                      !isLoggedIn ? "pointer-events-none select-none blur-sm" : ""
                    }`}
                  >
                    {dashboard.myApplicationStats.map((s) => (
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

        {/* 3: GLOTIZ로 서류 작성/디자인 고민을 해결해보세요! */}
        <section
          ref={featuresRef}
          className="flex h-[calc(100dvh-4rem)] w-full snap-start flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 py-6 sm:py-8 lg:py-10"
        >
          <div className="mx-auto max-w-4xl text-center">
            <h2 className={`text-xl font-bold text-slate-900 sm:text-2xl ${revealCls(featuresInView)}`} style={revealStyle(0)}>
              {dashboard.featuresTitle}
            </h2>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 lg:gap-5">
              {dashboard.features.map((f, i) => (
                <Link
                  key={f.title}
                  to={f.to}
                  className={`flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center hover:shadow-md sm:p-5 ${revealCls(featuresInView)}`}
                  style={revealStyle(i + 1)}
                >
                  <Icon name={f.icon} className="mb-3 w-5 h-5 text-slate-500" />
                  <p className="mb-1 text-sm font-bold text-slate-900 sm:text-base">{f.title}</p>
                  <p className="mb-3 text-xs leading-relaxed text-slate-500 sm:text-sm">{f.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 sm:text-sm">
                    {f.linkLabel}
                    <Icon name="arrowRight" className="w-5 h-5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

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
