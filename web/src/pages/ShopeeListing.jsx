import { useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { shopeeListing as sl } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";
import { readErrorMessage } from "../lib/apiError";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// AI 자동완성/추천 버튼이 따로 없어서 사용자가 직접 채워야 하는 항목들 — 비어 있는 동안은
// 포커스를 준 것처럼 보라색 테두리로 강조해서 채우는 걸 잊지 않게 하고, 값을 입력하면
// 바로 원래(회색 테두리) 모습으로 돌아온다.
const HIGHLIGHT_WHEN_EMPTY = new Set(["shelfLife", "stock", "weight", "daysToShip"]);

// 데모용: "이전 정보 불러오기"는 실제 이전 제출 이력 대신 고정된 예시 상품 정보를 채운다.
const PREVIOUS_INFO_MOCK = {
  productName: "해피 비타 카밍 선크림 SPF50+ PA++++",
  category: "자외선 차단 화장품",
  description:
    "민감한 피부도 편안하게 사용할 수 있는 데일리 자외선 차단제입니다. 비타민 캡슐과 진정·수분 성분으로 산뜻한 사용감과 백탁 부담 완화, 메이크업 전 사용 편의성을 핵심으로 설계했습니다. 20~40대 K-Beauty 관심 소비자를 타깃으로 베트남, 싱가포르 온라인 마켓플레이스 및 현지 유통 파트너를 통해 판매됩니다.",
  brand: "해피코스메틱",
  shelfLife: "24 Months",
  price: "15000",
  stock: "100",
  weight: "0.05",
  daysToShip: "2",
};

// 데모용: "전체 내용 번역"은 실제 번역 API를 호출하지 않고 언어별 고정 번역문으로 바꿔친다.
const TRANSLATIONS_MOCK = {
  en: {
    productName: "Happy Vita Calming Sun Cream SPF50+ PA++++",
    category: "Sunscreen Cosmetics",
    description:
      "A daily sunscreen designed to feel comfortable even on sensitive skin. Formulated with vitamin capsules and soothing, hydrating ingredients for a light, non-sticky finish with minimal white cast, and easy to use before makeup. Targets K-beauty fans in their 20s-40s, sold through online marketplaces and local distribution partners in Vietnam and Singapore.",
    brand: "Happy Cosmetics",
    shelfLife: "24 Months",
  },
  th: {
    productName: "แฮปปี้ ไวต้า คาล์มมิ่ง ซันครีม SPF50+ PA++++",
    category: "เครื่องสำอางกันแดด",
    description:
      "ครีมกันแดดสำหรับใช้ทุกวัน อ่อนโยนแม้ผิวบอบบาง ผสมวิตามินแคปซูลและส่วนผสมที่ช่วยปลอบประโลมและให้ความชุ่มชื้น เนื้อบางเบาไม่เหนียวเหนอะหนะ ลดคราบขาว ใช้งานง่ายก่อนแต่งหน้า เจาะกลุ่มผู้สนใจ K-Beauty วัย 20-40 ปี จำหน่ายผ่านมาร์เก็ตเพลสออนไลน์และพาร์ทเนอร์จัดจำหน่ายในเวียดนามและสิงคโปร์",
    brand: "แฮปปี้ คอสเมติกส์",
    shelfLife: "24 เดือน",
  },
  vi: {
    productName: "Kem Chống Nắng Happy Vita Calming SPF50+ PA++++",
    category: "Mỹ phẩm chống nắng",
    description:
      "Kem chống nắng dùng hàng ngày, dịu nhẹ cho cả da nhạy cảm. Chứa viên nang vitamin cùng thành phần làm dịu, cấp ẩm, kết cấu mỏng nhẹ không nhờn rít, giảm vệt trắng, dễ dùng trước khi trang điểm. Hướng đến người tiêu dùng yêu thích K-Beauty độ tuổi 20-40, phân phối qua các sàn thương mại điện tử và đối tác phân phối tại Việt Nam và Singapore.",
    brand: "Happy Cosmetics",
    shelfLife: "24 tháng",
  },
};

function mockAiDescription(productName, category) {
  const name = productName?.trim() || "이 상품";
  const cat = category?.trim() || "관심 카테고리";
  return `${name}은(는) ${cat} 부문에서 꾸준히 사랑받는 상품입니다. 우수한 품질과 실용적인 디자인으로 데일리 사용에 적합하며, 선물용으로도 좋은 반응을 얻고 있습니다. 지금 바로 만나보세요!`;
}

function CopyButton({ copied, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
      aria-label={sl.copyLabel}
    >
      <Icon name={copied ? "check" : "documents"} className="h-4 w-4" />
    </button>
  );
}

function ImagePickerButton({ onPick }) {
  const [open, setOpen] = useState(false);
  const { images } = useMarketingImages();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
      >
        <Icon name="sparkle" className="h-3 w-3" />
        {sl.imagePickerLabel}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {images.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-400">{sl.imagePickerEmpty}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => {
                    onPick(img.url, img.name);
                    setOpen(false);
                  }}
                  className="h-14 w-full overflow-hidden rounded-lg border border-slate-200 bg-cover bg-center hover:ring-2 hover:ring-brand-400"
                  style={{ backgroundImage: `url(${img.url})` }}
                  aria-label={img.name}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductImages({ images, onAdd, onRemove }) {
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAdd(URL.createObjectURL(file), file.name);
    e.target.value = "";
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">
          Product Images<span className="ml-1.5 text-xs font-normal text-slate-400">상품 이미지</span>
        </span>
        <div className="flex items-center gap-2">
          <ImagePickerButton onPick={onAdd} />
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
            <Icon name="upload" className="h-3 w-3" />
            {sl.imageUploadLabel}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, idx) => (
          <div
            key={img.url + idx}
            className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-cover bg-center"
            style={{ backgroundImage: `url(${img.url})` }}
          >
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="삭제"
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300">
            <Icon name="camera" className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}

function PriceSuggestion({ values, onApply }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const runSuggestion = async (targetMarket) => {
    setOpen(false);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/price-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: values.productName || "",
          category: values.category || "",
          description: values.description || "",
          brand: values.brand || "",
          krw_price: values.price || "",
          target_market: targetMarket,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "가격 추천에 실패했습니다."));
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="relative inline-block">
        <Button
          type="button"
          variant="outlineBrand"
          className="px-2.5 py-1.5 text-[11px]"
          onClick={() => setOpen((v) => !v)}
          disabled={loading || !values.productName}
        >
          <Icon name="sparkle" className="h-3 w-3" />
          {loading ? sl.priceSuggestPendingLabel : sl.priceSuggestLabel}
          <Icon name="chevronDown" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
        {open && (
          <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {sl.translateLanguages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => runSuggestion(lang.code)}
                className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!values.productName && <p className="mt-1 text-[10px] text-slate-400">Product Name을 먼저 입력하세요.</p>}
      {error && <p className="mt-1.5 text-[11px] font-medium text-red-500">{error}</p>}
      {result && (
        <div className="mt-1.5 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 text-[11px] leading-relaxed text-slate-700">
          <p className="font-bold text-brand-700">
            추천가: {result.suggestedPrice} {result.currency}
          </p>
          <p className="mt-1 text-slate-500">{result.reasoning}</p>
          <button
            type="button"
            onClick={() => onApply(result.suggestedPrice)}
            className="mt-1.5 font-semibold text-brand-600 hover:underline"
          >
            이 값으로 적용
          </button>
        </div>
      )}
    </div>
  );
}

// 번역 결과를 별도 패널에 따로 보여주지 않고, 언어를 고르면 아래 입력칸 내용 자체가
// 그 언어로 바뀐다 — 그래야 각 항목 옆 복사 버튼으로 바로 번역된 문구를 복사할 수 있다.
function TranslatePanel({ values, activeLang, translating, onTranslate }) {
  const hasContent = sl.fields.some((f) => (values[f.key] || "").trim());

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-slate-500">
        <Icon name="globe" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        {sl.translateAllLabel}
      </span>
      <button
        type="button"
        onClick={() => onTranslate("ko")}
        disabled={translating}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          activeLang === null ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
      >
        한국어(원본)
      </button>
      {sl.translateLanguages.map((lang) => (
        <button
          key={lang.code}
          type="button"
          disabled={!hasContent || translating}
          onClick={() => onTranslate(lang.code)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            activeLang === lang.code ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {lang.label}
        </button>
      ))}
      {translating && <span className="text-xs text-slate-400">{sl.translatingLabel}</span>}
      {!hasContent && <span className="text-xs text-slate-400">{sl.translateEmptyNote}</span>}
    </div>
  );
}

export default function ShopeeListing() {
  const [values, setValues] = useState(() => Object.fromEntries(sl.fields.map((f) => [f.key, ""])));
  const [images, setImages] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);

  const [translating, setTranslating] = useState(false);
  const [originalValues, setOriginalValues] = useState(null); // 번역 전 한글 원본 백업 (되돌리기용)
  const [activeLang, setActiveLang] = useState(null); // null이면 한국어 원본 상태

  const updateValue = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const copyField = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // clipboard access denied; silently ignore
    }
  };

  const addImage = (url, name) => setImages((prev) => [...prev, { url, name }]);
  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // 데모용: 실제 이전 제출 이력을 조회하는 대신 고정된 예시 상품 정보로 빈 칸을 채운다.
  const loadPreviousInfo = () => {
    setValues((prev) => {
      const next = { ...prev };
      Object.entries(PREVIOUS_INFO_MOCK).forEach(([key, value]) => {
        if (!next[key]) next[key] = value;
      });
      return next;
    });
  };

  // 데모용: "전체 번역하기"는 백엔드 번역 API 대신 고정 번역문(TRANSLATIONS_MOCK)으로 바꿔친다.
  // 입력칸 자체를 번역문으로 바꿔치기해야 각 항목 옆 복사 버튼으로 바로 번역된 문구를 복사할 수 있다.
  // 원본 한글은 처음 번역할 때 한 번만 백업해 뒀다가, "한국어(원본)"을 다시 고르면 복원한다.
  // 실제 번역이 일어나는 것처럼 보이도록 1초 버퍼링을 준다.
  const runTranslate = async (langCode) => {
    if (langCode === "ko") {
      if (originalValues) setValues(originalValues);
      setOriginalValues(null);
      setActiveLang(null);
      return;
    }
    const translated = TRANSLATIONS_MOCK[langCode];
    if (!translated) return;
    setTranslating(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!originalValues) setOriginalValues(values);
    setValues((prev) => ({ ...prev, ...translated }));
    setActiveLang(langCode);
    setTranslating(false);
  };

  const aiFill = (key) => {
    if (key === "description") {
      updateValue("description", mockAiDescription(values.productName, values.category));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{sl.title}</h1>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-600">{sl.titleBadge}</span>
      </div>
      <p className="mt-1 mb-6 text-sm text-slate-500">{sl.subtitle}</p>

      {/* Shopee 공식 입점 가이드 */}
      <Card className="mb-6 p-6">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
          <div>
            <span className="mb-3 inline-block rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-orange-600">
              {sl.officialGuide.badge}
            </span>
            <h2 className="text-lg font-bold text-slate-900">{sl.officialGuide.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{sl.officialGuide.description}</p>

            {sl.guideVideoUrl ? (
              <a
                href={sl.guideVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Icon name="play" className="h-4 w-4" />
                {sl.guideVideoLabel}
                <Icon name="externalLink" className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400">
                <Icon name="play" className="h-4 w-4" />
                {sl.guideVideoLabel}
              </span>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Icon name="help" className="h-3.5 w-3.5" />
              {sl.guideVideoUrl ? sl.officialGuide.note : sl.guideVideoPendingNote}
            </p>
          </div>

          <a
            href={sl.guideVideoUrl || undefined}
            target="_blank"
            rel="noreferrer"
            aria-label={sl.guideVideoLabel}
            className={`group relative block aspect-video w-full overflow-hidden rounded-2xl bg-orange-600 text-white shadow-lg ${
              sl.guideVideoUrl ? "" : "pointer-events-none opacity-70"
            }`}
          >
            <img
              src="/shopee-onboarding-part1.png"
              alt="Shopee 신규 셀러 입점 교육 Part 1 썸네일"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute right-4 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 transition-transform group-hover:scale-110">
              <Icon name="play" className="h-6 w-6 text-white" />
            </span>
            <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold">
              {sl.officialGuide.thumbnailDuration}
            </span>
          </a>
        </div>
      </Card>

      {/* GLOBIZ 지원 4단계 */}
      <Card className="mb-6 bg-slate-50/60 p-6">
        <span className="mb-2 inline-block rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand-700">
          {sl.supportSteps.badge}
        </span>
        <h2 className="text-lg font-bold text-slate-900">{sl.supportSteps.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{sl.supportSteps.subtitle}</p>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {sl.supportSteps.steps.map((step, idx) => (
            <div key={step.title} className="relative text-center">
              {idx < sl.supportSteps.steps.length - 1 && (
                <Icon
                  name="arrowRight"
                  className="absolute right-[-1.5rem] top-6 hidden h-4 w-4 text-slate-300 lg:block"
                />
              )}
              <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
                <span className="absolute -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <Icon name={step.icon} className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.description}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Icon name="help" className="h-3.5 w-3.5 shrink-0" />
          {sl.supportSteps.note}
        </p>
      </Card>

      {/* 실제 입력 폼 (기능 동일) */}
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{sl.formTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{sl.formSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={loadPreviousInfo}>
              <Icon name="history" className="h-3.5 w-3.5" />
              {sl.loadPreviousLabel}
            </Button>
            <TranslatePanel values={values} activeLang={activeLang} translating={translating} onTranslate={runTranslate} />
          </div>
        </div>

        <div className="mb-5">
          <ProductImages images={images} onAdd={addImage} onRemove={removeImage} />
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {sl.fields.map((field) => {
          const isEmptyHighlighted = HIGHLIGHT_WHEN_EMPTY.has(field.key) && !(values[field.key] ?? "").toString().trim();
          const fieldInputClass = `w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 ${
            isEmptyHighlighted ? "border-brand-500 bg-white ring-2 ring-brand-100" : "border-slate-300 bg-slate-50"
          }`;
          return (
            <div key={field.key} className={field.multiline ? "sm:col-span-2" : ""}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-bold text-slate-800">
                  {field.label}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{field.ko}</span>
                </span>
                {field.aiFillable && (
                  <Button
                    type="button"
                    variant="outlineBrand"
                    className="px-2 py-0.5 text-[10px]"
                    onClick={() => aiFill(field.key)}
                  >
                    <Icon name="sparkle" className="h-3 w-3" />
                    {sl.aiFillLabel}
                  </Button>
                )}
              </div>
              <div className="flex items-start gap-2">
                {field.multiline ? (
                  <textarea
                    rows={3}
                    value={values[field.key] ?? ""}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className={fieldInputClass}
                  />
                ) : (
                  <input
                    value={values[field.key] ?? ""}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className={fieldInputClass}
                  />
                )}
                <CopyButton copied={copiedKey === field.key} onClick={() => copyField(field.key, values[field.key])} />
              </div>
              {field.priceSuggestable && <PriceSuggestion values={values} onApply={(price) => updateValue(field.key, price)} />}
            </div>
          );
        })}
        </div>

        <p className="mt-6 flex items-center gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <Icon name="help" className="h-3.5 w-3.5 shrink-0" />
          {sl.formNote}
        </p>
      </Card>
    </div>
  );
}
