import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import Icon from "../components/Icon";
import { Button, CONTROL_CLASS, emptyFieldClass, SectionCardHeader, FieldLabel } from "../components/ui";
import { marketingMaterialCreator as mc } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";
import { useAuth } from "../context/AuthContext";
import { readErrorMessage } from "../lib/apiError";
import { convertFromKrw, EXCHANGE_RATE_PER_KRW } from "../lib/currency";
import { parseSpecLines } from "../lib/spec";
import thumbMinimal from "../../미니멀 클린.jpg";
import thumbLuxury from "../../럭셔리.jpg";
import thumbPop from "../../팝.jpg";
import thumbEmotional from "../../감성 무드.jpg";
import thumbModern from "../../모던.jpg";
import cardnewsThumbMinimal from "../../cardnews-minimal.png";
import cardnewsThumbLuxury from "../../cardnews-luxury.png";
import cardnewsThumbPop from "../../cardnews-pop.png";
import cardnewsThumbEmotional from "../../cardnews-emotional.png";
import detailThumbClassic from "../../detail-classic.png";
import detailThumbPremium from "../../detail-premium.png";
import detailThumbNatural from "../../detail-natural.png";
import detailThumbTrendy from "../../detail-trendy.png";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// Step 2 템플릿 카드에 쓰는 실제 예시 이미지 — 포스터/카드뉴스는 같은 스타일 이름(미니멀·럭셔리·팝·
// 감성)끼리 같은 사진을 재사용한다. 매칭되는 템플릿이 없으면 TemplateThumb의 기존 도형
// 플레이스홀더로 자연히 대체된다.
const TEMPLATE_THUMBS = {
  "tpl-poster-minimal": thumbMinimal,
  "tpl-poster-luxury": thumbLuxury,
  "tpl-poster-pop": thumbPop,
  "tpl-poster-emotional": thumbEmotional,
  "tpl-poster-modern": thumbModern,
  "tpl-cardnews-minimal": cardnewsThumbMinimal,
  "tpl-cardnews-luxury": cardnewsThumbLuxury,
  "tpl-cardnews-pop": cardnewsThumbPop,
  "tpl-cardnews-emotional": cardnewsThumbEmotional,
  "tpl-detail-classic": detailThumbClassic,
  "tpl-detail-premium": detailThumbPremium,
  "tpl-detail-natural": detailThumbNatural,
  "tpl-detail-trendy": detailThumbTrendy,
};

// 레이아웃별로 몇 장이 생성되는지 — Step 2 안내 배지/박스에 쓴다. 사용자가 고를 수 있는 값이
// 아니라 레이아웃 구조 자체가 고정하는 값이다(포스터 1장, 카드뉴스 4장, 상세설명 히어로+특징3+각도3=7장).
const LAYOUT_INFO = {
  poster: { noun: "포스터", count: 1 },
  "card-news": { noun: "카드뉴스", count: 4 },
  detail: { noun: "상세페이지", count: 7 },
};

// 상품 사진은 최대 이만큼 올릴 수 있다 — 여러 각도의 사진을 같이 넘기면 AI가 더 정확하게 생성한다.
const MAX_PRODUCT_PHOTOS = 4;

// 레이아웃별로 "대표 이미지"로 삼을 슬롯 — 버전 썸네일이나 저장 파일명 등에 쓴다.
const MAIN_SLOT_BY_LAYOUT = {
  poster: "poster",
  "card-news": "card-1",
  detail: "hero",
};

// 1~3단계에서 입력한 내용(사진·상품정보·템플릿)을 브라우저에만 임시저장해서, 페이지를
// 벗어났다 돌아오거나 뒤로가기를 해도 다시 입력할 필요 없게 한다. 사용자별로 구분한다.
function setupDraftKey(userId) {
  return `jbxport:marketing:setup:${userId || "guest"}`;
}

// 임시저장된 상품 사진(dataURL)을 실제 업로드에 쓸 수 있는 File 객체로 되돌린다.
function dataUrlToFile(dataUrl, filename, mimeType) {
  try {
    const [header, base64] = dataUrl.split(",");
    const mime = mimeType || header.match(/data:(.*?);base64/)?.[1] || "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename || "photo.png", { type: mime });
  } catch {
    return null;
  }
}

function findImage(images, slot) {
  return images?.find((img) => img.slot === slot)?.url;
}

// AI가 방금 채운 필드를 은은한 브랜드 컬러로 표시해서 눈에 띄게 한다 — emptyFieldClass와
// 같은 방식으로 border-slate-300/bg-white를 통째로 치환해야 우선순위 문제 없이 실제로 반영된다.
function aiFilledFieldClass(isAiFilled) {
  if (!isAiFilled) return CONTROL_CLASS;
  return CONTROL_CLASS.replace("border-slate-300", "border-brand-300").replace("bg-white", "bg-brand-50/30");
}

function AiFilledHint() {
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600">
      <Icon name="sparkle" className="w-3 h-3" />
      AI가 작성한 내용이에요. 검토 후 필요하면 수정해주세요.
    </p>
  );
}

// 아직 실제 생성 결과가 없는 템플릿 카드에 형태를 미리 보여주는 예시 썸네일 —
// 실사 이미지 대신 각 레이아웃의 구조(세로 포스터/가로 카드뉴스/세로 상세페이지)를 축소해 그린다.
// "4:5" 같은 W:H 문자열을 Tailwind aspect-ratio 클래스로 바꾼다 — Step 2 템플릿 썸네일이
// 실제로 그 템플릿이 생성할 이미지 비율과 같은 모양으로 보이게 하는 데 쓴다.
function aspectClassFor(ratio) {
  const map = {
    "4:5": "aspect-[4/5]",
    "9:16": "aspect-[9/16]",
    "4:3": "aspect-[4/3]",
    "1:2": "aspect-[1/2]",
  };
  return map[ratio] || "aspect-[3/4]";
}

function TemplateThumb({ layout, templateId, aspectRatio }) {
  const aspectClass = aspectClassFor(aspectRatio);
  const realThumb = TEMPLATE_THUMBS[templateId];
  if (realThumb && layout === "detail") {
    // 상세페이지 참고 사진은 스크롤이 긴 상세페이지 전체 스크린샷이라 세로로 아주 길다 —
    // 그대로 자르면 위쪽 일부만 남으므로, 위쪽 절반과 아래쪽 절반을 각각 크롭해서 위아래로
    // 이어 붙여 1:2 박스 안에 상단(히어로)과 하단(리뷰) 분위기가 같이 보이게 한다.
    return (
      <div className={`flex ${aspectClass} w-full flex-col overflow-hidden bg-slate-100`}>
        <div className="relative h-1/2 w-full overflow-hidden">
          <img src={realThumb} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        </div>
        <div className="relative h-1/2 w-full overflow-hidden border-t border-white/40">
          <img src={realThumb} alt="" className="absolute inset-0 h-full w-full object-cover object-bottom" />
        </div>
      </div>
    );
  }
  if (realThumb) {
    return (
      <div className={`relative ${aspectClass} w-full overflow-hidden bg-slate-100`}>
        <img src={realThumb} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  if (layout === "poster") {
    return (
      <div className={`relative ${aspectClass} w-full overflow-hidden bg-gradient-to-b from-rose-200 via-orange-100 to-amber-50`}>
        <div className="absolute inset-x-4 top-3 h-1 rounded-full bg-white/80" />
        <div className="absolute inset-x-6 top-1/2 h-2.5 -translate-y-1/2 rounded bg-white/90" />
        <div className="absolute inset-x-9 bottom-4 h-1 rounded-full bg-white/70" />
      </div>
    );
  }
  if (layout === "card-news") {
    return (
      <div className={`flex ${aspectClass} w-full items-stretch gap-1 bg-slate-100 p-2.5`}>
        <div className="flex-1 rounded bg-sky-200" />
        <div className="flex-1 rounded bg-violet-200" />
        <div className="flex-1 rounded bg-teal-200" />
      </div>
    );
  }
  return (
    <div className={`flex ${aspectClass} w-full flex-col gap-1 bg-slate-100 p-2.5`}>
      <div className="h-2/5 rounded bg-slate-300" />
      <div className="flex flex-1 gap-1">
        <div className="flex-1 rounded bg-slate-200" />
        <div className="flex-1 rounded bg-slate-200" />
      </div>
    </div>
  );
}

// 모든 포스터 템플릿(럭셔리&프리미엄/미니멀&클린/팝&컬러풀/감성&무드/모던&대담)과 카드뉴스는
// Gemini가 상품명·태그라인·가격 같은 문구를 이미지 픽셀에 직접 그려 넣는다(백엔드 main.py의
// _generate_poster/_generate_card_news 참고) — 그래서 프론트는 더 이상 텍스트를 오버레이하지 않는다.
function bakesTextIntoImage(layout) {
  return layout === "card-news" || layout === "poster";
}

function PosterPreview({ images, aspectRatio = "4:5" }) {
  const url = findImage(images, "poster");
  const ratioClass = aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]";
  return (
    <div
      className={`relative mx-auto ${ratioClass} w-full max-w-sm overflow-hidden rounded-2xl shadow-lg`}
    >
      {url && <img src={url} alt="포스터" className="absolute inset-0 h-full w-full object-cover" />}
    </div>
  );
}

// 카드뉴스는 럭셔리 포스터와 마찬가지로 Gemini가 문구를 이미지 안에 직접 그려 넣기 때문에,
// 프론트는 오버레이 없이 생성된 사진을 그대로 보여주기만 한다.
function CardNewsPreview({ images }) {
  const cardCount = images?.length || 4;
  const cards = Array.from({ length: cardCount }, (_, i) => `card-${i + 1}`);

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {cards.map((slot) => {
        const url = findImage(images, slot);
        return (
          <div
            key={slot}
            className="relative aspect-square w-full max-w-sm shrink-0 snap-center overflow-hidden rounded-2xl shadow-lg"
          >
            {url && <img src={url} alt={slot} className="absolute inset-0 h-full w-full object-cover" />}
          </div>
        );
      })}
    </div>
  );
}

// 상세페이지 템플릿별 텍스트 영역 테마 — AI가 만드는 상품 사진은 이미 템플릿 톤(스타일 힌트·참고
// 이미지)에 맞춰 생성되는데, 그 사진을 감싸는 헤딩/설명/스펙표/배경까지 흰 배경·검은 글자 그대로면
// 사진과 이질감이 크다. 그래서 배경·글자색·구분선·헤딩 폰트를 템플릿마다 다르게 준다.
// headerBg/altSectionBg는 사진 없이 글자만 놓이는 구간(헤더, 각도 섹션 타이틀)에 쓰는 은은한
// 그라디언트 배경 — 참고 디자인들의 배경이 단색이 아니라 은은한 빛·번짐·베인 결이 있는 것처럼, 그
// 질감을 CSS 그라디언트만으로 흉내낸다. page는 사진과 나란히 있는 구간(특징 행/스펙/하단 문구)에
// 쓰는 차분한 단색 — 사진이 이미 시각적 밀도를 담당하므로 그 옆 글자 배경은 단순하게 둔다.
// 헤딩 폰트는 4종 템플릿 모두 Bebas Neue로 통일한다 — 한글에는 이 폰트에 글자가 없어서 자동으로
// Pretendard로 대체되므로, 영어 문구에만 적용된 것처럼 보인다.
const DETAIL_HEADING_FONT = "font-['Bebas_Neue','Pretendard_Variable',sans-serif]";

const DETAIL_THEMES = {
  // 01_classic_white.png: 거의 흰색에 가까운 웜아이보리 배경, 차콜에 가까운 짙은 헤딩, 절제된 웜그레이 본문.
  "tpl-detail-classic": {
    page: "bg-[#faf8f3]",
    labelBg: "bg-[#f1ecdf]",
    headerBg:
      "radial-gradient(ellipse 320px 200px at 88% 8%, rgba(70,58,32,0.07), transparent 70%), " +
      "radial-gradient(ellipse 260px 300px at 6% 96%, rgba(70,58,32,0.06), transparent 70%), " +
      "linear-gradient(180deg, #fcfaf5, #f4eee0)",
    altSectionBg:
      "radial-gradient(ellipse 320px 220px at 14% 12%, rgba(255,255,255,0.6), transparent 60%), " +
      "linear-gradient(180deg, #f3ede0, #ece4d1)",
    heading: `${DETAIL_HEADING_FONT} text-[#262220]`,
    eyebrow: "text-[#8c8060]",
    body: "text-[#5c5648]",
    divider: "border-[#ddd2b8]",
    disclaimer: "text-[#a89d84]",
  },
  // 02_premium_dark.png: 거의 검정 배경, 헤딩·섹션 타이틀은 골드, 본문/캡션은 아이보리·웜그레이.
  "tpl-detail-premium": {
    page: "bg-[#0d0d0d]",
    labelBg: "bg-[#1a1a1a]",
    headerBg:
      "radial-gradient(ellipse 520px 280px at 50% 0%, rgba(201,162,39,0.18), transparent 60%), " +
      "linear-gradient(135deg, rgba(201,162,39,0.08) 0%, transparent 35%, transparent 65%, rgba(201,162,39,0.08) 100%), " +
      "linear-gradient(180deg, #141414, #0b0b0b)",
    altSectionBg:
      "radial-gradient(ellipse 440px 240px at 50% 100%, rgba(201,162,39,0.13), transparent 60%), " +
      "linear-gradient(180deg, #1c1c1c, #131313)",
    heading: `${DETAIL_HEADING_FONT} text-[#caa24d]`,
    eyebrow: "text-[#ece4d3]",
    body: "text-[#b7ad9c]",
    divider: "border-[#332c1c]",
    disclaimer: "text-[#6f6a5c]",
  },
  // 03_natural_organic.png: 웜베이지 배경, 짙은 포레스트 그린 헤딩, 우드톤 본문.
  "tpl-detail-natural": {
    page: "bg-[#f6efe2]",
    labelBg: "bg-[#ece2cc]",
    headerBg:
      "radial-gradient(ellipse 300px 220px at 12% 10%, rgba(255,255,255,0.5), transparent 60%), " +
      "radial-gradient(ellipse 280px 280px at 92% 88%, rgba(63,90,44,0.16), transparent 60%), " +
      "linear-gradient(180deg, #f8f2e5, #eee3cd)",
    altSectionBg:
      "radial-gradient(ellipse 340px 220px at 85% 15%, rgba(63,90,44,0.14), transparent 60%), " +
      "linear-gradient(180deg, #ece2cc, #e2d4b8)",
    heading: `${DETAIL_HEADING_FONT} text-[#2f4a28]`,
    eyebrow: "text-[#6d8a54]",
    body: "text-[#5c5440]",
    divider: "border-[#ddd0ac]",
    disclaimer: "text-[#9b9276]",
  },
  // 04_trendy_pop.png: 라벤더 -> 핑크 그라디언트 배경, 비비드 바이올렛 헤딩/본문.
  "tpl-detail-trendy": {
    page: "bg-[#f9f6fc]",
    labelBg: "bg-[#f1e8fa]",
    headerBg:
      "radial-gradient(circle 300px at 88% 8%, rgba(255,140,190,0.28), transparent 55%), " +
      "radial-gradient(circle 300px at 8% 92%, rgba(150,110,235,0.24), transparent 55%), " +
      "linear-gradient(160deg, #f3e9fb, #ece3fa 45%, #fbe9f3)",
    altSectionBg:
      "radial-gradient(circle 280px at 10% 15%, rgba(150,110,235,0.18), transparent 55%), " +
      "linear-gradient(180deg, #f1e8fa, #eaddf6)",
    heading: `${DETAIL_HEADING_FONT} text-[#6d3aa8]`,
    eyebrow: "text-[#9a6fc9]",
    body: "text-[#6b5f7c]",
    divider: "border-[#e2d2f4]",
    disclaimer: "text-[#a698b8]",
  },
};

const DEFAULT_DETAIL_THEME = {
  page: "bg-white",
  labelBg: "bg-slate-50",
  headerBg: "#ffffff",
  altSectionBg: "#f8fafc",
  heading: "font-serif text-slate-900",
  eyebrow: "text-slate-400",
  body: "text-slate-500",
  divider: "border-slate-100",
  disclaimer: "text-slate-400",
};

function DetailPreview({ images, copy, preview, specLines, templateId }) {
  const heroUrl = findImage(images, "hero");
  const captions = copy?.captions || [];
  const theme = DETAIL_THEMES[templateId] || DEFAULT_DETAIL_THEME;
  const angles = [
    { slot: "angle-front", label: "정면" },
    { slot: "angle-back", label: "후면" },
    { slot: "angle-top", label: "위" },
  ];

  return (
    <div className={`w-full overflow-hidden rounded-2xl shadow-lg ${theme.page}`}>
      <div className="py-12 text-center" style={{ background: theme.headerBg }}>
        <h2 className={`text-3xl font-semibold tracking-tight ${theme.heading}`}>{preview.productName}</h2>
        {preview.tagline && (
          <p className={`mt-3 text-sm font-medium tracking-wide ${theme.eyebrow}`}>{preview.tagline}</p>
        )}
      </div>

      {heroUrl && <img src={heroUrl} alt="히어로" className="aspect-[16/9] w-full object-cover" />}

      {[0, 1, 2].map((i) => {
        const url = findImage(images, `feature-${i + 1}`);
        const caption = captions[i] || {};
        return (
          <div
            key={i}
            className={`flex flex-col items-center gap-0 md:flex-row ${theme.page} ${i === 1 ? "md:flex-row-reverse" : ""}`}
          >
            <div className="aspect-square w-full md:w-1/2">
              {url && <img src={url} alt={caption.heading} className="h-full w-full object-cover" />}
            </div>
            <div className="w-full space-y-2.5 px-8 py-10 md:w-1/2">
              <p className={`text-[11px] font-semibold tracking-[0.25em] ${theme.eyebrow}`}>{caption.eyebrow}</p>
              <h3 className={`text-xl font-semibold ${theme.heading}`}>{caption.heading}</h3>
              <p className={`text-sm leading-relaxed ${theme.body}`}>{caption.description}</p>
            </div>
          </div>
        );
      })}

      <div className="py-12 text-center" style={{ background: theme.altSectionBg }}>
        <h3 className={`text-lg font-semibold ${theme.heading}`}>
          {copy?.angleTitle || "다양한 각도에서 확인하세요"}
        </h3>
        <div className="mt-6 grid grid-cols-3 gap-3 px-6">
          {angles.map(({ slot, label }) => {
            const url = findImage(images, slot);
            return (
              <div key={slot} className={`aspect-square overflow-hidden rounded-xl ${theme.divider} border`}>
                {url && <img src={url} alt={label} className="h-full w-full object-cover" />}
              </div>
            );
          })}
        </div>
      </div>

      {specLines.length > 0 && (
        <div className={`px-8 py-10 ${theme.page}`}>
          <h3 className={`mb-4 text-lg font-semibold tracking-wide ${theme.heading}`}>SPEC</h3>
          <div className={`overflow-hidden rounded-xl border ${theme.divider}`}>
            {specLines.map((row, i) => (
              <div
                key={row.label + i}
                className={`flex ${i > 0 ? `border-t ${theme.divider}` : ""}`}
              >
                <div className={`w-28 shrink-0 px-4 py-3 text-sm font-semibold ${theme.labelBg} ${theme.body}`}>
                  {row.label}
                </div>
                <div className={`px-4 py-3 text-sm ${theme.body}`}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={`pb-8 text-center text-xs ${theme.disclaimer} ${theme.page}`}>
        {copy?.disclaimer || "※ 이미지는 연출된 예시이며 실제 상품과 다를 수 있습니다."}
      </p>
    </div>
  );
}

// 결과 페이지 미리보기 자리에서 generatedResult.layout에 맞춰 알맞은 미리보기 컴포넌트를 고른다.
function LayoutPreview({ layout, images, copy, preview, specLines, templateId, aspectRatio }) {
  if (layout === "poster") return <PosterPreview images={images} aspectRatio={aspectRatio} />;
  if (layout === "card-news")
    return <CardNewsPreview images={images} />;
  if (layout === "detail")
    return <DetailPreview images={images} copy={copy} preview={preview} specLines={specLines} templateId={templateId} />;
  return null;
}

// 이미지 생성/수정 중 결과 미리보기 자리에 보여주는 로딩 연출 — 사각 프레임과 사진 아이콘을
// 연필이 테두리를 따라 그려나가는 듯한 스케치 애니메이션으로 표현한다.
function PencilDrawingLoader({ label }) {
  return (
    <div className="relative flex min-h-[520px] flex-col items-center justify-center gap-5 overflow-hidden rounded-md border border-slate-200 bg-slate-900 p-8 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/30 to-slate-900/70" />
      <div className="pointer-events-none absolute inset-0 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative flex h-40 w-40 items-center justify-center text-brand-300">
        <svg viewBox="0 0 160 160" className="h-40 w-40" fill="none">
          <rect
            x="16"
            y="26"
            width="128"
            height="108"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            className="animate-sketch-draw"
            style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
          />
          <circle
            cx="48"
            cy="58"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            pathLength="1"
            className="animate-sketch-draw text-brand-200/80"
            style={{ strokeDasharray: 1, strokeDashoffset: 1, animationDelay: "0.3s" }}
          />
          <path
            d="M22 118 L58 84 L80 104 L104 76 L138 118"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            className="animate-sketch-draw text-brand-200/80"
            style={{ strokeDasharray: 1, strokeDashoffset: 1, animationDelay: "0.5s" }}
          />
        </svg>
      </div>

      <div className="relative flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-white/60">최대 1~2분 정도 걸릴 수 있어요</p>
      </div>
    </div>
  );
}

const TRANSLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ภาษาไทย" },
];

// 이미지에 얹힐 언어를 미리 고르는 드롭다운. 생성 전에 고르면 "이미지 생성하기"를 누를 때
// 바로 그 언어로 생성되고, 이미 생성된 이미지가 있는 상태에서 고르면 문구만 바로 번역해서 바꿔친다.
// 이미지 자체(사진)는 다시 만들지 않고, 오버레이 텍스트만 번역해서 그 위에 얹는 방식이다.
function TranslateMenu({ activeLang, translating, onTranslate, disabled }) {
  const [open, setOpen] = useState(false);
  const activeLabel = TRANSLATE_LANGUAGES.find((l) => l.code === activeLang)?.label;
  return (
    <div className="relative">
      <Button
        variant="secondary"
        className="py-2"
        onClick={() => setOpen((v) => !v)}
        disabled={translating || disabled}
      >
        <Icon name="globe" className="w-5 h-5" />
        {translating ? "번역 중..." : activeLabel ? `이미지 언어: ${activeLabel}` : "이미지 언어 설정하기"}
        <Icon name="chevronDown" className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && !disabled && (
        <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onTranslate("ko");
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            한국어(원본)
            {activeLang === null && <Icon name="check" className="w-5 h-5 text-brand-600" />}
          </button>
          {TRANSLATE_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                onTranslate(lang.code);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {lang.label}
              {activeLang === lang.code && <Icon name="check" className="w-5 h-5 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketingMaterialCreator() {
  // "setup" = 1~3단계로 사진/정보/템플릿을 채우는 화면, "result" = 생성된 이미지를 보고
  // 프롬프트로 다듬거나 저장하는 화면.
  const [stage, setStage] = useState("setup");
  const [activeTemplate, setActiveTemplate] = useState(
    mc.templates.items.find((t) => t.selected)?.id
  );
  const [activeCategory, setActiveCategory] = useState(mc.templates.categories[0]);
  const [posterAspectRatio, setPosterAspectRatio] = useState("4:5");
  const [useAiModel, setUseAiModel] = useState(false);
  const [preview, setPreview] = useState({
    productName: "",
    tagline: "",
    description: "",
    mustHavePhoto: "",
    price: "",
  });
  const [spec, setSpec] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoImage, setLogoImage] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedResult, setGeneratedResult] = useState(null);
  const [aiFillingInfo, setAiFillingInfo] = useState(false);
  const [aiFillError, setAiFillError] = useState("");
  const [aiFilledFields, setAiFilledFields] = useState(() => new Set()); // AI가 채운 뒤 아직 사용자가 손대지 않은 필드
  const [priceReason, setPriceReason] = useState(""); // AI가 추천한 가격의 근거 — 가격 필드 밑에 표시
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const [activeLang, setActiveLang] = useState(null); // null이면 한국어 원본
  const [originalPreview, setOriginalPreview] = useState(null);
  const [originalCopy, setOriginalCopy] = useState(null);
  const [originalSpec, setOriginalSpec] = useState(null);

  // 결과 페이지 전용: 프롬프트로 이미지 수정하기 + 이전 버전 목록
  const [editPrompt, setEditPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [versionHistory, setVersionHistory] = useState([]);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [savingVersionImage, setSavingVersionImage] = useState(false);

  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const previewRef = useRef(null);
  const historyPreviewRef = useRef(null);
  const { addImage } = useMarketingImages();
  const { session, user } = useAuth();
  const [showPreviousContent, setShowPreviousContent] = useState(false);

  // 1~3단계에서 채운 내용을 브라우저에 저장해두고, 다시 이 페이지로 돌아오면 그대로 불러온다.
  useEffect(() => {
    const raw = localStorage.getItem(setupDraftKey(user?.id));
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.preview) setPreview(saved.preview);
      if (typeof saved.spec === "string") setSpec(saved.spec);
      if (saved.activeTemplate) setActiveTemplate(saved.activeTemplate);
      if (saved.activeCategory) setActiveCategory(saved.activeCategory);
      if (saved.posterAspectRatio) setPosterAspectRatio(saved.posterAspectRatio);
      if (typeof saved.useAiModel === "boolean") setUseAiModel(saved.useAiModel);
      if (Array.isArray(saved.uploadedPhotos) && saved.uploadedPhotos.length) {
        const files = [];
        const images = [];
        for (const p of saved.uploadedPhotos) {
          if (!p?.dataUrl) continue;
          const file = dataUrlToFile(p.dataUrl, p.name, p.type);
          if (!file) continue;
          files.push(file);
          images.push(p.dataUrl);
        }
        if (files.length) {
          setUploadedFiles(files);
          setUploadedImages(images);
        }
      }
      if (saved.logo?.dataUrl) {
        const logoFileRestored = dataUrlToFile(saved.logo.dataUrl, saved.logo.name, saved.logo.type);
        if (logoFileRestored) {
          setLogoFile(logoFileRestored);
          setLogoImage(saved.logo.dataUrl);
        }
      }
      // 생성된 이미지도 같이 임시저장해서, 페이지를 새로고침하거나 실수로 벗어나도
      // 다시 생성할 필요 없이 그대로 이어볼 수 있게 한다.
      if (saved.generatedResult) setGeneratedResult(saved.generatedResult);
      if (Array.isArray(saved.versionHistory)) setVersionHistory(saved.versionHistory);
      if (saved.activeLang !== undefined) setActiveLang(saved.activeLang);
      if (saved.originalPreview) setOriginalPreview(saved.originalPreview);
      if (saved.originalCopy) setOriginalCopy(saved.originalCopy);
      if (typeof saved.originalSpec === "string") setOriginalSpec(saved.originalSpec);
    } catch {
      // 저장된 내용이 깨졌으면 무시하고 빈 화면으로 시작한다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const payload = {
      preview,
      spec,
      activeTemplate,
      activeCategory,
      posterAspectRatio,
      useAiModel,
      uploadedPhotos: uploadedFiles.map((file, i) => ({
        dataUrl: uploadedImages[i],
        name: file.name,
        type: file.type,
      })),
      logo: logoFile && logoImage ? { dataUrl: logoImage, name: logoFile.name, type: logoFile.type } : null,
      generatedResult,
      versionHistory,
      activeLang,
      originalPreview,
      originalCopy,
      originalSpec,
    };
    try {
      localStorage.setItem(setupDraftKey(user?.id), JSON.stringify(payload));
    } catch {
      // 저장 공간이 부족하면(용량 큰 사진 등) 조용히 건너뛴다 — 화면 동작에는 영향 없다.
    }
  }, [
    user?.id, preview, spec, activeTemplate, activeCategory, posterAspectRatio, useAiModel,
    uploadedFiles, uploadedImages, logoFile, logoImage,
    generatedResult, versionHistory, activeLang, originalPreview, originalCopy, originalSpec,
  ]);

  const handleSaveImage = async () => {
    if (!previewRef.current) return;
    setSavingImage(true);
    setSaveError("");
    try {
      const dataUrl = await toPng(previewRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `마케팅이미지_${preview.productName || "이미지"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setSaveError("이미지 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSavingImage(false);
    }
  };

  const handleSaveVersionImage = async () => {
    if (!historyPreviewRef.current) return;
    setSavingVersionImage(true);
    try {
      const dataUrl = await toPng(historyPreviewRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `마케팅이미지_${preview.productName || "이미지"}_${viewingVersion?.label || ""}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // 저장 실패는 조용히 무시 — 다시 눌러보게 버튼은 그대로 둔다.
    } finally {
      setSavingVersionImage(false);
    }
  };

  const handlePreviewChange = (field) => (e) => {
    setPreview((p) => ({ ...p, [field]: e.target.value }));
    // 사용자가 AI가 채운 값을 직접 고치면, 이제 검토·수정이 끝난 값이니 "AI 작성" 표시를 뗀다.
    setAiFilledFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
    if (field === "price") setPriceReason("");
  };

  // templateIdOverride를 주면 그 템플릿 기준으로 채운다 — 템플릿을 막 바꾼 직후에는
  // activeTemplate 상태가 아직 리렌더 전이라 최신값을 못 읽을 수 있어서, 방금 고른 id를
  // 직접 넘겨받아 쓴다(handleTemplateSelect 참고).
  const runAiFillInfo = async (templateIdOverride) => {
    if (!preview.productName.trim()) {
      setAiFillError("상품명을 입력해야 작성 가능합니다.");
      return;
    }
    if (uploadedFiles.length === 0) {
      setAiFillError("먼저 상품 사진을 넣어주세요.");
      return;
    }
    setAiFillingInfo(true);
    setAiFillError("");
    try {
      const template = mc.templates.items.find((t) => t.id === (templateIdOverride ?? activeTemplate));
      const formData = new FormData();
      formData.append("product_name", preview.productName);
      uploadedFiles.forEach((file) => formData.append("product_images", file));
      if (logoFile) formData.append("logo", logoFile);
      if (template?.styleHint) formData.append("style_hint", template.styleHint);
      const res = await fetch(`${BACKEND_URL}/marketing/ai-fill`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "AI 채우기에 실패했습니다."));
      const data = await res.json();
      setPreview((p) => ({
        ...p,
        tagline: data.tagline || "",
        description: data.description || "",
        mustHavePhoto: data.must_have_photo || "",
        price: data.price || "",
      }));
      setPriceReason(data.price_reason || "");
      setAiFilledFields(new Set(["tagline", "description", "mustHavePhoto", "price"]));
      setGeneratedResult(null);
      setGenerateError("");
    } catch (err) {
      setAiFillError(err.message || "AI 채우기에 실패했습니다.");
    } finally {
      setAiFillingInfo(false);
    }
  };

  const handleAiFillInfo = () => runAiFillInfo();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = MAX_PRODUCT_PHOTOS - uploadedFiles.length;
    files.slice(0, room).forEach((file) => {
      // blob URL 대신 dataURL을 쓴다 — blob URL은 새로고침/재방문 시 곧바로 무효가 되어
      // 임시저장한 내용을 복원할 수 없기 때문이다.
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        setUploadedFiles((prev) => [...prev, file]);
        setUploadedImages((prev) => [...prev, dataUrl]);
        addImage(dataUrl, preview.productName || file.name);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoFile(file);
      setLogoImage(reader.result);
    };
    reader.readAsDataURL(file);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoImage(null);
  };

  // 템플릿을 바꾸면 그 템플릿의 스타일 톤에 맞춰 상품명을 뺀 나머지 정보(태그라인/설명/가격/
  // 필수 장면/스펙)를 새로 작성한다 — 이전 템플릿 기준으로 써둔 문구가 새 템플릿과 안 맞는
  // 채로 남아있지 않도록, 일단 비우고(사진·상품명이 준비돼 있으면) AI로 다시 채운다.
  // activeLang도 반드시 같이 초기화해야 한다 — 안 그러면 이전 템플릿에서 이미지 언어를 설정해둔
  // 상태가 그대로 남아서, 새 템플릿에서는 언어를 따로 설정하지 않았는데도 languageChosen이 true가
  // 되어 빈칸만 채우면 바로 "이미지 생성하기"가 활성화돼버린다.
  const handleTemplateSelect = (id) => {
    if (id === activeTemplate) return;
    setActiveTemplate(id);
    setGeneratedResult(null);
    setGenerateError("");
    setPreview((p) => ({ ...p, tagline: "", description: "", mustHavePhoto: "", price: "" }));
    setSpec("");
    setPriceReason("");
    setAiFilledFields(new Set());
    setActiveLang(null);
    setOriginalPreview(null);
    setOriginalCopy(null);
    setOriginalSpec(null);
    if (preview.productName.trim() && uploadedFiles.length > 0) {
      runAiFillInfo(id);
    }
  };

  // 새 버전(최초 생성/재제작/프롬프트 수정)이 나올 때마다 목록 맨 앞에 얹는다. 문구(상품명/
  // 태그라인 등)는 시점마다 다를 수 있어 버전별로 그 순간의 preview/spec도 같이 저장해둔다.
  const pushVersion = (result, previewSnapshot, specSnapshot) => {
    setVersionHistory((prev) => [
      {
        id: `v-${Date.now()}`,
        label: `버전 ${prev.length + 1}`,
        layout: result.layout,
        templateId: result.template_id,
        aspectRatio: posterAspectRatio,
        images: result.images,
        copy: result.copy,
        preview: previewSnapshot,
        spec: specSnapshot,
      },
      ...prev,
    ]);
  };

  // langOverride를 안 주면 현재 activeLang을 쓴다. 언어가 정해져 있으면 생성 "전에" 먼저
  // 번역해서 그 번역된 문구로 생성 요청을 보낸다 — 럭셔리&프리미엄처럼 AI가 문구를 이미지
  // 안에 직접 그려 넣는 템플릿은 사후 번역으로는 이미지 속 글자를 바꿀 수 없어서, 반드시
  // 생성 전에 번역까지 끝나 있어야 "정한 언어로" 이미지가 나온다.
  const runGenerate = async (langOverride) => {
    const lang = langOverride !== undefined ? langOverride : activeLang;
    setGenerating(true);
    setGenerateError("");
    try {
      const template = mc.templates.items.find((t) => t.id === activeTemplate);
      // 카드뉴스/포스터는 Gemini가 문구를 이미지 픽셀에 직접 그려 넣는데, 이 모델은 한글 글자를
      // 깨뜨려서 그린다. 사용자가 언어를 따로 고르지 않았으면(=한국어 그대로 생성) 화면 입력값은
      // 한국어로 그대로 두되, AI에게 넘기는 문구만 조용히 영어로 번역해서 보낸다.
      const textBaked = bakesTextIntoImage(template?.layout);
      const genLang = lang || (textBaked ? "en" : null);

      // lang(사용자가 Step3 "이미지 언어 설정하기"로 이미 고른 언어)이 있으면 preview는 그때
      // runTranslate가 이미 그 언어로 번역해 저장해뒀으므로 그대로 쓴다. 여기서 또 번역하면
      // 이미 번역된 문구를 한 번 더 번역하는 이중 번역이 된다. 문구를 이미지에 굽는 템플릿인데
      // 사용자가 언어를 따로 안 골라 genLang이 자동으로 "en"이 된 경우에만(preview가 아직
      // 한국어 그대로라서) 여기서 번역이 필요하다.
      let genPreview = preview;
      if (genLang && !lang) {
        try {
          const { nextPreview } = await applyTranslation(genLang, preview, null, spec);
          genPreview = nextPreview;
        } catch (err) {
          setTranslateError(err.message);
        }
      }

      const formData = new FormData();
      formData.append("layout", template?.layout || "poster");
      formData.append("product_name", genPreview.productName);
      formData.append("tagline", genPreview.tagline);
      formData.append("description", genPreview.description);
      formData.append("must_have_photo", preview.mustHavePhoto);
      formData.append("price", genPreview.price);
      uploadedFiles.forEach((file) => formData.append("product_images", file));
      if (logoFile) formData.append("logo", logoFile);
      formData.append("template_id", activeTemplate || "");
      formData.append("target_language", genLang || "ko");
      if (template?.layout === "poster") formData.append("aspect_ratio", posterAspectRatio);
      formData.append("use_ai_model", String(useAiModel));
      if (template?.styleHint) formData.append("style_hint", template.styleHint);

      const res = await fetch(`${BACKEND_URL}/marketing/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "이미지 생성에 실패했습니다."));
      const data = await res.json();

      let finalResult = data;
      let previewSnapshot = preview;
      let specSnapshot = spec;

      if (lang) {
        // preview/spec은 Step3에서 이미 이 언어로 번역돼 저장돼 있으니 다시 번역하지 않고,
        // 이번에 새로 생성된 copy(카드뉴스/상세설명 문구)만 같은 언어로 마저 번역한다.
        try {
          const { nextCopy } = await applyTranslation(lang, preview, data.copy, spec);
          if (!originalPreview) setOriginalPreview(preview);
          setOriginalCopy(data.copy);
          if (originalSpec === null) setOriginalSpec(spec);
          finalResult = { ...data, copy: nextCopy };
          setActiveLang(lang);
        } catch (err) {
          setTranslateError(err.message);
        }
      } else {
        setActiveLang(null);
        setOriginalPreview(null);
        setOriginalCopy(null);
        setOriginalSpec(null);
      }

      setGeneratedResult(finalResult);
      pushVersion(finalResult, previewSnapshot, specSnapshot);
      (finalResult.images || []).forEach((img) => addImage(img.url, `${previewSnapshot.productName} - ${img.slot}`));
    } catch (err) {
      setGenerateError(err.message || "이미지 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  // 1~3단계를 다 채운 뒤 "이미지 생성하기"를 누르면 즉시 결과 페이지로 넘어가고,
  // 그 안에서 로딩 애니메이션을 보여주며 실제 생성을 진행한다.
  const handleGenerateClick = () => {
    if (uploadedFiles.length === 0) {
      setGenerateError("상품 사진을 업로드해주세요.");
      return;
    }
    if (!preview.productName.trim()) {
      setGenerateError("상품명을 입력해주세요.");
      return;
    }
    setStage("result");
    runGenerate();
  };

  const handleRegenerate = () => {
    if (generating || editing) return;
    runGenerate();
  };

  // 결과 페이지의 "변경 프롬프트" — 지금 생성된 이미지들을 참고 이미지로 넘겨서
  // 사용자가 쓴 지시문대로 다시 그려달라고 요청한다(새 상품 사진이 아니라 현재 이미지를 수정).
  const handleApplyEditPrompt = async () => {
    if (!editPrompt.trim()) {
      setEditError("수정할 내용을 입력해주세요.");
      return;
    }
    if (!generatedResult) return;
    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`${BACKEND_URL}/marketing/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          layout: generatedResult.layout,
          prompt: editPrompt,
          images: (generatedResult.images || []).map((img) => ({ slot: img.slot, path: img.path })),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "이미지 수정에 실패했습니다."));
      const data = await res.json();
      const nextResult = { ...generatedResult, images: data.images };
      setGeneratedResult(nextResult);
      pushVersion(nextResult, preview, spec);
      (data.images || []).forEach((img) => addImage(img.url, `${preview.productName} - ${img.slot} (수정)`));
      setEditPrompt("");
    } catch (err) {
      setEditError(err.message || "이미지 수정에 실패했습니다.");
    } finally {
      setEditing(false);
    }
  };

  // 이미지 안에는 문자를 렌더링하지 않고, 실제 문구(상품명/태그라인/카드뉴스 문구 등)는
  // preview/generatedResult.copy 상태를 화면에서 오버레이로 얹는 방식이라(PosterPreview 등 참고),
  // 이 상태들만 번역해서 바꿔치기하면 같은 이미지 위에 번역된 문구가 그대로 얹힌다.
  const flattenForTranslate = (p, copy, currentSpec) => {
    const dict = {
      productName: p.productName || "",
      tagline: p.tagline || "",
      description: p.description || "",
      price: p.price || "",
      mustHavePhoto: p.mustHavePhoto || "",
    };
    if (copy) {
      if (copy.promoLine) dict.promoLine = copy.promoLine;
      (copy.features || []).forEach((f, i) => {
        dict[`feature_${i}`] = f || "";
      });
      (copy.captions || []).forEach((c, i) => {
        if (c?.eyebrow) dict[`caption_${i}_eyebrow`] = c.eyebrow;
        if (c?.heading) dict[`caption_${i}_heading`] = c.heading;
        if (c?.description) dict[`caption_${i}_description`] = c.description;
      });
      dict.angleTitle = copy.angleTitle || "다양한 각도에서 확인하세요";
      dict.disclaimer = copy.disclaimer || "※ 이미지는 연출된 예시이며 실제 상품과 다를 수 있습니다.";
    }
    parseSpecLines(currentSpec).forEach((row, i) => {
      dict[`spec_${i}_label`] = row.label;
      dict[`spec_${i}_value`] = row.value;
    });
    return dict;
  };

  // flattenForTranslate로 펼친 문구를 번역 API에 보내고, preview/copy/spec 각각의
  // 다음 상태(번역이 반영된 버전)를 만들어 돌려준다. 실제 state 반영은 호출부 책임.
  const applyTranslation = async (langCode, basePreview, baseCopy, baseSpec) => {
    const payload = flattenForTranslate(basePreview, baseCopy, baseSpec);
    const res = await fetch(`${BACKEND_URL}/translate-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: payload, target_lang: langCode }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "번역에 실패했습니다."));
    const { translated } = await res.json();

    const nextPreview = {
      ...basePreview,
      productName: translated.productName ?? basePreview.productName,
      tagline: translated.tagline ?? basePreview.tagline,
      description: translated.description ?? basePreview.description,
      price: translated.price ?? basePreview.price,
      mustHavePhoto: translated.mustHavePhoto ?? basePreview.mustHavePhoto,
    };

    // 가격은 AI가 문구로 번역한 값 대신 그 나라 환율로 정확히 변환한 값을 우선 쓴다 — AI 번역은
    // "29,000원"의 숫자만 그대로 옮겨 "$29,000"처럼 만드는 등 실제 환율과 다르게 나올 수 있다.
    const krwNumber = Number(String(basePreview.price ?? "").replace(/[^0-9.]/g, ""));
    const converted = krwNumber > 0 ? convertFromKrw(krwNumber, langCode) : null;
    if (converted) nextPreview.price = `${converted.formatted} ${converted.currency}`;

    let nextSpec = baseSpec;
    const baseSpecLines = parseSpecLines(baseSpec);
    if (baseSpecLines.length > 0) {
      nextSpec = baseSpecLines
        .map((row, i) => {
          const label = translated[`spec_${i}_label`] ?? row.label;
          const value = translated[`spec_${i}_value`] ?? row.value;
          return `${label}: ${value}`;
        })
        .join("\n");
    }

    let nextCopy = baseCopy;
    if (baseCopy) {
      nextCopy = { ...baseCopy };
      if (translated.promoLine !== undefined) nextCopy.promoLine = translated.promoLine;
      nextCopy.angleTitle = translated.angleTitle ?? baseCopy.angleTitle;
      nextCopy.disclaimer = translated.disclaimer ?? baseCopy.disclaimer;
      if (Array.isArray(baseCopy.features)) {
        nextCopy.features = baseCopy.features.map((f, i) => translated[`feature_${i}`] ?? f);
      }
      if (Array.isArray(baseCopy.captions)) {
        nextCopy.captions = baseCopy.captions.map((c, i) => ({
          ...c,
          eyebrow: translated[`caption_${i}_eyebrow`] ?? c?.eyebrow,
          heading: translated[`caption_${i}_heading`] ?? c?.heading,
          description: translated[`caption_${i}_description`] ?? c?.description,
        }));
      }
    }

    return { nextPreview, nextCopy, nextSpec };
  };

  // "이미지 언어 설정하기"에서 언어를 고르면 실행된다. 이미지 생성 전(Step 3 작성 중)이어도
  // 그 자리에서 바로 Step 3 문구를 그 언어로 번역해서 화면에 보여준다 — 그래야 "이미지 생성하기"를
  // 눌렀을 때 화면에 보이는 것과 똑같은 언어로 이미지가 만들어진다. 이미 이미지가 있으면 문구를
  // 바꿔치기하거나(오버레이 방식), 문구가 이미지 픽셀에 직접 그려지는 템플릿이면 그 언어로 다시 생성한다.
  const runTranslate = async (langCode) => {
    // 카드뉴스/포스터는 AI가 문구를 이미지 안에 직접 그려 넣기 때문에, 언어를 바꾸거나 원래
    // 언어(한국어)로 되돌릴 때 오버레이만 바꿔치기해서는 이미지 속 글자가 바뀌지 않는다 — 이미
    // 생성된 이미지가 있으면 그 언어로 다시 생성해야 한다(상세페이지는 여전히 오버레이 방식).
    const template = mc.templates.items.find((t) => t.id === activeTemplate);
    if (generatedResult && bakesTextIntoImage(template?.layout)) {
      await runGenerate(langCode === "ko" ? null : langCode);
      return;
    }

    if (langCode === "ko") {
      if (originalPreview) setPreview(originalPreview);
      if (originalCopy) setGeneratedResult((r) => (r ? { ...r, copy: originalCopy } : r));
      if (originalSpec !== null) setSpec(originalSpec);
      setOriginalPreview(null);
      setOriginalCopy(null);
      setOriginalSpec(null);
      setActiveLang(null);
      return;
    }

    setTranslating(true);
    setTranslateError(null);
    try {
      const basePreview = originalPreview || preview;
      const baseCopy = originalCopy || generatedResult?.copy || null;
      const baseSpec = originalSpec ?? spec;
      const { nextPreview, nextCopy, nextSpec } = await applyTranslation(langCode, basePreview, baseCopy, baseSpec);

      if (!originalPreview) setOriginalPreview(preview);
      if (!originalCopy && baseCopy) setOriginalCopy(baseCopy);
      if (originalSpec === null) setOriginalSpec(spec);

      setPreview(nextPreview);
      setSpec(nextSpec);
      if (baseCopy) setGeneratedResult((r) => (r ? { ...r, copy: nextCopy } : r));
      setActiveLang(langCode);
    } catch (err) {
      setTranslateError(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const specLines = parseSpecLines(spec);
  const isBusy = generating || editing;
  // "이전에 만든 이미지" 썸네일을 눌러 확대해서 본 뒤(viewingVersion), 모달을 닫지 않고도
  // 좌우로 넘겨가며 다른 버전을 볼 수 있게 목록 안에서의 위치를 계산해둔다.
  const viewingVersionIndex = viewingVersion ? versionHistory.findIndex((v) => v.id === viewingVersion.id) : -1;
  const showAdjacentVersion = (delta) => {
    const next = versionHistory[viewingVersionIndex + delta];
    if (next) setViewingVersion(next);
  };
  const activeTemplateItem = mc.templates.items.find((t) => t.id === activeTemplate);
  const activeLayout = activeTemplateItem?.layout;
  // Step 3의 빈칸이 모두 채워졌는지 — 현재 레이아웃에서 실제로 쓰이는 항목만 검사한다
  // (포스터는 "꼭 들어갔으면 하는 사진"을 안 쓴다). 스펙 정보(상세페이지 전용)는 선택 입력이라
  // 비어 있어도 통과시킨다. 다 채워져야 "이미지 언어 설정하기"가 활성화되고, 그 뒤 언어를
  // 실제로 골라야 "이미지 생성하기"가 활성화된다.
  const step3Complete = Boolean(
    preview.productName.trim() &&
      preview.tagline.trim() &&
      preview.description.trim() &&
      preview.price.trim() &&
      (activeLayout === "poster" || preview.mustHavePhoto.trim())
  );
  const languageChosen = activeLang !== null;
  // Step 2에서 지금 "보고 있는" 카테고리 탭의 레이아웃 — activeLayout(실제 선택된 템플릿의
  // 레이아웃)과 달리, 탭만 바꾸고 아직 그 탭의 템플릿을 클릭하지 않은 상태에서도 지금 보이는
  // 탭에 맞는 안내(수량/비율/AI 모델 박스)를 보여줘야 하므로 카테고리 기준으로 따로 구한다.
  const activeCategoryLayout = mc.templates.items.find((t) => t.category === activeCategory)?.layout;
  // 안내 박스의 "예) OOO 선택 시" 예시 이름 — 실제 선택된 템플릿이 지금 보고 있는 탭과 같은
  // 카테고리일 때만 그 이름을 쓰고, 아니면(다른 탭 템플릿이 선택된 채 탭만 바꾼 경우) 그 탭의
  // 첫 번째 템플릿 이름으로 대체한다.
  const exampleTemplateName =
    (activeTemplateItem?.category === activeCategory ? activeTemplateItem.name : null) ||
    mc.templates.items.find((t) => t.category === activeCategory)?.name ||
    "-";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8">
      <h1 className="text-2xl font-bold text-slate-900">{mc.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{mc.subtitle}</p>

      {translateError && <p className="mt-4 text-xs font-medium text-red-500">{translateError}</p>}

      {stage === "setup" && (
        <>
          {(generatedResult || generating) && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <span>{generating ? "이미지를 생성하고 있어요." : "이미 생성해둔 이미지가 있어요."}</span>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setStage("result")}>
                <Icon name="eye" className="w-3.5 h-3.5" />
                {generating ? "생성 현황 보기" : "미리보기로 이동"}
              </Button>
            </div>
          )}

          {generateError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {generateError}
            </div>
          )}

          {/* 좌: 1단계 사진 업로드(작게) → 중: 2단계 템플릿(넓게) → 우: 3단계 상품 정보 — 세 단계 모두 처음부터 한 번에 보여준다. */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.4fr_1fr]">
            <div className="rounded-lg border border-slate-200 bg-white">
              <SectionCardHeader step={1} title="생성할 상품 사진을 넣으세요" />
              <div className="p-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">1-1) 상품의 이미지를 넣으세요</p>
                {uploadedImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-brand-300 bg-brand-50/40 px-3 py-5 text-center hover:border-brand-400 hover:bg-brand-50"
                    style={{ minHeight: "6rem" }}
                  >
                    <Icon name="upload" className="mb-2 w-4 h-4 text-brand-500" />
                    <p className="text-xs font-medium text-slate-700">{mc.uploadHint.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{mc.uploadHint.sub}</p>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {uploadedImages.map((img, i) => (
                      <div key={i} className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                        <img src={img} alt={`상품 사진 ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          aria-label="사진 삭제"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                        >
                          <Icon name="x" className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {uploadedImages.length < MAX_PRODUCT_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-brand-300 bg-brand-50/40 text-center hover:border-brand-400 hover:bg-brand-50"
                      >
                        <Icon name="upload" className="w-4 h-4 text-brand-500" />
                        <span className="text-[11px] font-medium text-slate-600">사진 추가</span>
                      </button>
                    )}
                  </div>
                )}
                {uploadedImages.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {uploadedImages.length}/{MAX_PRODUCT_PHOTOS}장 · 여러 각도의 사진을 추가하면 더 정확하게 생성돼요.
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="my-4 border-t border-slate-100" />

                <p className="mb-2 text-xs font-semibold text-slate-500">1-2) 기업의 로고를 넣으세요</p>
                {!logoImage ? (
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-brand-300 bg-brand-50/40 px-3 py-5 text-center hover:border-brand-400 hover:bg-brand-50"
                    style={{ minHeight: "6rem" }}
                  >
                    <Icon name="upload" className="mb-2 w-4 h-4 text-brand-500" />
                    <p className="text-xs font-medium text-slate-700">로고 이미지를 올려주세요</p>
                    <p className="mt-1 text-[11px] text-slate-400">선택 사항이에요</p>
                  </button>
                ) : (
                  <div className="relative aspect-square w-1/2 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    <img src={logoImage} alt="기업 로고" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      aria-label="로고 삭제"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-600">Step 2</span>
                    <h2 className="text-sm font-bold text-slate-900">템플릿을 선택하세요</h2>
                  </div>
                  <div className="p-4 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
                    <div className="mb-3 flex gap-2">
                      {mc.templates.categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => setActiveCategory(c)}
                          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                            activeCategory === c
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {activeCategoryLayout && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">이미지 비율</span>
                        {activeCategoryLayout === "poster" &&
                          ["4:5", "9:16"].map((ratio) => (
                            <button
                              key={ratio}
                              type="button"
                              onClick={() => setPosterAspectRatio(ratio)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                posterAspectRatio === ratio
                                  ? "bg-slate-900 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {ratio}
                            </button>
                          ))}
                        {activeCategoryLayout === "card-news" && (
                          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">1:1</span>
                        )}
                        {activeCategoryLayout === "detail" && (
                          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">1:2</span>
                        )}
                        {activeCategoryLayout === "card-news" && (
                          <>
                            <span className="ml-2 text-xs font-medium text-slate-500">이미지 수량</span>
                            <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
                              {LAYOUT_INFO["card-news"].count}장
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {activeCategoryLayout && LAYOUT_INFO[activeCategoryLayout] && (
                      <>
                        <div className="mb-3 flex items-start gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
                          <Icon name="info" className="mt-0.5 w-3.5 h-3.5 shrink-0 text-brand-500" />
                          <p>
                            선택한 컨셉으로 {LAYOUT_INFO[activeCategoryLayout].noun}가 생성됩니다.
                            <br />
                            예) {exampleTemplateName} 선택 시 → {exampleTemplateName} 스타일의{" "}
                            {LAYOUT_INFO[activeCategoryLayout].noun} {LAYOUT_INFO[activeCategoryLayout].count}장 생성
                          </p>
                        </div>
                        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2.5">
                          <span className="text-xs font-medium text-slate-600">
                            AI 모델 적용
                            <span className="ml-1 font-normal text-slate-400">(사람이 상품을 사용하는 장면으로 연출)</span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={useAiModel}
                            onClick={() => setUseAiModel((v) => !v)}
                            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                              useAiModel ? "bg-brand-600" : "bg-slate-200"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                useAiModel ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {mc.templates.items
                        .filter((t) => t.category === activeCategory)
                        .map((t) => (
                          <button
                            key={t.id}
                            onClick={() => handleTemplateSelect(t.id)}
                            className={`overflow-hidden rounded-md border-2 text-left transition-all duration-300 ease-spring ${
                              activeTemplate === t.id
                                ? "border-brand-500 ring-4 ring-brand-100 scale-[1.02]"
                                : "border-slate-200 hover:scale-[1.02] hover:border-brand-300 hover:ring-4 hover:ring-slate-100"
                            }`}
                          >
                            <TemplateThumb
                              layout={t.layout}
                              templateId={t.id}
                              aspectRatio={t.layout === "poster" ? posterAspectRatio : t.layout === "card-news" ? "4:3" : "1:2"}
                            />
                            <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-800" title={t.name}>
                                  {t.name}
                                </p>
                                {t.description && (
                                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.description}</p>
                                )}
                              </div>
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                  activeTemplate === t.id ? "" : "border-2 border-slate-200"
                                }`}
                              >
                                {activeTemplate === t.id && (
                                  <Icon name="checkCircle" className="w-5 h-5 text-brand-600" />
                                )}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
              </div>

            <div className="rounded-lg border border-slate-200 bg-white">
                <SectionCardHeader step={3} title="상품정보를 입력하세요" />
                  <div className="p-4 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
                    <div className="space-y-3">
                      <label className="block">
                        <FieldLabel required>상품명</FieldLabel>
                        <input
                          className={`${emptyFieldClass(!preview.productName.trim())} h-10`}
                          value={preview.productName}
                          onChange={handlePreviewChange("productName")}
                          placeholder={mc.preview.productName}
                        />
                      </label>
                      <div>
                        <Button
                          type="button"
                          variant="outlineBrand"
                          className="w-full py-2 text-xs"
                          title="업로드한 사진·로고와 상품명, 선택한 템플릿 스타일을 보고 나머지 정보와 추천 가격까지 채워줍니다."
                          onClick={handleAiFillInfo}
                          disabled={aiFillingInfo}
                        >
                          <Icon name="sparkle" className="w-3.5 h-3.5" />
                          {aiFillingInfo ? "채우는 중..." : "AI로 채우기"}
                        </Button>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          상품명을 먼저 입력해야 "AI로 채우기"를 쓸 수 있어요.
                        </span>
                        {aiFillError && <p className="mt-2 text-xs font-medium text-red-500">{aiFillError}</p>}
                      </div>
                      <label className="block">
                        <FieldLabel>태그라인</FieldLabel>
                        <input
                          className={`${aiFilledFieldClass(aiFilledFields.has("tagline"))} h-10`}
                          value={preview.tagline}
                          onChange={handlePreviewChange("tagline")}
                          placeholder={mc.preview.tagline}
                        />
                        {aiFilledFields.has("tagline") && <AiFilledHint />}
                      </label>
                      <label className="block">
                        <FieldLabel>상품 설명</FieldLabel>
                        <textarea
                          className={`${aiFilledFieldClass(aiFilledFields.has("description"))} py-2.5`}
                          rows={2}
                          value={preview.description}
                          onChange={handlePreviewChange("description")}
                          placeholder={mc.preview.description}
                        />
                        {aiFilledFields.has("description") && <AiFilledHint />}
                      </label>
                      <label className="block">
                        <FieldLabel>
                          가격{" "}
                          <span className="font-normal text-slate-400">
                            ({activeLang ? EXCHANGE_RATE_PER_KRW[activeLang]?.currency : "KRW, 원"})
                          </span>
                        </FieldLabel>
                        <input
                          className={`${aiFilledFieldClass(aiFilledFields.has("price"))} h-10`}
                          value={preview.price}
                          onChange={handlePreviewChange("price")}
                          placeholder={mc.preview.price}
                        />
                        {aiFilledFields.has("price") && <AiFilledHint />}
                        {priceReason && (
                          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-brand-600">
                            <Icon name="sparkle" className="mt-0.5 w-3 h-3 shrink-0" />
                            <span>AI 추천 근거: {priceReason}</span>
                          </p>
                        )}
                        {activeLang && (
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            이미지 언어를 {TRANSLATE_LANGUAGES.find((l) => l.code === activeLang)?.label}(으)로 설정해서
                            환율에 맞춰 자동으로 변환된 가격이에요. 참고용 환율이며 실시간 시세와 다를 수 있어요.
                          </p>
                        )}
                      </label>
                      <label className="block">
                        <FieldLabel>꼭 들어갔으면 하는 사진</FieldLabel>
                        <textarea
                          className={`${aiFilledFieldClass(aiFilledFields.has("mustHavePhoto"))} py-2.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                          rows={2}
                          value={preview.mustHavePhoto}
                          onChange={handlePreviewChange("mustHavePhoto")}
                          placeholder="예: 제품을 사용하는 모습"
                          disabled={activeLayout === "poster"}
                        />
                        {activeLayout === "poster" ? (
                          <p className="mt-1.5 text-xs text-slate-400">포스터 템플릿에서는 사용하지 않는 항목이에요.</p>
                        ) : (
                          aiFilledFields.has("mustHavePhoto") && <AiFilledHint />
                        )}
                      </label>
                      {activeLayout === "detail" && (
                        <label className="block">
                          <FieldLabel>스펙 정보 (상세페이지 전용)</FieldLabel>
                          <textarea
                            className={`${CONTROL_CLASS} py-2.5`}
                            rows={4}
                            value={spec}
                            onChange={(e) => setSpec(e.target.value)}
                            placeholder={"사이즈: 20 x 10 x 5cm\n무게: 320g\n소재: 스테인리스 스틸\n색상: 블랙, 화이트"}
                          />
                          <span className="mt-1 block text-xs text-slate-400">
                            한 줄에 하나씩 라벨: 값 형식으로 입력해주세요.
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-slate-200 p-4">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <TranslateMenu
                        activeLang={activeLang}
                        translating={translating || generating}
                        onTranslate={runTranslate}
                        disabled={!step3Complete}
                      />
                      <p className="text-xs text-slate-400">
                        {!step3Complete
                          ? "Step 3의 빈칸을 모두 채우면 이미지 언어를 설정할 수 있어요."
                          : !languageChosen
                            ? "이미지 언어를 설정하면 이미지 생성하기를 누를 수 있어요."
                            : "이제 이미지를 생성할 수 있어요."}
                      </p>
                      <Button
                        className="w-full justify-center py-3.5 text-base"
                        onClick={handleGenerateClick}
                        disabled={generating || !step3Complete || !languageChosen}
                      >
                        <Icon name="sparkle" className="w-5 h-5" />
                        이미지 생성하기
                      </Button>
                    </div>
                  </div>
              </div>
          </div>
        </>
      )}

      {stage === "result" && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setStage("setup")}>
                <Icon name="arrowLeft" className="w-4 h-4" />
                이전 페이지로
              </Button>
              <Button
                variant="outlineBrand"
                className="px-4 py-2 text-sm"
                onClick={handleRegenerate}
                disabled={isBusy}
              >
                <Icon name="redo" className="w-4 h-4" />
                재제작
              </Button>
              <Button
                variant="secondary"
                className="px-4 py-2 text-sm"
                onClick={() => setShowPreviousContent(true)}
              >
                <Icon name="documents" className="w-4 h-4" />
                이전내용보기
              </Button>
            </div>
            <TranslateMenu activeLang={activeLang} translating={translating} onTranslate={runTranslate} />
          </div>

          {generateError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {generateError}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-3">
                  <h2 className="text-sm font-bold text-slate-900">변경 프롬프트</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    원하는 수정 사항을 직접 적어서 이미지를 바로 바꿔보세요.
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    className={`${CONTROL_CLASS} py-2.5`}
                    rows={3}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="예: 배경을 더 밝고 화사하게 바꿔줘"
                    disabled={isBusy}
                  />
                  {editError && <p className="mt-2 text-xs font-medium text-red-500">{editError}</p>}
                  <Button
                    className="mt-3 w-full justify-center py-2.5"
                    onClick={handleApplyEditPrompt}
                    disabled={isBusy || !editPrompt.trim()}
                  >
                    <Icon name="pencil" className="w-4 h-4" />
                    {editing ? "수정하는 중..." : "프롬프트로 이미지 수정하기"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-3">
                  <h2 className="text-sm font-bold text-slate-900">이전에 만든 이미지</h2>
                </div>
                <div className="p-4">
                  {versionHistory.length === 0 ? (
                    <p className="text-xs text-slate-400">아직 생성된 버전이 없어요.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {versionHistory.map((v) => {
                        const thumbUrl = findImage(v.images, MAIN_SLOT_BY_LAYOUT[v.layout]);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setViewingVersion(v)}
                            title={v.label}
                            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 hover:border-brand-400"
                          >
                            {thumbUrl ? (
                              <img src={thumbUrl} alt={v.label} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-slate-100">
                                <Icon name="imageGenerate" className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-[9px] font-semibold text-white opacity-0 group-hover:opacity-100">
                              {v.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white lg:sticky lg:top-6">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-6 py-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Icon name="eye" className="w-5 h-5" />
                  {mc.previewTitle}
                </h2>
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={handleSaveImage}
                  disabled={savingImage || isBusy || !generatedResult}
                >
                  <Icon name="download" className="w-3.5 h-3.5" />
                  {savingImage ? "저장 중..." : mc.actions.saveImage}
                </Button>
              </div>
              <div className="p-6">
                {isBusy && (
                  <PencilDrawingLoader
                    label={
                      editing
                        ? "AI가 이미지를 수정하고 있어요..."
                        : activeLayout === "detail"
                          ? "상세페이지를 생성하고 있어요..."
                          : "AI가 이미지를 생성하고 있어요"
                    }
                  />
                )}

                {!isBusy && generatedResult && (
                  <div ref={previewRef} className="w-full">
                    <LayoutPreview
                      layout={generatedResult.layout}
                      images={generatedResult.images}
                      copy={generatedResult.copy}
                      preview={preview}
                      specLines={specLines}
                      templateId={generatedResult.template_id}
                      aspectRatio={posterAspectRatio}
                    />
                  </div>
                )}

                {!isBusy && !generatedResult && (
                  <div className="flex min-h-[320px] items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400">
                    아직 생성된 이미지가 없어요.
                  </div>
                )}

                {saveError && <p className="mt-3 text-xs font-medium text-red-500">{saveError}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {viewingVersion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8"
          onClick={() => setViewingVersion(null)}
        >
          <div
            className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">{viewingVersion.label}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={handleSaveVersionImage}
                  disabled={savingVersionImage}
                >
                  <Icon name="download" className="w-3.5 h-3.5" />
                  {savingVersionImage ? "저장 중..." : "저장"}
                </Button>
                <button
                  type="button"
                  onClick={() => setViewingVersion(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <div ref={historyPreviewRef} className="w-full">
                <LayoutPreview
                  layout={viewingVersion.layout}
                  images={viewingVersion.images}
                  copy={viewingVersion.copy}
                  preview={viewingVersion.preview}
                  specLines={parseSpecLines(viewingVersion.spec)}
                  templateId={viewingVersion.templateId}
                  aspectRatio={viewingVersion.aspectRatio}
                />
              </div>
            </div>
            {viewingVersionIndex > 0 && (
              <button
                type="button"
                onClick={() => showAdjacentVersion(-1)}
                aria-label="이전 버전 보기"
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-white"
              >
                <Icon name="arrowLeft" className="w-4 h-4" />
              </button>
            )}
            {viewingVersionIndex !== -1 && viewingVersionIndex < versionHistory.length - 1 && (
              <button
                type="button"
                onClick={() => showAdjacentVersion(1)}
                aria-label="다음 버전 보기"
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-white"
              >
                <Icon name="arrowRight" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {showPreviousContent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8"
          onClick={() => setShowPreviousContent(false)}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">이전에 작성한 내용</p>
              <button
                type="button"
                onClick={() => setShowPreviousContent(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto p-5">
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="overflow-hidden rounded-lg border border-slate-200">
                      <img
                        src={img}
                        alt={`업로드한 상품 사진 ${i + 1}`}
                        className="aspect-square w-full object-cover bg-slate-50"
                      />
                    </div>
                  ))}
                </div>
              )}
              <dl className="space-y-3">
                {[
                  ["템플릿", mc.templates.items.find((t) => t.id === activeTemplate)?.name || "-"],
                  ["상품명", preview.productName || "-"],
                  ["태그라인", preview.tagline || "-"],
                  ["상품 설명", preview.description || "-"],
                  ["가격", preview.price || "-"],
                  ["꼭 들어갔으면 하는 사진", preview.mustHavePhoto || "-"],
                  ...(activeLayout === "detail" ? [["스펙 정보", spec || "-"]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
