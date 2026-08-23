import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?pblancId=&hashCode=07&rowsSel=6&rows=15&cpage=1&cat=&schJrsdCodeTy=&schWntyAt=&schAreaDetailCodes=&schEndAt=N&orderGb=&sort=&schPblancDiv=&condition=searchPblancNm&condition1=AND&preKeywords=&keyword=', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// 목록 항목의 링크 구조 파악
const links = await page.$$eval('a', (as) =>
  as
    .map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') }))
    .filter((l) => l.href && (l.href.includes('pblanc') || l.href.includes('View')))
);
console.log('후보 링크 수:', links.length);
console.log(JSON.stringify(links.slice(0, 10), null, 2));

await page.screenshot({ path: 'bizinfo_list.png', fullPage: true });
await browser.close();
