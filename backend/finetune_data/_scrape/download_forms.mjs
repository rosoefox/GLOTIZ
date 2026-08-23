import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('../real_forms');
fs.mkdirSync(OUT_DIR, { recursive: true });

const FORM_KEYWORDS = /(서식|양식|신청서|신청양식|첨부서류)/;
const SKIP_KEYWORDS = /(모집공고|공고문|안내문|브로슈어|brochure|sales|카드뉴스|포스터|리플릿)/i;

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

console.log('총 공고 수:', fullList.length);

const manifest = [];

for (const item of fullList) {
  const detailUrl = `https://www.jbok.kr/spWork/supportBusinessView.do?menuId=88&spSeq=${item.SP_SEQ}`;
  try {
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(400);
  } catch (e) {
    console.log('DETAIL_LOAD_FAIL', item.TITLE, e.message);
    continue;
  }

  const buttons = await page.$$('button.file');
  for (const btn of buttons) {
    const onclick = (await btn.getAttribute('onclick')) || '';
    const m = onclick.match(/attachmentDown\('([^']+)'\s*,\s*'([^']+)'\)/);
    if (!m) continue;
    const [, filePath, fileName] = m;
    if (!FORM_KEYWORDS.test(fileName) || SKIP_KEYWORDS.test(fileName)) continue;
    if (!/\.(hwp|hwpx|docx?|zip|pdf|xlsx?)$/i.test(fileName)) continue;

    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }),
        btn.click(),
      ]);
      const safeName = `${item.SP_SEQ}__${fileName}`.replace(/[\\/:*?"<>|]/g, '_');
      const savePath = path.join(OUT_DIR, safeName);
      await download.saveAs(savePath);
      manifest.push({ spSeq: item.SP_SEQ, title: item.TITLE, file: safeName, filePath, sourceUrl: detailUrl });
      console.log('OK', item.TITLE, '->', safeName);
    } catch (e) {
      console.log('DOWNLOAD_FAIL', item.TITLE, fileName, e.message);
    }
  }
}

fs.writeFileSync(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
console.log('총 다운로드:', manifest.length);

await browser.close();
