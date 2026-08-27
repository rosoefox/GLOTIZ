import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Button } from "../components/ui";
import Icon from "../components/Icon";
import { govSupport as gs, dashboard, govAnnouncementDetails, login } from "../data/mockData";
import { displayPeriod, isClosed, periodEndDate, periodStartDate } from "../lib/period";
import { api, idsParam } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useNavVariant } from "../context/NavThemeContext";

const PAGE_SIZE = 6;

function orgNameFor(business) {
  // 실제로 관리자가 등록한 공고 정보(business.basic_info)를 최우선으로 쓰고, 예전에 미리
  // 채워둔 데모용 목업(govAnnouncementDetails)은 그 정보가 없는 경우에만 참고한다.
  const detail = business.basic_info || govAnnouncementDetails[business.id];
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

function AnnouncementCard({ business, highlighted, inProgress, bookmarked, closed, onClick, onToggleBookmark }) {
  const period = periodLabel(business);
  const detail = detailFor(business);
  const dDay = dDayLabel(periodEndDate(business, govAnnouncementDetails));
  const tags = targetTags(detail?.target);

  return (
    <Card
      onClick={onClick}
      className={`group relative flex h-full flex-col overflow-hidden p-6 transition-transform duration-200 cursor-pointer hover:-translate-y-0.5 ${
        closed ? "border-slate-200 grayscale" : ""
      } ${
        inProgress && !closed
          ? "border-emerald-400 ring-2 ring-emerald-100"
          : highlighted && !closed
            ? "border-blue-400 ring-2 ring-blue-100"
            : ""
      }`}
    >
      {closed && <div className="absolute inset-0 z-10 rounded-none bg-slate-200/50" aria-hidden="true" />}
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-block w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {orgNameFor(business)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {inProgress && (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
              작성중
            </span>
          )}
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
        className="h-4 w-4 rounded-none border-slate-300 text-brand-600 focus:ring-brand-500"
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
        className={`flex items-center gap-2 rounded-none border px-4 py-2.5 text-sm font-semibold transition-colors ${
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
        <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-none border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-2.5">{children}</div>
        </div>
      )}
    </div>
  );
}

// "진행상태" 드롭다운: 진행중 / 전체 / 마감 세 가지. 정렬은 항상 마감일 빠른순 하나뿐이다.
function SortDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-none border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {current.label}
        <Icon name="chevronDown" className={`w-5 h-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-none border border-slate-200 bg-white py-1.5 shadow-lg">
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none text-sm font-semibold ${
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        aria-label="다음 페이지"
      >
        <Icon name="arrowRight" className="w-5 h-5" />
      </button>
    </div>
  );
}

const STEP_BOX_BASE =
  "flex flex-col items-center justify-center gap-2 rounded-none border-2 px-4 py-6 text-center text-sm font-semibold transition-colors";
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
          className="rounded-none border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
  const location = useLocation();
  const { user, session } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  // "맞춤 추천" 마법사: 지역 선택 → 품목 선택 → 결과. 홈 화면 "수출 시작하기"나 상단 네비게이션
  // "수출지원사업"/"맞춤 공고 확인"을 누르면 매번 지역 선택(1단계)부터 새로 시작한다 — 예전엔
  // 선택했던 지역/품목을 localStorage에 저장해뒀다가 다음에 미리 체크해줬는데, 이제는 그 선택을
  // 아예 저장하지 않는다(재방문해도 항상 빈 상태로 시작). 매칭 자체는 AI 호출 없이 각 공고의
  // 지역/품목 키워드를 즉시 대조해서 계산한다.
  //
  // 네비 아코디언의 "맞춤 공고 확인"과 "전체 공고 확인"은 둘 다 같은 경로("/gov-support")라서
  // React Router가 컴포넌트를 다시 마운트하지 않는다 — location.state만 바뀐다. 그래서 모드
  // 판단을 마운트 시 한 번만 도는 useState 초기값/useEffect가 아니라, 매 네비게이션마다 값이
  // 바뀌는 location.key를 의존성으로 둔 아래 useEffect에서 매번 다시 계산해야, 이미 페이지가
  // 떠 있는 상태에서 두 메뉴를 번갈아 눌러도 실제로 다른 화면이 나온다.
  const [mode, setMode] = useState(() =>
    location.state?.skipAutoMatch ? "browse-all" : "wizard-region"
  ); // wizard-region | wizard-category | browse-all
  // "전체 공고 확인" 화면 상단은 남색(#122955) 배경이라, 그 화면에 있는 동안만 네비게이션도
  // 같은 남색으로 맞춘다. 마법사 단계(지역/품목 선택)는 배경이 그냥 흰색이라 기본값 그대로.
  useNavVariant(mode === "browse-all" ? "navy" : "light");
  const [wizardRegions, setWizardRegions] = useState([]);
  const [wizardCategories, setWizardCategories] = useState([]);
  // true면 지역/품목이 저장돼 있어도 강조 없이 전체 목록을 보여준다 — "전체 공고 확인" 메뉴,
  // "전체 공고 보기" 버튼, 마법사의 "전체 공고 보기" 건너뛰기 링크가 이걸 켠다.
  const [explicitAll, setExplicitAll] = useState(() => Boolean(location.state?.skipAutoMatch));

  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [sortFilter, setSortFilter] = useState("ongoing"); // ongoing | all | closed — 정렬은 항상 마감일 빠른순
  const [openFilter, setOpenFilter] = useState(null); // null | "region" | "category"
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const [bookmarkedIds, setBookmarkedIds] = useState(new Map());
  // 서식 하나라도 제출한 적 있는 사업 = "작성중"으로 표시할 사업. businessId -> businessName.
  const [inProgressBusinesses, setInProgressBusinesses] = useState(new Map());

  useEffect(() => {
    if (!user?.id) {
      setInProgressBusinesses(new Map());
      return;
    }
    let cancelled = false;
    async function loadInProgress() {
      const { submissions } = await api.get("/submissions", session?.access_token).catch(() => ({ submissions: [] }));
      const templateIds = [...new Set((submissions || []).map((s) => s.template_id))];
      if (!templateIds.length) {
        if (!cancelled) setInProgressBusinesses(new Map());
        return;
      }
      const { templates } = await api
        .get(`/templates?${idsParam("id", templateIds)}`)
        .catch(() => ({ templates: [] }));
      const map = new Map();
      (templates || []).forEach((t) => {
        const biz = announcements.find((a) => a.id === t.business_id);
        if (biz) map.set(biz.id, biz.name);
      });
      if (!cancelled) setInProgressBusinesses(map);
    }
    loadInProgress();
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token, announcements]);

  // 네비/홈 화면 등에서 이 페이지로 "다시" 들어올 때마다(경로는 같고 location.state만 달라도)
  // 마법사 단계인지, 저장된 맞춤 결과로 바로 갈지, 강조 없는 전체 목록으로 갈지 새로 판단한다.
  // location.key는 같은 경로라도 매 네비게이션마다 값이 바뀌므로, 이미 마운트된 상태에서
  // "맞춤 공고 확인" ↔ "전체 공고 확인"을 번갈아 눌러도 이 effect가 매번 다시 실행된다.
  useEffect(() => {
    if (location.state?.forceWizard) {
      // 홈 화면 "수출 시작하기": 저장된 선택이 있어도 "맞춤 추천 다시 받기"처럼 처음부터.
      setWizardRegions([]);
      setWizardCategories([]);
      setExplicitAll(false);
      setMode("wizard-region");
      return;
    }
    if (location.state?.skipAutoMatch) {
      // "전체 공고 확인" / "지원사업 목록으로": 강조 없이 전체 목록.
      setExplicitAll(true);
      setMode("browse-all");
      return;
    }
    // "맞춤 공고 확인": 매번 지역 선택 마법사 1단계부터 빈 상태로 다시 시작한다 — 예전 선택은
    // 저장하지 않는다.
    setWizardRegions([]);
    setWizardCategories([]);
    setExplicitAll(false);
    setMode("wizard-region");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, user?.id]);

  // 실제 맞춤 공고 하이라이트는 지역/품목 선택값에서 그때그때 다시 계산한다(별도 state로
  // 들고 있다가 "한 번만 계산" 식으로 관리하면, 위 effect가 매 네비게이션마다 선택값을 다시
  // 세팅해도 갱신이 안 되는 문제가 생긴다).
  const matchedIds = useMemo(() => {
    if (explicitAll) return null;
    if (wizardRegions.length === 0 || wizardCategories.length === 0) return null;
    if (announcements.length === 0) return null;
    return new Set(
      announcements
        .filter(
          (b) =>
            wizardRegions.some((r) => matchesRegion(b, r)) &&
            wizardCategories.some((c) => matchesCategory(b, c))
        )
        .map((b) => b.id)
    );
  }, [explicitAll, wizardRegions, wizardCategories, announcements]);

  useEffect(() => {
    async function loadAnnouncements() {
      setLoadingAnnouncements(true);
      const { businesses } = await api.get("/businesses").catch(() => ({ businesses: [] }));
      setAnnouncements(businesses || []);
      setLoadingAnnouncements(false);
    }
    loadAnnouncements();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setBookmarkedIds(new Map());
      return;
    }
    let cancelled = false;
    api
      .get("/bookmarks", session?.access_token)
      .then(({ bookmarks }) => {
        if (!cancelled) setBookmarkedIds(new Map((bookmarks || []).map((r) => [r.business_id, r.id])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  useEffect(() => {
    setPage(1);
  }, [selectedRegions, selectedCategories, sortFilter, matchedIds, search]);

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
    const bookmarkId = bookmarkedIds.get(business.id);
    try {
      if (bookmarkId) {
        await api.delete(`/bookmarks/${bookmarkId}`, session?.access_token);
        setBookmarkedIds((prev) => {
          const next = new Map(prev);
          next.delete(business.id);
          return next;
        });
      } else {
        const row = await api.post("/bookmarks", { business_id: business.id }, session?.access_token);
        setBookmarkedIds((prev) => new Map(prev).set(business.id, row.id));
      }
    } catch {
      // bookmarks 저장에 실패해도 화면 흐름은 막지 않는다 - 조용히 무시
    }
  };

  const hasActiveFilter = selectedRegions.length > 0 || selectedCategories.length > 0 || search.trim().length > 0;

  const resetFilters = () => {
    setSearch("");
    setSelectedRegions([]);
    setSelectedCategories([]);
    setSortFilter("ongoing");
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

    // 공고는 항상 접수기간 시작일 최신순으로 정렬한다(등록일이 아니라 공고 자체의
    // 접수기간 기준). "전체"를 골랐을 때는 마감된 공고를 진행중인 공고들 뒤로 전부
    // 밀어내고, 그 안에서도 각각 최신순을 유지한다.
    const withMeta = list.map((b) => ({ b, closed: isClosed(b, govAnnouncementDetails) }));
    const filtered =
      sortFilter === "closed"
        ? withMeta.filter((x) => x.closed)
        : sortFilter === "all"
          ? withMeta
          : withMeta.filter((x) => !x.closed);

    return filtered
      .sort((a, b) => {
        if (sortFilter === "all" && a.closed !== b.closed) return a.closed ? 1 : -1;
        const as = periodStartDate(a.b, govAnnouncementDetails);
        const bs = periodStartDate(b.b, govAnnouncementDetails);
        if (!as && !bs) return 0;
        if (!as) return 1;
        if (!bs) return -1;
        return bs - as;
      })
      .map((x) => x.b);
  }, [announcements, selectedRegions, selectedCategories, sortFilter, matchedIds, search]);

  const totalPages = Math.max(1, Math.ceil(visibleAnnouncements.length / PAGE_SIZE));
  const pagedAnnouncements = visibleAnnouncements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAnnouncementClick = (business) => navigate(`/gov-support/${business.id}`);

  const selectedCategoryObjs = dashboard.itemCategories.filter((c) => wizardCategories.includes(c.id));

  // 선택한 지역/품목은 이미 wizardRegions/wizardCategories에 들어있으니, matchedIds는 그 값들로
  // 자동으로 다시 계산된다(위 useMemo) — 여기선 강조 표시를 켜고(explicitAll 해제) 결과 화면으로
  // 넘어가기만 하면 된다. 결과는 별도 화면이 아니라 수출지원사업 목록 화면에 강조 표시로 보여준다.
  const handleCheckPrograms = () => {
    if (wizardRegions.length === 0 || selectedCategoryObjs.length === 0) return;
    setExplicitAll(false);
    setMode("browse-all");
  };

  const restartWizard = () => {
    setWizardRegions([]);
    setWizardCategories([]);
    setExplicitAll(false);
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
        onSkipAll={() => {
          setExplicitAll(true);
          setMode("browse-all");
        }}
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
        onSkipAll={() => {
          setExplicitAll(true);
          setMode("browse-all");
        }}
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
    <div className="flex flex-col">
      {/* 구분선 위쪽 배경 — main에 폭 제약이 없어 w-full만으로 좌우 끝까지 닿는다. */}
      <div className="w-full border-b border-slate-200 bg-[#122955]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          <h1 className="text-2xl font-extrabold sm:text-4xl" style={{ color: "#e6f5f0" }}>
            {matchedIds ? "맞춤 공고" : gs.allProgramsHeading}
          </h1>
          <p className="mt-2 text-sm text-slate-300">{gs.subtitle}</p>
          <p className="mt-6 text-sm text-slate-200">
            {matchedIds ? (
              <>
                선택하신 조건에 맞는{" "}
                <span className="font-bold text-brand-300">{visibleAnnouncements.length}</span>개의 맞춤 공고가 있습니다.
              </>
            ) : (
              <>
                총 <span className="font-bold text-brand-300">{announcements.length}</span>개의 지원사업이 등록되어 있습니다.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={restartWizard}
            className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-300 hover:underline"
          >
            <Icon name="sparkle" className="w-5 h-5" />
            맞춤 추천 다시 받기
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-8">
        <div className="mt-6 flex flex-col gap-3">
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
          <SortDropdown value={sortFilter} options={gs.filters.statusOptions} onChange={setSortFilter} />
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
      </div>

      {matchedIds && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-none border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="flex items-center gap-1.5 font-medium">
            <Icon name="sparkle" className="w-5 h-5" />
            <span className="font-bold text-brand-900">{wizardRegions.join(", ")}</span> ·{" "}
            <span className="font-bold text-brand-900">
              {selectedCategoryObjs.map((c) => c.label).join(", ")}
            </span>{" "}
            조건에 맞는 맞춤 공고 {visibleAnnouncements.length}건을 보여드리고 있어요.
          </span>
          <button type="button" onClick={() => setExplicitAll(true)} className="font-semibold hover:underline">
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
                  inProgress={inProgressBusinesses.has(b.id)}
                  bookmarked={bookmarkedIds.has(b.id)}
                  closed={isClosed(b, govAnnouncementDetails)}
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
    </div>
  );
}
