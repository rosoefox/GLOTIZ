import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button } from "../components/ui";
import Icon from "../components/Icon";
import { govSupport as gs, dashboard, govAnnouncementDetails, login } from "../data/mockData";
import { periodEndDate } from "../lib/period";
import { supabase } from "../lib/supabase";
import { orderedSelect } from "../lib/supabaseOrder";
import { readErrorMessage } from "../lib/apiError";
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const PAGE_SIZE = 6;

function orgNameFor(business) {
  const detail = govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function periodLabel(business) {
  const detail = business.basic_info || govAnnouncementDetails[business.id];
  return detail?.period || null;
}

function matchesRegion(business, region) {
  const haystack = `${business.name} ${business.description || ""}`;
  return haystack.includes(region);
}

function wizardStorageKey(userId) {
  return `jbxport:gov-support:wizard:${userId || "guest"}`;
}

// 5개 품목 카테고리 중 키워드가 실제로 매치되는 것을 찾고, 하나도 안 걸리면 "기타"로 취급한다.
function matchedCategoryIds(business) {
  const haystack = `${business.name} ${business.description || ""}`;
  const matched = dashboard.itemCategories
    .filter((c) => c.keywords.length > 0 && c.keywords.some((k) => haystack.includes(k)))
    .map((c) => c.id);
  return matched.length ? matched : ["etc"];
}

function AnnouncementCard({ business, highlighted, bookmarked, onClick, onToggleBookmark }) {
  const period = periodLabel(business);
  return (
    <Card
      onClick={onClick}
      className={`flex h-full cursor-pointer flex-col overflow-hidden p-6 transition-shadow hover:shadow-md ${
        highlighted ? "border-brand-400 ring-2 ring-brand-300" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-block w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {orgNameFor(business)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(business);
          }}
          aria-label={bookmarked ? "북마크 해제" : "북마크"}
          className={`shrink-0 transition-colors ${bookmarked ? "text-brand-600" : "text-slate-300 hover:text-brand-400"}`}
        >
          <Icon name="bookmark" filled={bookmarked} className="h-5 w-5" />
        </button>
      </div>

      <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-slate-900">{business.name}</h3>
      {business.description && (
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-500">{business.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
          {period ? (
            <span>
              <span className="font-medium text-slate-600">접수기간</span> {period}
            </span>
          ) : (
            <span className="text-slate-400">접수기간 확인 중</span>
          )}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-200 text-brand-600">
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </span>
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

function FilterSection({ label, count, isOpen, onToggle, children }) {
  return (
    <div className={isOpen ? "" : "border-b border-slate-100 last:border-b-0"}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-bold text-slate-700">
          {label}
          {count > 0 && (
            <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {count}
            </span>
          )}
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="flex flex-wrap gap-x-6 gap-y-2 pb-4">{children}</div>}
    </div>
  );
}

// "진행상태" 드롭다운: 진행중 / 마감일 빠른순 / 마감 세 가지를 하나로 묶는다.
function SortDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {current.label}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${
                o.id === value ? "font-semibold text-brand-700" : "text-slate-700"
              }`}
            >
              {o.label}
              {o.id === value && <Icon name="check" className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 4) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 3) pages.push("...");
  pages.push(total);
  return pages;
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-8 flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        aria-label="이전 페이지"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
      </button>
      {getPageNumbers(page, totalPages).map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} className="px-1.5 text-sm text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
              p === page ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        aria-label="다음 페이지"
      >
        <Icon name="arrowRight" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const STEP_BOX_BASE =
  "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-6 text-center text-sm font-semibold transition-colors";
const STEP_BOX_SELECTED = "border-brand-600 bg-brand-50 text-brand-700";
const STEP_BOX_IDLE = "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40";

// 지역 선택 → 품목 선택, 2단계 마법사 화면의 공통 틀.
// 왼쪽엔 진행 단계/제목/설명, 오른쪽엔 선택 박스가 오는 레이아웃(참고 이미지 스타일).
function WizardShell({ step, totalSteps, title, subtitle, onBack, backLabel, onSkipAll, children, footer }) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-slate-400">{`0${step}/0${totalSteps}`}</p>
          <div className="mt-2 h-1 w-32 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-1 rounded-full bg-brand-600 transition-all"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <button type="button" onClick={onSkipAll} className="text-xs font-semibold text-slate-400 hover:text-brand-600">
          {gs.allProgramsHeading} 전체 공고 보기
        </button>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[300px_1fr]">
        <div>
          <h1 className="text-2xl font-bold leading-snug text-slate-900 sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-3 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        <div>{children}</div>
      </div>

      <div className="mt-12 flex items-center justify-between border-t border-slate-100 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {backLabel || "뒤로가기"}
        </button>
        {footer}
      </div>
    </div>
  );
}

export default function GovSupport() {
  const navigate = useNavigate();
  const { user, session } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  // "AI 맞춤 추천" 마법사: 지역 선택 → 품목 선택 → 결과. wizard를 안 타고 바로 전체 목록을 볼 수도 있다.
  // 결과는 별도 화면이 아니라 browse-all(수출지원사업 목록) 화면에 강조 표시로 합쳐서 보여준다.
  const [mode, setMode] = useState("wizard-region"); // wizard-region | wizard-category | browse-all
  const [wizardRegions, setWizardRegions] = useState([]);
  const [wizardCategories, setWizardCategories] = useState([]);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [matchedIds, setMatchedIds] = useState(null);

  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [sortFilter, setSortFilter] = useState("ongoing"); // ongoing | deadline | closed
  const [openFilter, setOpenFilter] = useState(null); // null | "region" | "category"
  const [page, setPage] = useState(1);

  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());

  useEffect(() => {
    const raw = localStorage.getItem(wizardStorageKey(user?.id));
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.regions)) setWizardRegions(saved.regions);
      if (Array.isArray(saved.categories)) setWizardCategories(saved.categories);
      if ((saved.regions || []).length || (saved.categories || []).length) {
        setMode("browse-all");
      }
    } catch {
      // 저장된 추천 정보가 깨졌으면 무시하고 새로 시작한다.
    }
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem(
      wizardStorageKey(user?.id),
      JSON.stringify({ regions: wizardRegions, categories: wizardCategories })
    );
  }, [user?.id, wizardRegions, wizardCategories]);

  useEffect(() => {
    async function loadAnnouncements() {
      setLoadingAnnouncements(true);
      const { data } = await orderedSelect(
        () => supabase.from("businesses").select("*"),
        "created_at",
        { ascending: false }
      );
      setAnnouncements(data || []);
      setLoadingAnnouncements(false);
    }
    loadAnnouncements();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setBookmarkedIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("bookmarks")
      .select("business_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!cancelled && !error) setBookmarkedIds(new Set((data || []).map((r) => r.business_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    setPage(1);
  }, [selectedRegions, selectedCategories, sortFilter, matchedIds]);

  const toggleRegion = (region) => {
    setSelectedRegions((prev) => (prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]));
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]
    );
  };

  const toggleWizardCategory = (categoryId) => {
    setWizardCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]
    );
  };

  const toggleWizardRegion = (region) => {
    setWizardRegions((prev) => (prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]));
  };

  const toggleBookmark = async (business) => {
    if (!user?.id) {
      window.alert(login.requiredMessage);
      navigate("/login");
      return;
    }
    const isBookmarked = bookmarkedIds.has(business.id);
    try {
      if (isBookmarked) {
        await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("business_id", business.id);
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          next.delete(business.id);
          return next;
        });
      } else {
        await supabase.from("bookmarks").insert({ user_id: user.id, business_id: business.id });
        setBookmarkedIds((prev) => new Set(prev).add(business.id));
      }
    } catch {
      // bookmarks 테이블 마이그레이션이 아직 반영되지 않았을 수 있음 - 조용히 무시
    }
  };

  const hasActiveFilter = selectedRegions.length > 0 || selectedCategories.length > 0;

  const visibleAnnouncements = useMemo(() => {
    let list = announcements.filter((b) => {
      if (selectedRegions.length > 0 && !selectedRegions.some((r) => matchesRegion(b, r))) return false;
      if (selectedCategories.length > 0) {
        const categoryIds = matchedCategoryIds(b);
        if (!selectedCategories.some((c) => categoryIds.includes(c))) return false;
      }
      return true;
    });

    const withEnd = list.map((b) => ({ b, end: periodEndDate(b, govAnnouncementDetails) }));
    const now = new Date();
    if (sortFilter === "closed") {
      list = withEnd.filter(({ end }) => end && end < now).map((x) => x.b);
    } else if (sortFilter === "deadline") {
      list = withEnd
        .filter(({ end }) => !end || end >= now)
        .sort((a, b) => {
          if (!a.end) return 1;
          if (!b.end) return -1;
          return a.end - b.end;
        })
        .map((x) => x.b);
    } else {
      list = withEnd.filter(({ end }) => !end || end >= now).map((x) => x.b);
    }

    if (matchedIds) {
      list = [...list].sort((a, b) => {
        const aMatch = matchedIds.has(a.id) ? 0 : 1;
        const bMatch = matchedIds.has(b.id) ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    return list;
  }, [announcements, selectedRegions, selectedCategories, sortFilter, matchedIds]);

  const totalPages = Math.max(1, Math.ceil(visibleAnnouncements.length / PAGE_SIZE));
  const pagedAnnouncements = visibleAnnouncements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAnnouncementClick = (business) => navigate(`/gov-support/${business.id}`);

  const selectedCategoryObjs = dashboard.itemCategories.filter((c) => wizardCategories.includes(c.id));

  const handleCheckPrograms = async () => {
    if (wizardRegions.length === 0 || selectedCategoryObjs.length === 0) return;
    setMatching(true);
    setMatchError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/gov-support/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          region: wizardRegions.join(", "),
          category_label: selectedCategoryObjs.map((c) => c.label).join(", "),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "추천 공고를 불러오지 못했습니다."));
      const data = await res.json();
      setMatchedIds(new Set(data.matchedIds || []));
      // 결과는 별도 화면이 아니라 수출지원사업 목록 화면에 강조 표시로 보여준다.
      setMode("browse-all");
    } catch (err) {
      setMatchError(err.message);
    } finally {
      setMatching(false);
    }
  };

  const restartWizard = () => {
    setWizardRegions([]);
    setWizardCategories([]);
    setMatchedIds(null);
    setMatchError(null);
    setMode("wizard-region");
  };

  if (loadingAnnouncements && mode !== "browse-all") {
    return (
      <div className="mx-auto max-w-5xl px-8 py-12">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  if (mode === "wizard-region") {
    return (
      <WizardShell
        step={1}
        totalSteps={2}
        title="14개 시군 중 사업자에 해당되는 시군을 선택해주세요."
        subtitle="선택하신 지역의 맞춤 지원사업과 정보를 안내해 드립니다."
        onBack={() => navigate("/")}
        onSkipAll={() => setMode("browse-all")}
        footer={
          <Button onClick={() => setMode("wizard-category")} disabled={wizardRegions.length === 0}>
            다음
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {gs.filters.regions.map((region) => (
            <button
              key={region}
              type="button"
              onClick={() => toggleWizardRegion(region)}
              className={`${STEP_BOX_BASE} py-5 ${wizardRegions.includes(region) ? STEP_BOX_SELECTED : STEP_BOX_IDLE}`}
            >
              {region}
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  if (mode === "wizard-category") {
    return (
      <WizardShell
        step={2}
        totalSteps={2}
        title="수출을 원하는 제품을 선택해주세요."
        subtitle="선택하신 제품을 기반으로 맞춤형 해외 판로 지원 정보를 안내해 드립니다."
        onBack={() => setMode("wizard-region")}
        onSkipAll={() => setMode("browse-all")}
        footer={
          <Button onClick={handleCheckPrograms} disabled={wizardCategories.length === 0 || matching}>
            {matching ? "확인하는 중..." : wizardCategories.length > 0 ? "공고 확인하기" : "다음"}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {dashboard.itemCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleWizardCategory(c.id)}
              className={`${STEP_BOX_BASE} ${wizardCategories.includes(c.id) ? STEP_BOX_SELECTED : STEP_BOX_IDLE}`}
            >
              <Icon name={c.icon} className="h-6 w-6" />
              {c.label}
            </button>
          ))}
        </div>
        {matchError && <p className="mt-4 text-xs font-medium text-red-500">{matchError}</p>}
      </WizardShell>
    );
  }

  // mode === "browse-all"
  const matchedCount = matchedIds ? visibleAnnouncements.filter((b) => matchedIds.has(b.id)).length : 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-8 py-8">
      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="flex flex-wrap items-center justify-between gap-6 px-8 py-10 sm:px-10">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900">{gs.allProgramsHeading}</h1>
            <p className="mt-2 text-sm text-slate-500">{gs.subtitle}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm">
              <Icon name="home" className="h-4 w-4 text-brand-600" />
              총 <span className="font-bold text-brand-700">{announcements.length}</span>개의 지원사업이 등록되어 있습니다.
            </div>
            <button
              type="button"
              onClick={restartWizard}
              className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
            >
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              맞춤 추천 다시 받기
            </button>
          </div>

          <div className="relative hidden h-40 w-56 shrink-0 sm:block">
            <div className="absolute inset-0 rounded-full bg-brand-200/40 blur-2xl" />
            <div className="absolute left-2 top-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-lg">
              <Icon name="globe" className="h-12 w-12" strokeWidth={1.3} />
            </div>
            <div className="absolute bottom-2 right-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-md">
              <Icon name="box" className="h-8 w-8" strokeWidth={1.5} />
            </div>
            <div className="absolute bottom-8 left-16 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 shadow-md">
              <Icon name="documents" className="h-7 w-7" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <FilterSection
              label={gs.filters.regionLabel}
              count={selectedRegions.length}
              isOpen={openFilter === "region"}
              onToggle={() => setOpenFilter((prev) => (prev === "region" ? null : "region"))}
            >
              {gs.filters.regions.map((region) => (
                <CheckboxRow
                  key={region}
                  label={region}
                  checked={selectedRegions.includes(region)}
                  onChange={() => toggleRegion(region)}
                />
              ))}
            </FilterSection>

            <FilterSection
              label={gs.filters.categoryLabel}
              count={selectedCategories.length}
              isOpen={openFilter === "category"}
              onToggle={() => setOpenFilter((prev) => (prev === "category" ? null : "category"))}
            >
              {dashboard.itemCategories.map((c) => (
                <CheckboxRow
                  key={c.id}
                  label={c.label}
                  checked={selectedCategories.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
              ))}
            </FilterSection>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:pt-3">
            <span className="text-sm font-bold text-slate-700">{gs.filters.statusLabel}</span>
            <SortDropdown value={sortFilter} options={gs.filters.statusOptions} onChange={setSortFilter} />
          </div>
        </div>
      </Card>

      {matchedIds && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="flex items-center gap-1.5 font-medium">
            <Icon name="sparkle" className="h-4 w-4" />
            {wizardRegions.join(", ")} · {selectedCategoryObjs.map((c) => c.label).join(", ")} 조건에 맞는 공고{" "}
            {matchedCount}건을 강조 표시했어요.
          </span>
          <button type="button" onClick={() => setMatchedIds(null)} className="font-semibold hover:underline">
            강조 해제
          </button>
        </div>
      )}

      <div className="mt-6">
        {loadingAnnouncements ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : visibleAnnouncements.length === 0 ? (
          <p className="text-sm text-slate-400">조건에 맞는 지원사업이 없습니다.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {pagedAnnouncements.map((b) => (
                <AnnouncementCard
                  key={b.id}
                  business={b}
                  highlighted={hasActiveFilter || (matchedIds ? matchedIds.has(b.id) : false)}
                  bookmarked={bookmarkedIds.has(b.id)}
                  onClick={() => handleAnnouncementClick(b)}
                  onToggleBookmark={toggleBookmark}
                />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
