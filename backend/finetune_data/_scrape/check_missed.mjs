import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

let fullList = [];
page.on('response', async (res) => {
  if (res.url().includes('getSupportBusinessList')) {
    try {
      const json = await res.json();
      if (json?.rs?.list?.length) fullList = json.rs.list;
    } catch (e) {}
  }
});

await page.goto('https://www.jbok.kr/spWork/supportBDetailedList.do?js_op=103&menuId=88&recordSize=100', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const downloadedTitles = new Set([
  '2026년 MTA HANOI 전북 단체관 참여기업 모집',
  '2026년 김제시 통상마스터Youth 참여기업 2차 추가 모집',
  '2026년 마이오피스(지사화) 지원사업(상반기) 참여기업 모집',
  '2026년 김제시 통상마스터Youth 참여기업 모집',
  '2026년 김제시 통상마스터 모집',
  '2026년 전시회 개별 참가지원 사업 참여기업 모집',
  '전북 국가혁신클러스터육성(비R&D) 3차년도-이월 해외 개별 박람회 참여기업 모집',
  '2026년 전시회 개별 참가지원 사업 모집',
  '전북 국가혁신클러스터육성(비R&D) 해외 개별 박람회 참여기업 모집',
  '2026년 수출애로 해소 컨설팅 전문가 모집 공고',
  '2026년 김제시 통상닥터 참여기업 모집',
  '2026년 해외파트너사 모집',
  '2026년 중국 광저우 수출입상품교역회(켄톤페어 춘계3기) 수출컨소시엄 참여기업 모집',
]);

for (const item of fullList) {
  if (downloadedTitles.has(item.TITLE)) continue;
  const detailUrl = `https://www.jbok.kr/spWork/supportBusinessView.do?menuId=88&spSeq=${item.SP_SEQ}`;
  await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  const buttons = await page.$$('button.file');
  const files = [];
  for (const btn of buttons) {
    const onclick = (await btn.getAttribute('onclick')) || '';
    const m = onclick.match(/attachmentDown\('([^']+)'\s*,\s*'([^']+)'\)/);
    if (m) files.push(m[2]);
  }
  console.log('===', item.TITLE, '===');
  if (files.length === 0) console.log('  (첨부파일 없음)');
  files.forEach((f) => console.log('  -', f));
}

await browser.close();
