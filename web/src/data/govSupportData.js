// 정부 지원사업 공고 데이터.
// 실제 공고(Supabase businesses 테이블)는 id/name/description/created_at만 갖고 있어
// 상세페이지에 필요한 소관부처·신청기간 등의 항목이 DB에 없다. 그 항목은 여기서
// 기본값(REAL_BUSINESS_DEFAULTS)으로 채우고, 6개를 채우기 위한 임시 공고 4건도 함께 둔다.
import { supabase } from "../lib/supabase";

export const REAL_BUSINESS_DEFAULTS = {
  org: "전북테크노파크",
  department: "중소벤처기업부",
  agency: "전북테크노파크",
  applyPeriod: "공고문 참조",
  applyMethod: "온라인 접수 (기업지원사업 관리시스템)",
  applySite: "기업지원사업 관리시스템",
  contact: "전북테크노파크 기업지원단",
  matchCategories: [],
  matchCountries: [],
  // 실제 DB에는 모집월·지원금액 데이터가 없어 필터에서는 "전체"로만 잡힌다.
  applyMonth: null,
  budgetMax: null,
};

// 지원금액 필터용 구간. budgetMax(원)가 해당 구간에 들어가는 공고만 걸러낸다.
export const BUDGET_TIERS = [
  { id: "under10m", label: "1천만원 이하", max: 10_000_000 },
  { id: "10to30m", label: "1천만원 ~ 3천만원", min: 10_000_000, max: 30_000_000 },
  { id: "over30m", label: "3천만원 이상", min: 30_000_000 },
];

export function matchesBudgetTier(budgetMax, tierId) {
  if (!tierId || tierId === "all") return true;
  if (budgetMax == null) return false;
  const tier = BUDGET_TIERS.find((t) => t.id === tierId);
  if (!tier) return true;
  if (tier.min != null && budgetMax <= tier.min) return false;
  if (tier.max != null && budgetMax > tier.max) return false;
  return true;
}

// 임시로 채워 넣는 4건 (관리자가 실제 공고를 추가로 등록하기 전까지 6개를 보여주기 위한 목업)
export const dummyAnnouncements = [
  {
    id: "mock-ecommerce-voucher",
    isMock: true,
    name: "2026년 글로벌 전자상거래 진출 지원사업",
    description: "쇼피·아마존 등 해외 온라인 플랫폼 입점을 준비하는 도내 수출기업의 입점·마케팅 비용을 지원합니다.",
    org: "전북경제통상진흥원",
    department: "중소벤처기업부",
    agency: "전북경제통상진흥원",
    applyPeriod: "2026.08.18 ~ 2026.08.29",
    applyMethod: "온라인 접수 (기업지원사업 관리시스템)",
    applySite: "기업지원사업 관리시스템",
    contact: "전북경제통상진흥원 수출지원단 063-711-2000",
    matchCategories: ["cosmetics", "fashion", "household"],
    matchCountries: ["베트남", "태국", "인도네시아", "필리핀", "말레이시아", "싱가포르"],
    applyMonth: "2026-08",
    budgetMax: 20_000_000,
  },
  {
    id: "mock-cert-support",
    isMock: true,
    name: "해외 규격인증 획득 지원사업",
    description: "CE, FDA 등 해외 진출에 필요한 규격·인증 취득 비용의 일부를 지원합니다.",
    org: "전북테크노파크",
    department: "산업통상자원부",
    agency: "전북테크노파크",
    applyPeriod: "2026.09.01 ~ 2026.09.19",
    applyMethod: "온라인 접수 (기업지원사업 관리시스템)",
    applySite: "기업지원사업 관리시스템",
    contact: "전북테크노파크 기업지원단 063-219-2124",
    matchCategories: ["cosmetics", "electronics"],
    matchCountries: [],
    applyMonth: "2026-09",
    budgetMax: 30_000_000,
  },
  {
    id: "mock-logistics-support",
    isMock: true,
    name: "수출 초보기업 물류비 지원사업",
    description: "수출 실적이 적은 초보 수출기업을 대상으로 해외 배송·통관에 드는 물류비를 지원합니다.",
    org: "전북경제통상진흥원",
    department: "중소벤처기업부",
    agency: "전북경제통상진흥원",
    applyPeriod: "2026.08.25 ~ 2026.09.05",
    applyMethod: "온라인 접수 (기업지원사업 관리시스템)",
    applySite: "기업지원사업 관리시스템",
    contact: "전북경제통상진흥원 수출지원단 063-711-2000",
    matchCategories: ["food", "household"],
    matchCountries: ["태국", "인도네시아"],
    applyMonth: "2026-08",
    budgetMax: 10_000_000,
  },
  {
    id: "mock-content-marketing",
    isMock: true,
    name: "K-뷰티·K-푸드 해외 마케팅 콘텐츠 제작 지원",
    description: "SNS·상세페이지용 해외向 마케팅 콘텐츠 제작을 전문 디자인 업체와 매칭해 지원합니다.",
    org: "전북문화관광재단",
    department: "전북특별자치도",
    agency: "전북문화관광재단",
    applyPeriod: "2026.09.10 ~ 2026.09.24",
    applyMethod: "온라인 접수 (기업지원사업 관리시스템)",
    applySite: "기업지원사업 관리시스템",
    contact: "전북문화관광재단 콘텐츠산업팀 063-230-7000",
    matchCategories: ["cosmetics", "food"],
    matchCountries: ["베트남"],
    applyMonth: "2026-09",
    budgetMax: 15_000_000,
  },
];

function toRealAnnouncement(business, firstTemplateId) {
  return {
    id: business.id,
    isMock: false,
    name: business.name,
    description: business.description,
    hasTemplatePreview: !!firstTemplateId,
    previewTemplateId: firstTemplateId || null,
    ...REAL_BUSINESS_DEFAULTS,
  };
}

// 로그인 전/후 정부 지원사업 페이지, 상세페이지가 공통으로 쓰는 공고 목록 로더.
// 실제 businesses(서류 양식이 하나 이상 있는 사업만) + 임시 목업 4건을 합쳐 반환한다.
export async function loadAnnouncements() {
  const { data: businesses } = await supabase
    .from("businesses")
    .select("*, templates!inner(id)")
    .order("created_at", { ascending: false });

  const real = (businesses || []).map((b) => toRealAnnouncement(b, b.templates?.[0]?.id));
  return [...real, ...dummyAnnouncements];
}
