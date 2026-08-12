import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs, govAnnouncementDetails } from "../data/mockData";
import { resolveFilters, pickDefaults } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function isEligible(business, analysis) {
  if (!analysis) return null;
  const haystack = `${business.name} ${business.description || ""}`;
  const categoryMatch = haystack.includes(analysis.category.label);
  const countryMatch = analysis.countries.some((c) => haystack.includes(c));
  return categoryMatch || countryMatch;
}

function orgNameFor(business) {
  return govAnnouncementDetails[business.id]?.org || "전북 지원사업 포털";
}

function AnnouncementCard({ business, disabled, badge, onClick }) {
  return (
    <Card
      onClick={onClick}
      aria-disabled={disabled}
      className={`flex h-full flex-col justify-between overflow-hidden p-4 transition-shadow ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:shadow-md"
      }`}
    >
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge tone="brand">모집 공고</Badge>
          {badge}
        </div>
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-slate-900">{business.name}</h3>
      </div>
      <p className="mt-3 truncate text-xs text-slate-400">출처: {orgNameFor(business)}</p>
    </Card>
  );
}

export default function GovSupport() {
  const { isLoggedIn, lastQuery, lastFilters } = useAuth();
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    async function loadAnnouncements() {
      setLoadingAnnouncements(true);
      const { data } = await supabase.from("businesses").select("*").order("created_at", { ascending: false });
      setAnnouncements(data || []);
      setLoadingAnnouncements(false);
    }
    loadAnnouncements();
  }, []);

  const analysis = useMemo(() => {
    if (!isLoggedIn || !lastQuery) return null;
    return resolveFilters(lastQuery, lastFilters || pickDefaults(lastQuery));
  }, [isLoggedIn, lastQuery, lastFilters]);

  const handleAnnouncementClick = (business) => navigate(`/gov-support/${business.id}`);

  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col px-8 py-8">
        <h1 className="mb-5 text-4xl font-extrabold text-slate-900">{gs.allProgramsHeading}</h1>

        {loadingAnnouncements ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 지원사업이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {announcements.map((b) => (
              <AnnouncementCard key={b.id} business={b} onClick={() => handleAnnouncementClick(b)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return <LoggedInGovSupport announcements={announcements} loading={loadingAnnouncements} analysis={analysis} onCardClick={handleAnnouncementClick} />;
}

function LoggedInGovSupport({ announcements, loading, analysis, onCardClick }) {
  const navigate = useNavigate();
  const [listMode, setListMode] = useState("all"); // "all" | "recommended"
  const [personalizedMode, setPersonalizedMode] = useState(false);

  const visibleAnnouncements =
    listMode === "recommended" ? announcements.filter((b) => isEligible(b, analysis) === true) : announcements;

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-8 py-8">
      <h1 className="text-4xl font-extrabold text-slate-900">{gs.allProgramsHeading}</h1>

      <Card className="mt-4 p-4">
        <p className="mb-1 text-xs font-semibold text-slate-400">{gs.lastSearchTitle}</p>
        {analysis ? (
          <p className="text-sm text-slate-700">
            <span className="font-bold text-brand-700">&ldquo;{analysis.query}&rdquo;</span> · {analysis.category.label} ·{" "}
            {analysis.countryLabel}
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            아직 검색한 상품이 없습니다.{" "}
            <button type="button" onClick={() => navigate("/analysis")} className="font-semibold text-brand-600 hover:underline">
              시장 분석에서 상품을 검색해보세요
            </button>
          </p>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={listMode === "all"}
              onChange={() => setListMode("all")}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.allCheckboxLabel}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={listMode === "recommended"}
              onChange={() => setListMode("recommended")}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {gs.recommendedCheckboxLabel}
          </label>
        </div>

        <Button className="px-6 py-4 text-base" onClick={() => setPersonalizedMode((v) => !v)}>
          <Icon name="sparkle" className="h-5 w-5" />
          {gs.ctaButton}
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : visibleAnnouncements.length === 0 ? (
          <p className="text-sm text-slate-400">
            {listMode === "recommended" ? "조건에 맞는 추천 지원사업이 없습니다." : "등록된 지원사업이 없습니다."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {visibleAnnouncements.map((b) => {
              const eligible = isEligible(b, analysis);
              const disabled = personalizedMode && eligible !== true;
              return (
                <AnnouncementCard
                  key={b.id}
                  business={b}
                  disabled={disabled}
                  badge={
                    eligible === true ? (
                      <Badge tone="success">
                        <Icon name="checkCircle" className="h-3 w-3" /> 가능
                      </Badge>
                    ) : eligible === false ? (
                      <Badge tone="neutral">미해당</Badge>
                    ) : null
                  }
                  onClick={() => onCardClick(b)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
