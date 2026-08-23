// "라벨: 값" 형식으로 한 줄씩 입력된 SPEC 텍스트를 표 렌더링용 {label, value} 배열로 변환한다.
// 콜론이 없는 줄은 건너뛴다.
export function parseSpecLines(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.search(/[:：]/);
      if (idx === -1) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean);
}
