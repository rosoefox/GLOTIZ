import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on('dialog', async (d) => {
  console.log('DIALOG:', d.type(), d.message());
  await d.accept();
});
page.on('popup', async (p) => {
  console.log('POPUP opened:', p.url());
  await p.waitForLoadState('load').catch(() => {});
  console.log('POPUP final url:', p.url());
});
context.on('page', (p) => console.log('NEW PAGE:', p.url()));
page.on('request', (req) => {
  if (/down|file|attach/i.test(req.url())) console.log('REQUEST:', req.method(), req.url());
});
page.on('response', (res) => {
  if (/down|file|attach/i.test(res.url())) console.log('RESPONSE:', res.status(), res.headers()['content-disposition'] || '', res.url());
});

await page.goto('https://www.jbok.kr/spWork/supportBusinessView.do?menuId=88&spSeq=542cbb0a610f4c4499686b5be51b1311', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const target = page.locator('a', { hasText: '관련서식.zip' }).first();
console.log('target count check ok');
await target.click({ timeout: 5000 }).catch((e) => console.log('click err', e.message));
await page.waitForTimeout(4000);
console.log('current url after click:', page.url());
console.log('num pages in context:', context.pages().length);

await browser.close();
