// 지원사업 공고의 접수기간("YYYY.MM.DD ~ YYYY.MM.DD") 파싱/표기 관련 공용 유틸.
// businesses.basic_info(AI가 공고 원문에서 추출) 또는 목업 상세정보(govAnnouncementDetails)를 읽는다.

export function periodEndDate(business, govAnnouncementDetails) {
  const detail = business.basic_info || govAnnouncementDetails?.[business.id];
  const endStr = detail?.period?.split("~")[1]?.trim();
  if (!endStr) return null;
  const end = new Date(endStr.replace(/\./g, "-"));
  return Number.isNaN(end.getTime()) ? null : end;
}

export function isClosed(business, govAnnouncementDetails) {
  const end = periodEndDate(business, govAnnouncementDetails);
  return !!end && end < new Date();
}

export function formatTodayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}
