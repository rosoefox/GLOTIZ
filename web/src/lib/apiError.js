function detailToMessage(detail) {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    const msgs = detail.map((d) => (typeof d === "string" ? d : d?.msg)).filter(Boolean);
    if (msgs.length) return msgs.join(" / ");
  }
  if (detail && typeof detail === "object" && typeof detail.msg === "string") return detail.msg;
  return null;
}

// 백엔드 에러 응답의 detail은 문자열, FastAPI 검증 오류 배열, 객체 등 형태가 다양하고
// 서버가 아예 JSON이 아닌 응답(예: 처리되지 않은 500)을 줄 수도 있다. 이를 항상 사람이
// 읽을 수 있는 문자열 메시지로 통일해서 "[object Object]" 같은 값이 화면에 뜨는 걸 막는다.
export async function readErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    return detailToMessage(data?.detail) || fallback;
  } catch {
    return fallback;
  }
}
