// 지원사업 공고의 접수기간("YYYY.MM.DD ~ YYYY.MM.DD") 파싱/표기 관련 공용 유틸.
// businesses.basic_info(AI가 공고 원문에서 추출) 또는 목업 상세정보(govAnnouncementDetails)를 읽는다.

// AI가 공고 원문에서 뽑은 마감 문구가 "사업비 소진 시 종료", "예산 소진시까지" 등
// 표현이 제각각이라, "사업비 예산 소진 시까지" 한 가지로 통일해서 보여준다.
const BUDGET_EXHAUSTED_RE =
  /[(（]\s*(?:사업비\s*)?(?:예산\s*)?소진\s*시?\s*(?:까지|종료|마감)?\s*[)）]|(?:사업비\s*)?(?:예산\s*)?소진\s*시?\s*(?:까지|종료|마감)?/g;

export function displayPeriod(business, govAnnouncementDetails) {
  const detail = business?.basic_info || govAnnouncementDetails?.[business?.id];
  const period = detail?.period || null;
  if (!period) return null;
  return period.replace(BUDGET_EXHAUSTED_RE, "사업비 예산 소진 시까지");
}

// AI가 공고 원문에서 뽑은 접수기간 텍스트는 형식이 들쭉날쭉하다: "2026.08.01 ~ 2026.08.18"
// 처럼 깔끔한 것도 있지만, "2026. 7. 30.(목)~8. 18.(화) 자정까지"처럼 끝 날짜에 연도가
// 없고 요일/부가 문구가 섞인 경우도 있다. new Date(문자열)에 그대로 맡기면 이런 건
// Invalid Date가 돼서 마감일이 "없는" 것으로 취급되는(=상시로 표시되는) 버그가 있었다.
// 그래서 연도/월/일 숫자만 정규식으로 뽑아내고, 끝 날짜에 연도가 없으면 시작 날짜의
// 연도를 그대로 물려받는다.
function parseKoreanDateFragment(str, fallbackYear) {
  if (!str) return null;
  const cleaned = str.replace(/\([^)]*\)/g, ""); // "(목)" 같은 요일 표기 제거
  const m = cleaned.match(/(?:(\d{4})[.\-/\s]*)?(\d{1,2})[.\-/\s]*(\d{1,2})/);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : fallbackYear;
  if (!year) return null;
  // 자정까지 접수라는 표현이 흔해서, 마감일 당일 하루는 열려있는 것으로 본다.
  const end = new Date(year, Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return Number.isNaN(end.getTime()) ? null : end;
}

export function periodEndDate(business, govAnnouncementDetails) {
  const period = displayPeriod(business, govAnnouncementDetails);
  if (!period) return null;
  const [startStr, endStr] = period.split("~").map((s) => s?.trim());
  const fallbackYear = startStr?.match(/\d{4}/)?.[0];
  return parseKoreanDateFragment(endStr, fallbackYear ? Number(fallbackYear) : undefined);
}

export function periodStartDate(business, govAnnouncementDetails) {
  const period = displayPeriod(business, govAnnouncementDetails);
  if (!period) return null;
  const [startStr] = period.split("~").map((s) => s?.trim());
  const fallbackYear = startStr?.match(/\d{4}/)?.[0];
  return parseKoreanDateFragment(startStr, fallbackYear ? Number(fallbackYear) : undefined);
}

export function isClosed(business, govAnnouncementDetails) {
  const end = periodEndDate(business, govAnnouncementDetails);
  return !!end && end < new Date();
}

export function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}
