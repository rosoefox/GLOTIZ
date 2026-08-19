import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import Icon from "../components/Icon";
import { Card, Button, TextField } from "../components/ui";
import { marketingMaterialCreator as mc } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";
import { useAuth } from "../context/AuthContext";
import { readErrorMessage } from "../lib/apiError";
import { parseSpecLines } from "../lib/spec";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const LAYOUT_BY_TEMPLATE = {
  "tpl-poster": "poster",
  "tpl-card-news": "card-news",
  "tpl-detail": "detail",
};

const PREVIOUS_PRODUCT_OPTIONS = [
  {
    id: "happy-vita-calming-sunscreen",
    name: "해피 비타 카밍 선크림",
    preview: {
      productName: "해피 비타 카밍 선크림",
      tagline: "비타민 캡슐 · 진정 · 수분 · 데일리 UV 케어",
      description:
        "민감한 피부도 편안하게 사용할 수 있다는 콘셉트의 데일리 자외선 차단제. 산뜻한 사용감, 백탁 부담 완화, 메이크업 전 사용 편의성을 핵심 메시지로 설정한 가상 제품입니다.",
      mustHavePhoto:
        "20~40대 K-Beauty 관심 소비자가 제품을 사용하는 모습과 산뜻한 사용감, 메이크업 전 사용 장면",
      price: "",
    },
    spec: [
      "제품 유형: 자외선 차단 화장품",
      "표시 사양: SPF50+ / PA++++ (가상 제품 설정)",
      "용량: 50 mL",
      "주요 콘셉트: 비타민 캡슐 · 진정 · 수분 · 데일리 UV 케어",
      "타깃: 20~40대 K-Beauty 관심 소비자",
      "주요 시장: 베트남, 싱가포르",
      "판매 채널: 온라인 마켓플레이스 및 현지 유통 파트너",
    ].join("\n"),
  },
];

function findImage(images, slot) {
  return images?.find((img) => img.slot === slot)?.url;
}

function PlaceholderPreview({ uploadedImage }) {
  return (
    <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-200 shadow-lg">
      {uploadedImage ? (
        <div
          className="absolute inset-0 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${uploadedImage})` }}
        />
      ) : (
        <Icon name="camera" className="h-10 w-10 text-slate-400" />
      )}
    </div>
  );
}

function PosterPreview({ images, preview }) {
  const url = findImage(images, "poster");
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-xs overflow-hidden rounded-2xl shadow-lg">
      {url && <img src={url} alt="포스터" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/25" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        {preview.tagline && (
          <p
            className="text-xs font-semibold uppercase tracking-[0.3em] text-white/90"
            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
          >
            {preview.tagline}
          </p>
        )}
        <p
          className="-skew-x-6 text-4xl font-black italic leading-[1.05] text-white"
          style={{ textShadow: "0 4px 16px rgba(0,0,0,0.7)" }}
        >
          {preview.productName}
        </p>
        {preview.price && (
          <p
            className="-skew-x-6 text-3xl font-black italic text-amber-300"
            style={{ textShadow: "0 4px 16px rgba(0,0,0,0.7)" }}
          >
            {preview.price}
          </p>
        )}
      </div>
    </div>
  );
}

function CardNewsPreview({ images, copy, preview }) {
  const cards = [
    {
      slot: "card-1",
      overlay: (
        <p
          className="-skew-x-3 text-2xl font-black italic leading-tight text-white"
          style={{ textShadow: "0 3px 12px rgba(0,0,0,0.7)" }}
        >
          {preview.productName}
        </p>
      ),
    },
    {
      slot: "card-2",
      overlay: (
        <div className="flex flex-wrap gap-1.5">
          {(copy?.features || []).map((f) => (
            <span
              key={f}
              className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-800"
            >
              {f}
            </span>
          ))}
        </div>
      ),
    },
    { slot: "card-3", overlay: null },
    {
      slot: "card-4",
      overlay: (
        <div>
          {preview.price && (
            <p
              className="-skew-x-3 text-2xl font-black italic text-amber-300"
              style={{ textShadow: "0 3px 12px rgba(0,0,0,0.7)" }}
            >
              {preview.price}
            </p>
          )}
          {copy?.promoLine && (
            <p className="mt-1 text-sm font-semibold text-white/95" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
              {copy.promoLine}
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {cards.map(({ slot, overlay }) => {
        const url = findImage(images, slot);
        return (
          <div
            key={slot}
            className="relative aspect-square w-full max-w-xs shrink-0 snap-center overflow-hidden rounded-2xl shadow-lg"
          >
            {url && <img src={url} alt={slot} className="absolute inset-0 h-full w-full object-cover" />}
            {overlay && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">{overlay}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailPreview({ images, copy, preview, specLines }) {
  const heroUrl = findImage(images, "hero");
  const captions = copy?.captions || [];
  const angles = [
    { slot: "angle-front", label: "정면" },
    { slot: "angle-back", label: "후면" },
    { slot: "angle-top", label: "위" },
  ];

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-lg">
      <div className="bg-white py-12 text-center">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-900">{preview.productName}</h2>
        {preview.tagline && (
          <p className="mt-3 text-sm font-medium tracking-wide text-slate-400">{preview.tagline}</p>
        )}
      </div>

      {heroUrl && <img src={heroUrl} alt="히어로" className="aspect-[16/9] w-full object-cover" />}

      {[0, 1, 2].map((i) => {
        const url = findImage(images, `feature-${i + 1}`);
        const caption = captions[i] || {};
        return (
          <div
            key={i}
            className={`flex flex-col items-center gap-0 md:flex-row ${i === 1 ? "md:flex-row-reverse" : ""}`}
          >
            <div className="aspect-square w-full md:w-1/2">
              {url && <img src={url} alt={caption.heading} className="h-full w-full object-cover" />}
            </div>
            <div className="w-full space-y-2.5 px-8 py-10 md:w-1/2">
              <p className="text-[11px] font-semibold tracking-[0.25em] text-slate-400">{caption.eyebrow}</p>
              <h3 className="font-serif text-xl font-semibold text-slate-900">{caption.heading}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{caption.description}</p>
            </div>
          </div>
        );
      })}

      <div className="bg-slate-50 py-12 text-center">
        <h3 className="font-serif text-lg font-semibold text-slate-900">
          {copy?.angleTitle || "다양한 각도에서 확인하세요"}
        </h3>
        <div className="mt-6 grid grid-cols-3 gap-3 px-6">
          {angles.map(({ slot, label }) => {
            const url = findImage(images, slot);
            return (
              <div key={slot} className="aspect-square overflow-hidden rounded-xl bg-slate-200">
                {url && <img src={url} alt={label} className="h-full w-full object-cover" />}
              </div>
            );
          })}
        </div>
      </div>

      {specLines.length > 0 && (
        <div className="px-8 py-10">
          <h3 className="mb-4 font-serif text-lg font-semibold tracking-wide text-slate-900">SPEC</h3>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            {specLines.map((row, i) => (
              <div
                key={row.label + i}
                className={`flex ${i > 0 ? "border-t border-slate-100" : ""}`}
              >
                <div className="w-28 shrink-0 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  {row.label}
                </div>
                <div className="px-4 py-3 text-sm text-slate-700">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="pb-8 text-center text-xs text-slate-400">
        {copy?.disclaimer || "※ 이미지는 연출된 예시이며 실제 상품과 다를 수 있습니다."}
      </p>
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
        <Icon name="globe" className="h-4 w-4" />
        {translating ? "번역 중..." : activeLabel ? `이미지 언어: ${activeLabel}` : "이미지 언어 선택하기"}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
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
            {activeLang === null && <Icon name="check" className="h-3.5 w-3.5 text-brand-600" />}
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
              {activeLang === lang.code && <Icon name="check" className="h-3.5 w-3.5 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketingMaterialCreator() {
  const [activeTemplate, setActiveTemplate] = useState(
    mc.templates.items.find((t) => t.selected)?.id
  );
  const [activeCategory, setActiveCategory] = useState(mc.templates.categories[0]);
  const [preview, setPreview] = useState({
    productName: "",
    tagline: "",
    description: "",
    mustHavePhoto: "",
    price: "",
  });
  const [spec, setSpec] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedResult, setGeneratedResult] = useState(null);
  const [showPreviousProducts, setShowPreviousProducts] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const [activeLang, setActiveLang] = useState(null); // null이면 한국어 원본
  const [originalPreview, setOriginalPreview] = useState(null);
  const [originalCopy, setOriginalCopy] = useState(null);
  const [originalSpec, setOriginalSpec] = useState(null);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const { addImage } = useMarketingImages();
  const { session } = useAuth();

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

  const handlePreviewChange = (field) => (e) => {
    setPreview((p) => ({ ...p, [field]: e.target.value }));
  };

  const handlePreviousProductSelect = (product) => {
    setPreview(product.preview);
    setSpec(product.spec);
    setGeneratedResult(null);
    setGenerateError("");
    setShowPreviousProducts(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUploadedFile(file);
    setUploadedImage(url);
    addImage(url, preview.productName || file.name);
  };

  const handleTemplateSelect = (id) => {
    setActiveTemplate(id);
    setGeneratedResult(null);
    setGenerateError("");
  };

  const handleGenerate = async () => {
    if (!uploadedFile) {
      setGenerateError("상품 사진을 업로드해주세요.");
      return;
    }
    if (!preview.productName.trim()) {
      setGenerateError("상품명을 입력해주세요.");
      return;
    }
    setGenerating(true);
    setGenerateError("");
    try {
      if (activeTemplate === "tpl-detail") {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const data = {
          layout: "detail",
          hardcodedImage: "/sangse.png",
          images: [],
          copy: null,
        };
        setGeneratedResult(data);
        addImage(data.hardcodedImage, `${preview.productName} - 상세페이지`);
        return;
      }

      const formData = new FormData();
      formData.append("layout", LAYOUT_BY_TEMPLATE[activeTemplate]);
      formData.append("product_name", preview.productName);
      formData.append("tagline", preview.tagline);
      formData.append("description", preview.description);
      formData.append("must_have_photo", preview.mustHavePhoto);
      formData.append("price", preview.price);
      formData.append("product_image", uploadedFile);

      const res = await fetch(`${BACKEND_URL}/marketing/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "이미지 생성에 실패했습니다."));
      const data = await res.json();

      // 생성 전에 언어를 미리 골라뒀다면, 갓 생성된(한국어) 문구를 바로 그 언어로 번역해서 얹는다.
      if (activeLang) {
        try {
          const koreanPreview = preview;
          const { nextPreview, nextCopy, nextSpec } = await applyTranslation(activeLang, koreanPreview, data.copy, spec);
          setOriginalPreview(koreanPreview);
          setOriginalCopy(data.copy);
          setOriginalSpec(spec);
          setPreview(nextPreview);
          setSpec(nextSpec);
          setGeneratedResult({ ...data, copy: nextCopy });
        } catch (err) {
          setTranslateError(err.message);
          setActiveLang(null);
          setOriginalPreview(null);
          setOriginalCopy(null);
          setOriginalSpec(null);
          setGeneratedResult(data);
        }
      } else {
        setGeneratedResult(data);
      }
      (data.images || []).forEach((img) => addImage(img.url, `${preview.productName} - ${img.slot}`));
    } catch (err) {
      setGenerateError(err.message || "이미지 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
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
    };

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

  // "이미지 언어 선택하기"에서 언어를 고르면 실행된다. 아직 생성된 이미지가 없으면 언어만
  // 기억해뒀다가 handleGenerate에서 그 언어로 바로 생성하고, 이미 이미지가 있으면 지금
  // 바로 문구만 번역해서 바꿔친다.
  const runTranslate = async (langCode) => {
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

    if (!hasMatchingResult) {
      setActiveLang(langCode);
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
  const layout = LAYOUT_BY_TEMPLATE[activeTemplate];
  const hasMatchingResult = generatedResult && generatedResult.layout === layout;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{mc.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{mc.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Icon name="camera" className="h-4 w-4" />
              {mc.uploadLabel}
            </h3>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 bg-contain bg-center bg-no-repeat px-4 py-8 text-center hover:border-brand-300 hover:bg-brand-50"
              style={uploadedImage ? { backgroundImage: `url(${uploadedImage})`, minHeight: "9rem" } : undefined}
            >
              {!uploadedImage && (
                <>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                    <Icon name="upload" className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">{mc.uploadHint.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{mc.uploadHint.sub}</p>
                </>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {uploadedImage && (
              <Button variant="secondary" className="mt-3 w-full py-2" onClick={() => fileInputRef.current?.click()}>
                <Icon name="upload" className="h-4 w-4" />
                사진 변경하기
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Icon name="documents" className="h-4 w-4" />
                상품 정보 입력
              </h3>
              <div className="relative">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  title="기입한 정보나 서류에서 정보를 가져옵니다."
                  aria-expanded={showPreviousProducts}
                  onClick={() => setShowPreviousProducts((open) => !open)}
                >
                  <Icon name="history" className="h-3.5 w-3.5" />
                  기존 정보 불러오기
                  <Icon
                    name="chevronDown"
                    className={`h-3 w-3 transition-transform ${showPreviousProducts ? "rotate-180" : ""}`}
                  />
                </Button>

                {showPreviousProducts && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-bold text-slate-800">불러올 제품 선택</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">저장된 제품을 선택하면 입력란에 자동으로 채워집니다.</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto p-2">
                      {PREVIOUS_PRODUCT_OPTIONS.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handlePreviousProductSelect(product)}
                          className="w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                            {product.preview.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <TextField
                label="상품명"
                value={preview.productName}
                onChange={handlePreviewChange("productName")}
                placeholder={mc.preview.productName}
                inputClassName="placeholder:text-slate-400"
              />
              <TextField
                label="태그라인"
                value={preview.tagline}
                onChange={handlePreviewChange("tagline")}
                placeholder={mc.preview.tagline}
                inputClassName="placeholder:text-slate-400"
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">상품 설명</span>
                <textarea
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  rows={3}
                  value={preview.description}
                  onChange={handlePreviewChange("description")}
                  placeholder={mc.preview.description}
                />
              </label>
              <TextField
                label="가격"
                value={preview.price}
                onChange={handlePreviewChange("price")}
                placeholder={mc.preview.price}
                inputClassName="placeholder:text-slate-400"
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">꼭 들어갔으면 하는 사진</span>
                <textarea
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  rows={3}
                  value={preview.mustHavePhoto}
                  onChange={handlePreviewChange("mustHavePhoto")}
                  placeholder="예: 제품을 사용하는 모습"
                />
              </label>
              {activeTemplate === "tpl-detail" && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">스펙 정보 (상세설명 전용)</span>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
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
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-900">{mc.templateSectionTitle}</h3>
            <div className="mb-4 flex gap-2">
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
            <div className="grid grid-cols-3 gap-3">
              {mc.templates.items
                .filter((t) => activeCategory === "전체" || t.category === activeCategory)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t.id)}
                    className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${
                      activeTemplate === t.id ? "border-brand-500" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex h-20 items-center justify-center bg-slate-100 text-slate-400">
                      <Icon name="documents" className="h-6 w-6" />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs font-semibold text-slate-700">{t.name}</span>
                      {activeTemplate === t.id && <Icon name="checkCircle" className="h-4 w-4 text-brand-600" />}
                    </div>
                  </button>
                ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <TranslateMenu
                activeLang={activeLang}
                translating={translating}
                onTranslate={runTranslate}
                disabled={generating}
              />
              <Button className="py-2" onClick={handleGenerate} disabled={generating}>
                <Icon name="sparkle" className="h-4 w-4" />
                {generating ? "생성 중..." : "이미지 생성하기"}
              </Button>
            </div>
            {translateError && <p className="mt-2 text-right text-xs font-medium text-red-500">{translateError}</p>}
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Icon name="eye" className="h-4 w-4" />
                {mc.previewTitle}
              </h3>
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={handleSaveImage}
                disabled={savingImage || !hasMatchingResult}
              >
                <Icon name="download" className="h-3.5 w-3.5" />
                {savingImage ? "저장 중..." : mc.actions.saveImage}
              </Button>
            </div>

            {generating && (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl bg-slate-100 p-8 text-center">
                <Icon name="sparkle" className="h-8 w-8 animate-pulse text-brand-500" />
                <p className="text-sm font-medium text-slate-600">
                  {activeTemplate === "tpl-detail"
                    ? "상세페이지를 생성하고 있어요..."
                    : "이미지를 생성하고 있어요. 최대 1~2분 정도 걸릴 수 있어요."}
                </p>
              </div>
            )}

            {!generating && (
              <div
                className={
                  hasMatchingResult && layout === "detail"
                    ? ""
                    : "flex min-h-[420px] items-center justify-center rounded-xl bg-slate-100 p-8"
                }
              >
                <div ref={previewRef} className={hasMatchingResult && layout === "detail" ? "w-full" : "w-full max-w-sm"}>
                  {!hasMatchingResult && <PlaceholderPreview uploadedImage={uploadedImage} />}
                  {hasMatchingResult && layout === "poster" && (
                    <PosterPreview images={generatedResult.images} preview={preview} />
                  )}
                  {hasMatchingResult && layout === "card-news" && (
                    <CardNewsPreview images={generatedResult.images} copy={generatedResult.copy} preview={preview} />
                  )}
                  {hasMatchingResult && layout === "detail" && (
                    generatedResult.hardcodedImage ? (
                      <img
                        src={generatedResult.hardcodedImage}
                        alt="생성된 상세페이지"
                        className="block h-auto w-full"
                      />
                    ) : (
                      <DetailPreview
                        images={generatedResult.images}
                        copy={generatedResult.copy}
                        preview={preview}
                        specLines={specLines}
                      />
                    )
                  )}
                </div>
              </div>
            )}

            {generateError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {generateError}
              </div>
            )}
            {saveError && <p className="mt-3 text-xs font-medium text-red-500">{saveError}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
