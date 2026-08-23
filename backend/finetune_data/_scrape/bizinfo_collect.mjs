import { chromium } from 'playwright';
import fs from 'fs';

const SAMPLE_SIZE = 80; // "샘플로 먼저" - 80건 수집
const rows = [];

const browser = await chromium.launch();
const page = await browser.newPage();

let cpage = 1;
while (rows.length < SAMPLE_SIZE && cpage <= 10) {
  const url = `https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?pblancId=&hashCode=07&rowsSel=15&rows=15&cpage=${cpage}&cat=&schJrsdCodeTy=&schWntyAt=&schAreaDetailCodes=&schEndAt=N&orderGb=&sort=&schPblancDiv=&condition=searchPblancNm&condition1=AND&preKeywords=&keyword=`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);

  const items = await page.$$eval('td.txt_l a[href*="pblancId="]', (as) =>
    as.map((a) => {
      const href = a.getAttribute('href');
      const m = href.match(/pblancId=([^&]+)/);
      return { pblancId: m ? m[1] : null, title: a.textContent.trim() };
    }).filter((x) => x.pblancId)
  );
  if (items.length === 0) {
    console.log('페이지', cpage, '- 더 이상 항목 없음, 중단');
    break;
  }
  console.log('페이지', cpage, '-', items.length, '건');
  rows.push(...items);
  cpage++;
}

console.log('총 수집:', rows.length);
fs.writeFileSync('bizinfo_list.json', JSON.stringify(rows.slice(0, SAMPLE_SIZE), null, 2), 'utf-8');
await browser.close();
