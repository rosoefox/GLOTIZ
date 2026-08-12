import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs } from "../data/mockData";
import { loadAnnouncements, BUDGET_TIERS, matchesBudgetTier } from "../data/govSupportData";
import { CATEGORIES, resolveFilters, pickDefaults, projectMatchesAnalysis } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

const STORAGE_KEY = "jbxport.govSupportPrefs";

function readPersistedPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function matchesCategoryFilter(announcement, categoryFilter) {
  if (categoryFilter === "all") return true;
  return !announcement.matchCategories?.length || announcement.matchCategories.includes(categoryFilter);
}

function matchesPeriodFilter(announcement, periodFilter) {
  if (periodFilter === "all") return true;
  return announcement.applyMonth === periodFilter;
}

const ProjectCard = forwardRef(function ProjectCard(
  { badge, extraBadges, title, description, sourceText, ctaText, disabled, onClick },
  ref
) {
  return (
    <Card
      ref={ref}
      onClick={onClick}
      aria-disabled={disabled}
      className={`flex h-full flex-col overflow-hidden transition-shadow ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:shadow-md"
      }`}
    >
      <div className="h-1 w-full bg-brand-500" />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {badge}
          <div className="flex items-center gap-2">{extraBadges}</div>
        </div>

        <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{title}</h3>

        {description && (
          <p className="line-clamp-2 flex-1 border-t border-slate-100 pt-2 text-xs text-slate-500">{description}</p>
        )}

        {sourceText && <p className="mt-2 text-[11px] text-slate-400">출처: {sourceText}</p>}
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600">
          {ctaText}
          {!disabled && <Icon name="arrowRight" className="h-3.5 w-3.5" />}
        </p>
      </div>
    </Card>
  );
});

function AnnouncementGrid({ announcements, loading, analysis, personalizedMode, highlightId, highlightRef, onClickItem }) {
  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>;
  if (announcements.length === 0) return <p className="text-sm text-slate-400">등록된 지원사업이 없습니다.</p>;

  return (
    <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
      {announcements.map((a) => {
        const eligible = analysis ? projectMatchesAnalysis(a, analysis) : null;
        const disabled = personalizedMode && eligible !== true;
        return (
          <ProjectCard
            key={a.id}
            ref={a.id === highlightId ? highlightRef : null}
            badge={<Badge tone="brand">모집 공고</Badge>}
            extraBadges={
              eligible === true ? (
                <Badge tone="success">
                  <Icon name="checkCircle" className="h-3 w-3" /> 가능
                </Badge>
              ) : eligible === false ? (
                <Badge tone="neutral">미해당</Badge>
              ) : null
            }
            title={a.name}
            description={a.description}
            sourceText={a.org}
            ctaText={disabled ? gs.disabledLabel : "공고 상세보기"}
            disabled={disabled}
            onClick={() => onClickItem(a, disabled)}
          />
        );
      })}
    </div>
  );
}

export default function GovSupport() {
  const { isLoggedIn, lastQuery, lastFilters } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [personalizedMode, setPersonalizedMode] = useState(false);

  // 전체/추천 지원사업 보기 + 상세 필터: 로그인 상태에서는 이전 선택을 기억해뒀다가 다시 반영한다.
  const [viewAll, setViewAll] = useState(() => readPersistedPrefs()?.viewAll ?? true);
  const [viewRecommended, setViewRecommended] = useState(() => readPersistedPrefs()?.viewRecommended ?? false);
  const [categoryFilter, setCategoryFilter] = useState(() => readPersistedPrefs()?.categoryFilter ?? "all");
  const [periodFilter, setPeriodFilter] = useState(() => readPersistedPrefs()?.periodFilter ?? "all");
  const [budgetFilter, setBudgetFilter] = useState(() => readPersistedPrefs()?.budgetFilter ?? "all");

  const highlightId = location.state?.highlightId ?? null;
  const highlightRef = useRef(null);

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingAnnouncements(true);
    loadAnnouncements().then((list) => {
      if (!cancelled) {
        setAnnouncements(list);
        setLoadingAnnouncements(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  // 로그인한 사용자의 보기/필터 선택을 기억해둔다.
  useEffect(() => {
    if (!isLoggedIn) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ viewAll, viewRecommended, categoryFilter, periodFilter, budgetFilter })
      );
    } catch {
      // localStorage 사용 불가(프라이빗 모드 등) 시 그냥 세션 내 상태만 유지
    }
  }, [isLoggedIn, viewAll, viewRecommended, categoryFilter, periodFilter, budgetFilter]);

  const analysis = useMemo(() => {
    if (!isLoggedIn || !lastQuery) return null;
    return resolveFilters(lastQuery, lastFilters || pickDefaults(lastQuery));
  }, [isLoggedIn, lastQuery, lastFilters]);

  const periodOptions = useMemo(() => {
    const months = Array.from(new Set(announcements.map((a) => a.applyMonth).filter(Boolean))).sort();
    return months.map((m) => {
      const [y, mo] = m.split("-");
      return { id: m, label: `${y}년 ${parseInt(mo, 10)}월` };
    });
  }, [announcements]);

  const handlePersonalizedClick = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/gov-support" } });
      return;
    }
    setPersonalizedMode(true);
  };

  const handleAnnouncementClick = (announcement, disabled) => {
    if (disabled) return;
    navigate(`/gov-support/${announcement.id}`);
  };

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      const eligible = analysis ? projectMatchesAnalysis(a, analysis) === true : false;
      const passesView = viewAll || (viewRecommended && eligible);
      if (!passesView) return false;
      if (!matchesCategoryFilter(a, categoryFilter)) return false;
      if (!matchesPeriodFilter(a, periodFilter)) return false;
      if (!matchesBudgetTier(a.budgetMax, budgetFilter)) return false;
      return true;
    });
  }, [announcements, viewAll, viewRecommended, analysis, categoryFilter, periodFilter, budgetFilter]);

  // ── 로그인 전: 제목 + 6개 카드만 화면 스크롤 없이 꽉 차게 보여준다 ──
  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col px-8 py-6">
        <div className="mb-4 shrink-0">
          <h1 className="text-3xl font-extrabold text-slate-900">{gs.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{gs.subtitle}</p>
        </div>

        <AnnouncementGrid
          announcements={announcements}
          loading={loadingAnnouncements}
          analysis={null}
          personalizedMode={false}
          highlightId={highlightId}
          highlightRef={highlightRef}
          onClickItem={handleAnnouncementClick}
        />
      </div>
    );
  }

  const noViewSelected = !viewAll && !viewRecommended;
  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  // ── 로그인 후: 시장조사 요약 + 전체/추천 보기(개별 선택) + 필터 + 매칭 지원사업 ──
  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">{gs.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{gs.subtitle}</p>
      </div>

      <Card className="mb-4 p-5">
        <p className="mb-1.5 text-xs font-semibold text-slate-500">{gs.recentSearchSummaryLabel}</p>
        {analysis ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">{analysis.query}</span>
            <span className="text-slate-400">·</span>
            <span>{analysis.category.label}</span>
            <span className="text-slate-400">·</span>
            <span>{analysis.countryLabel}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{gs.recentSearchSummaryEmpty}</p>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={viewAll}
              onChange={(e) => setViewAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.viewToggle.all}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={viewRecommended}
              onChange={(e) => setViewRecommended(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.viewToggle.recommended}
          </label>

          <div className="flex flex-wrap items-center gap-2 border-l border-slate-200 pl-4">
            <Icon name="settings" className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">{gs.advancedFilter.toggleLabel}</span>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={selectClass}
              aria-label={gs.advancedFilter.productLabel}
            >
              <option value="all">{gs.advancedFilter.productLabel}: {gs.advancedFilter.allOption}</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className={selectClass}
              aria-label={gs.advancedFilter.periodLabel}
            >
              <option value="all">{gs.advancedFilter.periodLabel}: {gs.advancedFilter.allOption}</option>
              {periodOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value)}
              className={selectClass}
              aria-label={gs.advancedFilter.budgetLabel}
            >
              <option value="all">{gs.advancedFilter.budgetLabel}: {gs.advancedFilter.allOption}</option>
              {BUDGET_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-right">
          <Button onClick={handlePersonalizedClick} className="px-6 py-3.5 text-base">
            <Icon name="sparkle" className="h-5 w-5" />
            {gs.ctaButton}
          </Button>
          {personalizedMode && (
            <p className="mt-2 whitespace-nowrap text-xs text-brand-700">{gs.personalizedNotice}</p>
          )}
        </div>
      </div>

      {noViewSelected ? (
        <p className="text-sm text-slate-400">보기 옵션(전체 지원사업 / 추천 지원사업)을 하나 이상 선택해주세요.</p>
      ) : viewRecommended && !viewAll && !analysis ? (
        <p className="text-sm text-slate-400">{gs.recentSearchSummaryEmpty}</p>
      ) : (
        <AnnouncementGrid
          announcements={visibleAnnouncements}
          loading={loadingAnnouncements}
          analysis={analysis}
          personalizedMode={personalizedMode}
          highlightId={highlightId}
          highlightRef={highlightRef}
          onClickItem={handleAnnouncementClick}
        />
      )}
    </div>
  );
}
