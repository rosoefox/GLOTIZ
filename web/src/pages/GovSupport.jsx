import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui";
import { govSupport as gs, dashboard, govAnnouncementDetails } from "../data/mockData";
import { isClosed } from "../lib/period";
import { supabase } from "../lib/supabase";

function orgNameFor(business) {
  const detail = govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function matchesRegion(business, region) {
  const haystack = `${business.name} ${business.description || ""}`;
  return haystack.includes(region);
}

// 5개 품목 카테고리 중 키워드가 실제로 매치되는 것을 찾고, 하나도 안 걸리면 "기타"로 취급한다.
function matchedCategoryIds(business) {
  const haystack = `${business.name} ${business.description || ""}`;
  const matched = dashboard.itemCategories
    .filter((c) => c.keywords.length > 0 && c.keywords.some((k) => haystack.includes(k)))
    .map((c) => c.id);
  return matched.length ? matched : ["etc"];
}

function AnnouncementCard({ business, highlighted, onClick }) {
  return (
    <Card
      onClick={onClick}
      className={`flex h-full min-h-[200px] cursor-pointer flex-col justify-between overflow-hidden p-6 transition-shadow hover:shadow-md ${
        highlighted ? "border-emerald-400 ring-2 ring-emerald-300" : ""
      }`}
    >
      <div>
        <span className="mb-3 inline-block w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {orgNameFor(business)}
        </span>
        <h3 className="text-base font-bold leading-snug text-slate-900">{business.name}</h3>
      </div>
    </Card>
  );
}

function CheckboxRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

export default function GovSupport() {
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadAnnouncements() {
      setLoadingAnnouncements(true);
      const { data } = await supabase.from("businesses").select("*").order("created_at", { ascending: false });
      setAnnouncements(data || []);
      setLoadingAnnouncements(false);
    }
    loadAnnouncements();
  }, []);

  const toggleRegion = (region) => {
    setSelectedRegions((prev) => (prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]));
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]
    );
  };

  const hasActiveFilter = selectedRegions.length > 0 || selectedCategories.length > 0 || statusFilter !== "all";

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((b) => {
      if (selectedRegions.length > 0 && !selectedRegions.some((r) => matchesRegion(b, r))) return false;
      if (selectedCategories.length > 0) {
        const categoryIds = matchedCategoryIds(b);
        if (!selectedCategories.some((c) => categoryIds.includes(c))) return false;
      }
      const closed = isClosed(b, govAnnouncementDetails);
      if (statusFilter === "ongoing" && closed) return false;
      if (statusFilter === "closed" && !closed) return false;
      return true;
    });
  }, [announcements, selectedRegions, selectedCategories, statusFilter]);

  const handleAnnouncementClick = (business) => navigate(`/gov-support/${business.id}`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-8 py-8">
      <h1 className="text-4xl font-extrabold text-slate-900">{gs.allProgramsHeading}</h1>
      <p className="mt-2 text-sm text-slate-500">{gs.subtitle}</p>

      <Card className="mt-6 p-5">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="mb-3 text-xs font-bold text-slate-400">{gs.filters.regionLabel}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {gs.filters.regions.map((region) => (
                <CheckboxRow
                  key={region}
                  label={region}
                  checked={selectedRegions.includes(region)}
                  onChange={() => toggleRegion(region)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold text-slate-400">{gs.filters.categoryLabel}</p>
            <div className="space-y-2">
              {dashboard.itemCategories.map((c) => (
                <CheckboxRow
                  key={c.id}
                  label={c.label}
                  checked={selectedCategories.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold text-slate-400">{gs.filters.statusLabel}</p>
            <div className="space-y-2">
              {gs.filters.statusOptions.map((s) => (
                <CheckboxRow
                  key={s.id}
                  label={s.label}
                  checked={statusFilter === s.id}
                  onChange={() => setStatusFilter(s.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-6">
        {loadingAnnouncements ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : visibleAnnouncements.length === 0 ? (
          <p className="text-sm text-slate-400">조건에 맞는 지원사업이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {visibleAnnouncements.map((b) => (
              <AnnouncementCard
                key={b.id}
                business={b}
                highlighted={hasActiveFilter}
                onClick={() => handleAnnouncementClick(b)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
