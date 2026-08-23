import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?pblancId=&hashCode=07&rowsSel=6&rows=15&cpage=1&cat=&schJrsdCodeTy=&schWntyAt=&schAreaDetailCodes=&schEndAt=N&orderGb=&sort=&schPblancDiv=&condition=searchPblancNm&condition1=AND&preKeywords=&keyword=', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const html = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, li, div, tr'));
  const hit = all.find((el) => el.textContent.includes('할랄') && el.textContent.length < 300);
  if (!hit) return 'NOT FOUND';
  let node = hit;
  for (let i = 0; i < 2 && node.parentElement; i++) node = node.parentElement;
  return node.outerHTML;
});
console.log(html);

// 클릭해서 실제 이동 URL 확인
const target = page.locator('a', { hasText: '할랄' }).first();
try {
  await Promise.all([
    page.waitForNavigation({ timeout: 8000 }).catch(() => null),
    target.click({ timeout: 5000 }),
  ]);
  await page.waitForTimeout(1000);
  console.log('AFTER_CLICK_URL:', page.url());
} catch (e) {
  console.log('click err', e.message);
}

await browser.close();
