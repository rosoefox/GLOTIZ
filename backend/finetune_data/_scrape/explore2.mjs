import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

let fullList = [];
page.on('response', async (res) => {
  if (res.url().includes('getSupportBusinessList')) {
    try {
      const json = await res.json();
      if (json?.rs?.list) fullList = json.rs.list;
      console.log('pagination:', JSON.stringify(json?.rs?.pagination));
    } catch (e) {}
  }
});

await page.goto('https://www.jbok.kr/spWork/supportBDetailedList.do?js_op=103&menuId=88&recordSize=100', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

console.log('total items:', fullList.length);
for (const it of fullList) {
  console.log(it.SP_SEQ, '|', it.TITLE, '|', it.STS_TXT);
}

// 첫 항목 클릭해서 상세페이지 URL 패턴 확인
const firstRow = page.locator('[onclick], a').filter({ hasText: fullList[0]?.TITLE?.slice(0, 10) || '' }).first();
try {
  await Promise.all([
    page.waitForNavigation({ timeout: 8000 }).catch(() => null),
    firstRow.click({ timeout: 5000 }),
  ]);
  await page.waitForTimeout(1500);
  console.log('DETAIL_URL', page.url());
} catch (e) {
  console.log('click failed:', e.message);
}

await page.screenshot({ path: 'detail.png', fullPage: true });
await browser.close();
