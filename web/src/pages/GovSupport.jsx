import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs } from "../data/mockData";
import { buildAnalysis, pickDefaults, projectMatchesAnalysis } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const ProjectCard = forwardRef(function ProjectCard(
  { topBarClass, badge, extraBadges, title, rows, sourceText, ctaText, disabled, onClick },
  ref
) {
  return (
    <Card
      ref={ref}
      onClick={onClick}
      aria-disabled={disabled}
      className={`overflow-hidden transition-shadow ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:shadow-md"
      }`}
    >
      <div className={`h-1 w-full ${topBarClass || "bg-transparent"}`} />
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          {badge}
          <div className="flex items-center gap-2">{extraBadges}</div>
        </div>

        <h3 className="mb-4 min-h-[3rem] text-base font-bold leading-snug text-slate-900">{title}</h3>

        {rows && rows.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between">
                <span className="text-slate-500">{r.label}</span>
                <span className={`font-semibold ${r.tone || "text-slate-700"}`}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {sourceText && <p className="mt-3 text-xs text-slate-400">출처: {sourceText}</p>}
        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600">
          {ctaText}
          {!disabled && <Icon name="arrowRight" className="h-3.5 w-3.5" />}
        </p>
      </div>
    </Card>
  );
});

export default function GovSupport() {
  const { isLoggedIn, lastQuery, lastFilters } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [personalizedMode, setPersonalizedMode] = useState(false);
  const highlightId = location.state?.highlightId ?? null;
  const highlightRef = useRef(null);

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    async function loadAnnouncements() {
      setLoadingAnnouncements(true);
      const { data } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false });
      setAnnouncements(data || []);
      setLoadingAnnouncements(false);
    }
    loadAnnouncements();
  }, []);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  const analysis = useMemo(() => {
    if (!isLoggedIn || !lastQuery) return null;
    return buildAnalysis(lastQuery, lastFilters || pickDefaults(lastQuery));
  }, [isLoggedIn, lastQuery, lastFilters]);

  const handlePersonalizedClick = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/gov-support" } });
      return;
    }
    setPersonalizedMode(true);
  };

  const handleAnnouncementClick = (business, disabled) => {
    if (disabled) return;
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/gov-support" } });
      return;
    }
    navigate("/docs", { state: { businessId: business.id, businessName: business.name } });
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{gs.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{gs.subtitle}</p>
        </div>
        <div className="text-right">
          <Button onClick={handlePersonalizedClick}>
            <Icon name="sparkle" className="h-4 w-4" />
            {gs.ctaButton}
          </Button>
          {personalizedMode && (
            <p className="mt-2 max-w-xs text-xs text-brand-700">{gs.personalizedNotice}</p>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder={gs.searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Button variant="secondary">
          <Icon name="settings" className="h-4 w-4" />
          {gs.filterButton}
        </Button>
      </div>

      <h2 className="mb-3 text-base font-bold text-slate-900">추천 지원사업</h2>
      {loadingAnnouncements ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 지원사업이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((b) => {
            const eligible = analysis ? projectMatchesAnalysis(b, analysis) : null;
            const disabled = personalizedMode && eligible !== true;
            return (
              <ProjectCard
                key={b.id}
                ref={b.id === highlightId ? highlightRef : null}
                topBarClass="bg-brand-400"
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
                title={b.name}
                rows={b.description ? [{ label: "안내", value: b.description }] : null}
                sourceText="전북 지원사업 포털"
                ctaText={disabled ? gs.disabledLabel : isLoggedIn ? "필수 서류 확인하기" : "로그인하고 서류 확인하기"}
                disabled={disabled}
                onClick={() => handleAnnouncementClick(b, disabled)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
