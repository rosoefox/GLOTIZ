import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('download', (d) => console.log('DOWNLOAD_EVENT:', d.suggestedFilename(), d.url()));

await page.goto('https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?hashCode=07&rowsSel=6&rows=15&cpage=1&cat=&schPblancDiv=&schJrsdCodeTy=&schWntyAt=&schAreaDetailCodes=&schEndAt=N&orderGb=&sort=&preKeywords=&condition=searchPblancNm&condition1=AND&keyword=&pblancId=PBLN_000000000125694', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const anchors = await page.$$eval('a', (as) =>
  as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), onclick: a.getAttribute('onclick') }))
    .filter((l) => /\.(hwp|hwpx|docx?|zip|pdf|xlsx?)/i.test(l.text) || (l.onclick && /down|file/i.test(l.onclick)) || (l.href && /down|file/i.test(l.href)))
);
console.log(JSON.stringify(anchors, null, 2));

await browser.close();
