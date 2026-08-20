import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button } from "../components/ui";
import Icon from "../components/Icon";
import { govSupport as gs, dashboard, govAnnouncementDetails, login } from "../data/mockData";
import { displayPeriod, isDemoOngoingBusiness, periodEndDate } from "../lib/period";
import { supabase } from "../lib/supabase";
import { orderedSelect } from "../lib/supabaseOrder";
import { useAuth } from "../context/AuthContext";

const PAGE_SIZE = 6;

// 히어로의 "인기 지원분야" 퀵 태그 — 클릭하면 검색어로 그대로 들어가 지원내용에 해당
// 키워드가 포함된 공고만 즉시 걸러진다.
const POPULAR_TOPICS = ["물류비", "전시회", "바우처"];

function orgNameFor(business) {
  const detail = govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function periodLabel(business) {
  return displayPeriod(business, govAnnouncementDetails);
}

function detailFor(business) {
  return business.basic_info || govAnnouncementDetails[business.id] || null;
}

// D-day 뱃지: 마감일이 없으면(상시 접수) "상시", 지났으면 "마감", 아니면 "D-N".
function dDayLabel(end) {
  if (!end) return { label: "상시", tone: "neutral" };
  const daysLeft = Math.ceil((end - new Date()) / 86400000);
  if (daysLeft < 0) return { label: "마감", tone: "closed" };
  if (daysLeft === 0) return { label: "D-Day", tone: "urgent" };
  if (daysLeft <= 7) return { label: `D-${daysLeft}`, tone: "urgent" };
  return { label: `D-${daysLeft}`, tone: "neutral" };
}

// 지원대상 문구에서 흔히 쓰이는 키워드만 뽑아 "#중소기업" 같은 대상 기업 태그로 보여준다 —
// 실제 값이 없는 새 항목을 지어내는 대신, AI가 이미 추출해둔 target 문구를 그대로 활용한다.
const TARGET_TAG_KEYWORDS = [
  "중소기업",
  "소상공인",
  "스타트업",
  "제조업",
  "수출초보",
  "수출 유망",
  "수출기업",
  "자유무역지역",
  "청년기업",
  "여성기업",
  "사회적기업",
  "농업법인",
  "참여기업",
];
// 알려진 키워드가 하나도 안 걸리면(원문 문구가 다양해서 흔할 수 있음), 통짜 문장을
// 가짜 태그로 보여주는 대신 그냥 태그 없이 넘어간다 — 칩 하나가 문장만큼 길어지면
// 오히려 지저분해 보이기 때문이다.
function targetTags(target) {
  if (!target) return [];
  return TARGET_TAG_KEYWORDS.filter((k) => target.includes(k)).slice(0, 3);
}

// AI 호출 없이, 공고 제목/설명/기본정보(지원대상·지원내용)만 보고 즉시 판단한다.
function matchHaystack(business) {
  const info = business.basic_info || {};
  return `${business.name} ${business.description || ""} ${info.target || ""} ${info.support || ""}`;
}

// 지원대상에 특정 시군 이름이 하나라도 나오면 그 시군에만 해당하는 공고로 보고,
// 아무 시군 이름도 안 나오면(="전북 도내" 처럼 포괄적인 경우) 어떤 시군을 골라도 해당하는
// 것으로 본다 — 실제로 대부분의 공고가 특정 시군을 안 가리는 전북 전역 대상이기 때문이다.
function matchesRegion(business, region) {
  const haystack = matchHaystack(business);
  if (haystack.includes(region)) return true;
  return !gs.filters.regions.some((r) => haystack.includes(r));
}

function wizardStorageKey(userId) {
  return `jbxport:gov-support:wizard:${userId || "guest"}`;
}

// 등록된 지원사업 공고는 대부분 특정 품목을 가리지 않는 범용 수출지원사업이라, 품목은
// 걸러내지 않고 모든 공고가 모든 품목에 해당하는 것으로 취급한다 — 지역만 실제로 대조한다.
function matchesCategory() {
  return true;
}

function matchedCategoryIds() {
  return dashboard.itemCategories.map((c) => c.id);
}

const D_DAY_TONE_CLASS = {
  urgent: "bg-red-50 text-red-600",
  neutral: "bg-slate-100 text-slate-600",
  closed: "bg-slate-100 text-slate-400",
};

function AnnouncementCard({ business, highlighted, bookmarked, closed, onClick, onToggleBookmark }) {
  const period = periodLabel(business);
  const detail = detailFor(business);
  const dDay = dDayLabel(periodEndDate(business, govAnnouncementDetails));
  const tags = targetTags(detail?.target);

  return (
    <Card
      onClick={closed ? undefined : onClick}
      aria-disabled={closed || undefined}
      className={`group relative flex h-full flex-col overflow-hidden p-6 transition-transform duration-200 ${
        closed ? "cursor-not-allowed border-slate-200 grayscale" : "cursor-pointer hover:-translate-y-0.5"
      } ${
        highlighted && !closed ? "border-brand-400 ring-2 ring-brand-100" : ""
      }`}
    >
      {closed && (
        <div
          className="absolute inset-0 z-10 rounded-2xl bg-slate-200/50"
          aria-hidden="true"
        />
      )}
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-block w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {orgNameFor(business)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${D_DAY_TONE_CLASS[dDay.tone]}`}>
            {dDay.label}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!closed) onToggleBookmark(business);
            }}
            disabled={closed}
            aria-label={bookmarked ? "북마크 해제" : "북마크"}
            className={`transition-colors ${
              closed
                ? "cursor-not-allowed text-slate-300"
                : bookmarked
                  ? "text-brand-600"
                  : "text-slate-300 hover:text-brand-400"
            }`}
          >
            <Icon name="bookmark" filled={bookmarked} className="w-5 h-5" />
          </button>
        </div>
      </div>

      <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-slate-900">{business.name}</h3>

      {business.description && (
        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-500">{business.description}</p>
      )}

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Icon name="calendar" className="w-5 h-5 shrink-0" />
          {period ? (
            <span>
              <span className="font-medium text-slate-600">접수기간</span> {period}
            </span>
          ) : (
            <span className="text-slate-400">접수기간 확인 중</span>
          )}
        </span>
        <Icon
          name="arrowRight"
          className="w-5 h-5 shrink-0 text-slate-500 transition-transform duration-200 group-hover:translate-x-1"
        />
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

// 참고 이미지처럼 필터를 한 줄에 나란히 놓기 위한 드롭다운 버튼. 선택된 개수를 배지로
// 보여주고, 누르면 체크박스 목록이 든 팝오버가 뜬다 (SortDropdown과 같은 열기/닫기 방식).
function FilterDropdown({ label, count, isOpen, onToggle, children }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
          count > 0
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
        {count > 0 && (
          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
            {count}
          </span>
        )}
        <Icon name="chevronDown" className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-2.5">{children}</div>
        </div>
      )}
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
        <Icon name="chevronDown" className={`w-5 h-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
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
              {o.id === value && <Icon name="check" className="w-5 h-5" />}
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
    <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        aria-label="이전 페이지"
      >
        <Icon name="arrowLeft" className="w-5 h-5" />
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        aria-label="다음 페이지"
      >
        <Icon name="arrowRight" className="w-5 h-5" />
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
function WizardShell({ title, subtitle, onBack, backLabel, onSkipAll, children, footer }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="mb-8 flex justify-end">
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
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  // "맞춤 추천" 마법사: 지역 선택 → 품목 선택 → 결과. 홈 화면 "수출 시작하기"나 상단 네비게이션
  // "수출지원사업"을 눌렀을 때는 항상 이 마법사부터 시작한다. 다만 사용자가 예전에 이미 마법사를
  // 완료했으면(아래 useEffect가 localStorage를 읽어 감지) 매번 다시 태우지 않고 바로 전체 목록
  // (browse-all)으로 건너뛴다. 매칭은 AI 호출 없이 각 공고의 지역/품목 키워드를 즉시 대조해서
  // 계산하고, 결과는 별도 화면이 아니라 browse-all 화면에 강조 표시로 합쳐서 보여준다.
  const [mode, setMode] = useState("wizard-region"); // wizard-region | wizard-category | browse-all
  const [wizardRegions, setWizardRegions] = useState([]);
  const [wizardCategories, setWizardCategories] = useState([]);
  const [matchedIds, setMatchedIds] = useState(null);

  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [sortFilter, setSortFilter] = useState("ongoing"); // ongoing | deadline | closed
  const [showAllStatus, setShowAllStatus] = useState(false); // true면 진행중/마감 구분 없이 전체를 보여준다
  const [openFilter, setOpenFilter] = useState(null); // null | "region" | "category"
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

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

  // 위 복원 effect는 지역/품목 "선택값"만 되돌려놓을 뿐, 실제 맞춤 공고 하이라이트(matchedIds)는
  // 계산해두지 않는다. 공고 목록(announcements)이 비동기로 늦게 로딩되기 때문에, 둘 다 준비되면
  // 한 번만 자동으로 매칭을 계산해서 "맞춤 공고" 화면이 새로고침/재방문 후에도 그대로 보이게 한다.
  // (사용자가 "전체 공고 보기"로 matchedIds를 직접 지운 뒤에는 다시 끼어들지 않도록 최초 1회만 동작.)
  const restoredMatchRef = useRef(false);
  useEffect(() => {
    if (restoredMatchRef.current) return;
    if (announcements.length === 0) return;
    if (wizardRegions.length === 0 || wizardCategories.length === 0) return;
    if (matchedIds !== null) return;
    restoredMatchRef.current = true;
    const ids = new Set(
      announcements
        .filter(
          (b) =>
            wizardRegions.some((r) => matchesRegion(b, r)) &&
            wizardCategories.some((c) => matchesCategory(b, c))
        )
        .map((b) => b.id)
    );
    setMatchedIds(ids);
  }, [announcements, wizardRegions, wizardCategories, matchedIds]);

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
  }, [selectedRegions, selectedCategories, sortFilter, showAllStatus, matchedIds, search]);

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

  const hasActiveFilter = selectedRegions.length > 0 || selectedCategories.length > 0 || search.trim().length > 0;

  const resetFilters = () => {
    setSearch("");
    setSelectedRegions([]);
    setSelectedCategories([]);
    setSortFilter("ongoing");
    setShowAllStatus(false);
  };

  const visibleAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = announcements.filter((b) => {
      // AI 맞춤 추천(공고문을 실제로 읽고 판단한 결과)이 있으면 그 결과만 보여준다 —
      // 지역/품목 체크박스는 그 안에서 추가로 좁히는 보조 필터로만 쓴다.
      if (matchedIds && !matchedIds.has(b.id)) return false;
      if (selectedRegions.length > 0 && !selectedRegions.some((r) => matchesRegion(b, r))) return false;
      if (selectedCategories.length > 0) {
        const categoryIds = matchedCategoryIds(b);
        if (!selectedCategories.some((c) => categoryIds.includes(c))) return false;
      }
      if (query && !matchHaystack(b).toLowerCase().includes(query)) return false;
      return true;
    });

    const withEnd = list.map((b) => ({ b, end: periodEndDate(b, govAnnouncementDetails) }));
    if (showAllStatus) {
      // "전체" 체크 시 진행중/마감 구분 없이 다 보여준다 — 정렬만 마감일 빠른순을 고를 수 있다.
      list =
        sortFilter === "deadline"
          ? [...withEnd]
              .sort((a, b) => {
                if (!a.end) return 1;
                if (!b.end) return -1;
                return a.end - b.end;
              })
              .map((x) => x.b)
          : withEnd.map((x) => x.b);
    } else if (sortFilter === "closed") {
      list = withEnd.filter(({ b }) => !isDemoOngoingBusiness(b)).map((x) => x.b);
    } else if (sortFilter === "deadline") {
      list = withEnd
        .filter(({ b }) => isDemoOngoingBusiness(b))
        .sort((a, b) => {
          if (!a.end) return 1;
          if (!b.end) return -1;
          return a.end - b.end;
        })
        .map((x) => x.b);
    } else {
      list = withEnd.filter(({ b }) => isDemoOngoingBusiness(b)).map((x) => x.b);
    }

    return list;
  }, [announcements, selectedRegions, selectedCategories, sortFilter, showAllStatus, matchedIds, search]);

  const totalPages = Math.max(1, Math.ceil(visibleAnnouncements.length / PAGE_SIZE));
  const pagedAnnouncements = visibleAnnouncements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAnnouncementClick = (business) => navigate(`/gov-support/${business.id}`);

  const selectedCategoryObjs = dashboard.itemCategories.filter((c) => wizardCategories.includes(c.id));

  // AI 호출 없이, 선택한 지역/품목 키워드가 각 공고의 제목·설명·기본정보에 실제로
  // 들어있는지만 보고 즉시 판단한다 — 네트워크 대기 없이 바로 결과가 나온다.
  const handleCheckPrograms = () => {
    if (wizardRegions.length === 0 || selectedCategoryObjs.length === 0) return;
    const ids = new Set(
      announcements
        .filter(
          (b) =>
            wizardRegions.some((r) => matchesRegion(b, r)) &&
            wizardCategories.some((c) => matchesCategory(b, c))
        )
        .map((b) => b.id)
    );
    setMatchedIds(ids);
    // 결과는 별도 화면이 아니라 수출지원사업 목록 화면에 강조 표시로 보여준다.
    setMode("browse-all");
  };

  const restartWizard = () => {
    setWizardRegions([]);
    setWizardCategories([]);
    setMatchedIds(null);
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
          <Button onClick={handleCheckPrograms} disabled={wizardCategories.length === 0}>
            {wizardCategories.length > 0 ? "공고 확인하기" : "다음"}
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
              <Icon name={c.icon} className="w-5 h-5" />
              {c.label}
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  // mode === "browse-all"

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-8">
      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-8 sm:px-10 sm:py-10">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-4xl">
              {matchedIds ? "맞춤 공고" : gs.allProgramsHeading}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{gs.subtitle}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm">
              <Icon name="home" className="w-5 h-5 text-slate-500" />
              {matchedIds ? (
                <>
                  선택하신 조건에 맞는{" "}
                  <span className="font-bold text-brand-700">{visibleAnnouncements.length}</span>개의 맞춤 공고가 있습니다.
                </>
              ) : (
                <>
                  총 <span className="font-bold text-brand-700">{announcements.length}</span>개의 지원사업이 등록되어 있습니다.
                </>
              )}
            </div>
            <button
              type="button"
              onClick={restartWizard}
              className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
            >
              <Icon name="sparkle" className="w-5 h-5" />
              맞춤 추천 다시 받기
            </button>
          </div>

          <div className="w-full shrink-0 sm:w-auto">
            <p className="mb-2 text-xs font-semibold text-slate-500">인기 지원분야</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSearch((prev) => (prev === topic ? "" : topic))}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    search === topic
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-brand-100 bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  #{topic}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card className="mt-6 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterDropdown
            label={gs.filters.regionLabel}
            count={selectedRegions.length}
            isOpen={openFilter === "region"}
            onToggle={() => setOpenFilter((prev) => (prev === "region" ? null : "region"))}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {gs.filters.regions.map((region) => (
                <CheckboxRow
                  key={region}
                  label={region}
                  checked={selectedRegions.includes(region)}
                  onChange={() => toggleRegion(region)}
                />
              ))}
            </div>
          </FilterDropdown>

          <FilterDropdown
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
          </FilterDropdown>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-slate-700">{gs.filters.statusLabel}</span>
          <CheckboxRow label="전체" checked={showAllStatus} onChange={() => setShowAllStatus((v) => !v)} />
          <SortDropdown
            value={sortFilter}
            options={gs.filters.statusOptions}
            onChange={(value) => {
              setSortFilter(value);
              setShowAllStatus(false);
            }}
          />
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 text-sm font-semibold text-slate-400 hover:text-slate-600"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
              초기화
            </button>
          )}
        </div>
        </div>
      </Card>

      {matchedIds && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="flex items-center gap-1.5 font-medium">
            <Icon name="sparkle" className="w-5 h-5" />
            {wizardRegions.join(", ")} · {selectedCategoryObjs.map((c) => c.label).join(", ")} 조건에 맞는 맞춤 공고{" "}
            {visibleAnnouncements.length}건을 보여드리고 있어요.
          </span>
          <button type="button" onClick={() => setMatchedIds(null)} className="font-semibold hover:underline">
            전체 공고 보기
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pagedAnnouncements.map((b) => (
                <AnnouncementCard
                  key={b.id}
                  business={b}
                  highlighted={hasActiveFilter || (matchedIds ? matchedIds.has(b.id) : false)}
                  bookmarked={bookmarkedIds.has(b.id)}
                  closed={!isDemoOngoingBusiness(b)}
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
