import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://www.jbok.kr/spWork/supportBusinessView.do?menuId=88&spSeq=542cbb0a610f4c4499686b5be51b1311', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const html = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, li, div'));
  const hit = all.find((el) => el.textContent.includes('관련서식.zip') && el.textContent.length < 200);
  if (!hit) return 'NOT FOUND';
  // walk up 3 parents for context
  let node = hit;
  for (let i = 0; i < 3 && node.parentElement; i++) node = node.parentElement;
  return node.outerHTML;
});
console.log(html);

await browser.close();
