// "임시저장"은 서버에 아무것도 쓰지 않고 브라우저에만 남겨서, 관리자 화면에는 실제로
// "서류 제출하기"를 눌러야만 보이게 한다. 키는 사용자+서식 단위로 구분한다.
export function draftKey(userId, templateId) {
  return `jbxport:draft:${userId}:${templateId}`;
}

export function readDraft(userId, templateId) {
  const raw = localStorage.getItem(draftKey(userId, templateId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
