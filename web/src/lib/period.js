// 지원사업 공고의 접수기간("YYYY.MM.DD ~ YYYY.MM.DD") 파싱/표기 관련 공용 유틸.
// businesses.basic_info(AI가 공고 원문에서 추출) 또는 목업 상세정보(govAnnouncementDetails)를 읽는다.

const DEMO_SEPTEMBER_BUSINESS_IDS = new Set([
  "5090843f-cf8e-4945-a51d-69e1aa8e61e6",
  "da530822-7707-44b6-b3b8-93dba472815c",
  "bb7ab51f-5978-43f7-8f3e-bc85add54153",
]);
const DEMO_SEPTEMBER_PERIOD = "2026.08.01 ~ 2026.09.30";

export function displayPeriod(business, govAnnouncementDetails) {
  if (DEMO_SEPTEMBER_BUSINESS_IDS.has(business?.id)) return DEMO_SEPTEMBER_PERIOD;
  const detail = business?.basic_info || govAnnouncementDetails?.[business?.id];
  return detail?.period || null;
}

export function periodEndDate(business, govAnnouncementDetails) {
  const endStr = displayPeriod(business, govAnnouncementDetails)?.split("~")[1]?.trim();
  if (!endStr) return null;
  const end = new Date(endStr.replace(/\./g, "-"));
  return Number.isNaN(end.getTime()) ? null : end;
}

// 시연 중에는 실제 접수기간 대신 지정된 공고 한 건만 마감으로 취급한다.
const DEMO_CLOSED_TITLE = "지역혁신클러스터육성사업해외수출기업경쟁력강화지원사업참여기업모집";

export function isDemoOngoingBusiness(business) {
  const normalizedName = String(business?.name || "").replace(/\s+/g, "");
  return !normalizedName.includes(DEMO_CLOSED_TITLE);
}

export function isClosed(business, govAnnouncementDetails) {
  const end = periodEndDate(business, govAnnouncementDetails);
  return !!end && end < new Date();
}

export function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}
