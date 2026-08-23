import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('response', async (res) => {
  if (res.url().includes('getSupportBusinessList')) {
    try {
      const json = await res.json();
      console.log('LIST_RESPONSE_COUNT', json?.rs?.list?.length);
      console.log('LIST_RESPONSE_SAMPLE', JSON.stringify(json?.rs?.list?.slice(0, 3), null, 2));
    } catch (e) {
      console.log('parse fail', e.message);
    }
  }
});

await page.goto('https://www.jbok.kr/spWork/supportBDetailedList.do?js_op=103&menuId=88', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'explore.png', fullPage: true });
console.log('done');
await browser.close();
