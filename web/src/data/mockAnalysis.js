// 백엔드/AI 연동 전, 검색어를 그럴듯한 분석 결과로 매핑하는 목업 로직.
// 같은 검색어는 항상 같은 결과를 주도록 해시 기반으로 결정한다.

export const CATEGORIES = [
  { id: "cosmetics", label: "화장품", hsCode: "3304.99", keywords: ["화장품", "뷰티", "코스메틱", "선크림", "크림", "로션", "향수", "스킨케어", "마스크팩"] },
  { id: "food", label: "식품", hsCode: "2106.90", keywords: ["식품", "푸드", "김치", "고추장", "라면", "스낵", "음료", "차", "소스", "과자"] },
  { id: "electronics", label: "전자기기", hsCode: "8517.62", keywords: ["전자", "가전", "스마트", "부품", "가전제품", "휴대폰", "이어폰", "배터리"] },
  { id: "fashion", label: "패션잡화", hsCode: "4202.92", keywords: ["패션", "의류", "옷", "신발", "가방", "잡화", "액세서리", "쥬얼리"] },
  { id: "household", label: "생활용품", hsCode: "3924.90", keywords: ["생활", "주방", "용품", "리빙", "인테리어", "청소"] },
];

export const COUNTRIES = ["베트남", "태국", "인도네시아", "필리핀", "말레이시아", "싱가포르"];

export const QUARTERS = [
  { id: "q1", label: "1분기 (1~3월)", months: ["1월", "2월", "3월"] },
  { id: "q2", label: "2분기 (4~6월)", months: ["4월", "5월", "6월"] },
  { id: "q3", label: "3분기 (7~9월)", months: ["7월", "8월", "9월"] },
  { id: "q4", label: "4분기 (10~12월)", months: ["10월", "11월", "12월"] },
];

const ALL_MONTHS = QUARTERS.flatMap((q) => q.months);

function hashStr(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function pickCategoryId(query) {
  const q = query.toLowerCase();
  const matched = CATEGORIES.find((c) => c.keywords.some((k) => q.includes(k)));
  return (matched || CATEGORIES[hashStr(query) % CATEGORIES.length]).id;
}

function pickCountry(query) {
  return COUNTRIES[hashStr(`${query}-country`) % COUNTRIES.length];
}

function pickQuarterId(query) {
  return QUARTERS[hashStr(`${query}-quarter`) % QUARTERS.length].id;
}

function monthValue(seed, month, highlighted) {
  const n = hashStr(`${seed}-${month}`) % 25;
  return highlighted ? 55 + n : 15 + n;
}

// 새로 검색한 상품에 대해 자동으로 선택될 기본 필터값
export function pickDefaults(rawQuery) {
  const query = (rawQuery || "").trim() || "이 상품";
  return {
    categoryId: pickCategoryId(query),
    countryIds: [pickCountry(query)],
    quarterIds: [pickQuarterId(query)],
  };
}

export function buildAnalysis(rawQuery, { categoryId, countryIds, quarterIds }) {
  const query = (rawQuery || "").trim() || "이 상품";
  const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];

  const isAllCountries = countryIds.includes("all") || countryIds.length === 0;
  const countries = isAllCountries ? COUNTRIES : countryIds;
  const countryLabel = isAllCountries ? "동남아시아 전역" : countries.join("·");

  const quarters = QUARTERS.filter((q) => quarterIds.includes(q.id));
  const activeQuarters = quarters.length ? quarters : [QUARTERS[0]];
  const quarterLabel = activeQuarters.map((q) => q.label.split(" ")[0]).join(", ");
  const monthsSet = new Set(activeQuarters.flatMap((q) => q.months));

  const headline = `"${query}"은(는) ${category.label} 품목이며 ${countryLabel}에서 ${quarterLabel}에 가장 많이 팔립니다.`;
  const body = `최근 3년간의 관세청 수출 데이터와 이커머스 트렌드를 기준으로, "${query}" 수출은 ${countryLabel} 시장에서 ${quarterLabel} 성수기에 집중되는 경향을 보입니다.`;

  const chartSeed = `${query}-${countryLabel}`;
  const chart = {
    title: "월별 수출 규모 추이",
    subtitle: `${category.label}(${category.hsCode}) → ${countryLabel}`,
    data: ALL_MONTHS.map((month) => {
      const highlighted = monthsSet.has(month);
      return { month, value: monthValue(chartSeed, month, highlighted), highlighted };
    }),
  };

  const keyMarketDrivers = [
    {
      icon: "growth",
      title: "K-콘텐츠 연계 효과",
      description: `현지 인플루언서와 K-콘텐츠 인기에 힘입어 ${countryLabel} 시장에서 ${category.label} 관련 소비재 수요가 늘고 있습니다.`,
    },
    {
      icon: "checkCircle",
      title: "현지화 대응 필요성",
      description: `${countryLabel}의 인증·기후 조건에 맞춘 ${category.label} 현지화가 ${quarterLabel} 성수기 진입의 핵심 요건입니다.`,
    },
    {
      icon: "truck",
      title: "물류 인프라 개선",
      description: `현지 이커머스 플랫폼의 라스트마일 배송망 확충으로 ${countryLabel}향 ${category.label} 크로스보더 진입 장벽이 완화되고 있습니다.`,
    },
  ];

  return { query, category, countries, countryLabel, quarters: activeQuarters, quarterLabel, headline, body, chart, keyMarketDrivers };
}

// 정부 지원사업이 방금 분석한 상품(카테고리/국가)에 적합한지 판단하는 목업 규칙
export function projectMatchesAnalysis(project, analysis) {
  if (!analysis) return null;
  const categoryOk = !project.matchCategories?.length || project.matchCategories.includes(analysis.category.id);
  const countryOk = !project.matchCountries?.length || project.matchCountries.some((c) => analysis.countries.includes(c));
  return categoryOk && countryOk;
}
