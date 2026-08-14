// sort_order 컬럼은 backend/sql/reorder_and_uploads.sql 마이그레이션을 실행해야 생긴다.
// 마이그레이션 전에도 화면이 비지 않도록, sort_order 정렬을 먼저 시도하고 실패하면
// 기존 정렬 기준으로 자동 폴백한다. 마이그레이션을 실행하면 자동으로 sort_order 정렬로 전환된다.
export async function orderedSelect(makeQuery, fallbackColumn, fallbackOptions) {
  const primary = await makeQuery().order("sort_order");
  if (!primary.error) return primary;
  return makeQuery().order(fallbackColumn, fallbackOptions);
}
