// 카테고리/국가/분기 기준 데이터와, 검색어에 대한 기본 필터값 추정 로직.
// 실제 수출 데이터·AI 코멘터리는 백엔드 `/market-analysis`(관세청 API + Gemini)에서 받아온다.

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

// 새로 검색한 상품에 대해 자동으로 선택될 기본 필터값.
// 카테고리는 검색어 키워드로 추정하고, 국가·분기는 처음엔 전체 범위로 넓게 보여준다.
export function pickDefaults(rawQuery) {
  const query = (rawQuery || "").trim() || "이 상품";
  return {
    categoryId: pickCategoryId(query),
    countryIds: ["all"],
    quarterIds: QUARTERS.map((q) => q.id),
  };
}
