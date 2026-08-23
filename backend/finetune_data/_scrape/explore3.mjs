import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://www.jbok.kr/spWork/supportBusinessView.do?menuId=88&spSeq=542cbb0a610f4c4499686b5be51b1311', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const links = await page.$$eval('a', (as) => as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), onclick: a.getAttribute('onclick') })));
const attach = links.filter((l) => (l.onclick && /down|file|attach/i.test(l.onclick)) || (l.href && /down|file|attach/i.test(l.href)) || /\.(hwp|docx?|pdf|xlsx?|zip)/i.test(l.text));
console.log(JSON.stringify(attach, null, 2));

await page.screenshot({ path: 'detail_full.png', fullPage: true });
await browser.close();
