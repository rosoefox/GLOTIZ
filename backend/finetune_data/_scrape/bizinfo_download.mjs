import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('../real_forms_bizinfo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SKIP_KEYWORDS = /(모집공고|공고문|안내문|브로슈어|brochure|sales|카드뉴스|포스터|리플릿|현수막|배너)/i;

const list = JSON.parse(fs.readFileSync('bizinfo_list.json', 'utf-8'));

const browser = await chromium.launch();
const page = await browser.newPage();

const manifest = [];

for (const item of list) {
  const detailUrl = `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?hashCode=07&rowsSel=15&rows=15&cpage=1&cat=&schPblancDiv=&schJrsdCodeTy=&schWntyAt=&schAreaDetailCodes=&schEndAt=N&orderGb=&sort=&preKeywords=&condition=searchPblancNm&condition1=AND&keyword=&pblancId=${item.pblancId}`;
  try {
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(300);
  } catch (e) {
    console.log('DETAIL_FAIL', item.title, e.message);
    continue;
  }

  // fileBlank(...)/fileLoad(...) 에서 실제 파일명을, 바로 뒤 다운로드 href에서 fileDown.do URL을 짝지어 뽑는다
  const pairs = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    const out = [];
    let pendingName = null;
    for (const a of anchors) {
      const onclick = a.getAttribute('onclick') || '';
      const m = onclick.match(/file(Blank|Load)\([^,]+,\s*'([^']+)'\)/);
      if (m) {
        pendingName = m[2];
        continue;
      }
      const href = a.getAttribute('href') || '';
      if (href.includes('fileDown.do') && pendingName) {
        out.push({ fileName: pendingName, downloadHref: href });
        pendingName = null;
      }
    }
    return out;
  });

  for (const { fileName, downloadHref } of pairs) {
    if (SKIP_KEYWORDS.test(fileName)) continue;
    if (!/\.(hwp|hwpx|docx?|zip|xlsx?)$/i.test(fileName)) continue; // pdf 제외 (안내문 위주라 form 신호가 약함, hwp/hwpx/docx 위주로)

    manifest.push({
      pblancId: item.pblancId,
      title: item.title,
      fileName,
      url: `https://www.bizinfo.go.kr${downloadHref}`,
    });
  }
}

fs.writeFileSync('bizinfo_manifest.json', JSON.stringify(manifest, null, 2), 'utf-8');
console.log('다운로드 대상 파일 수:', manifest.length);
await browser.close();
