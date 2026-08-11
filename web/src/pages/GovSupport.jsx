import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs } from "../data/mockData";
import { loadAnnouncements } from "../data/govSupportData";
import { resolveFilters, pickDefaults, projectMatchesAnalysis } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

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
      <div className="h-1 w-full bg-brand-400" />
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
  const [viewMode, setViewMode] = useState("all"); // "all" | "recommended" (로그인 후에만 사용)
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

  const analysis = useMemo(() => {
    if (!isLoggedIn || !lastQuery) return null;
    return resolveFilters(lastQuery, lastFilters || pickDefaults(lastQuery));
  }, [isLoggedIn, lastQuery, lastFilters]);

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
    if (!isLoggedIn || viewMode === "all") return announcements;
    if (!analysis) return [];
    return announcements.filter((a) => projectMatchesAnalysis(a, analysis) === true);
  }, [announcements, isLoggedIn, viewMode, analysis]);

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

  // ── 로그인 후: 시장조사 요약 + 전체/추천 보기 전환 + 매칭 지원사업 ──
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
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={viewMode === "all"}
              onChange={() => setViewMode("all")}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.viewToggle.all}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={viewMode === "recommended"}
              onChange={() => setViewMode("recommended")}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.viewToggle.recommended}
          </label>
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

      {viewMode === "recommended" && !analysis ? (
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
