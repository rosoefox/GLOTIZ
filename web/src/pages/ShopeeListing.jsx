import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Card, Button, emptyFieldClass, SectionCardHeader } from "../components/ui";
import { shopeeListing as sl } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";
import { useExportItems } from "../context/ExportItemsContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// "이전 정보 불러오기"(전체 일괄, 매칭되는 값이 있을 때만)나 필드 옆 전용 AI 버튼(AI로
// 채우기/가격 추천받기)으로 채워지는 항목(description, price)을 뺀 나머지는 사용자가 직접
// 입력해야 하는 항목들이다 — 비어 있는 동안은 테두리를 브랜드 색으로 강조해서 채우는 걸
// 잊지 않게 하고, 값을 입력하면 바로 원래(회색 테두리) 모습으로 돌아온다.
const AI_ASSISTED_FIELD_KEYS = new Set(sl.fields.filter((f) => f.aiFillable || f.priceSuggestable).map((f) => f.key));
const HIGHLIGHT_WHEN_EMPTY = new Set(sl.fields.map((f) => f.key).filter((k) => !AI_ASSISTED_FIELD_KEYS.has(k)));

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

// 서류(template_fields)의 field_key는 사업별로 제각각이라, 흔히 쓰이는 패턴으로
// 쇼피 입력 항목과 매칭한다. 여러 서류에 걸쳐 값이 있으면 가장 최근 값을 쓴다.
const FIELD_KEY_PATTERNS = {
  productName: /product.?name|item.?name|상품명|제품명/i,
  category: /categor|품목|업종/i,
  description: /description|상품.?설명|제품.?설명|사업.?내용/i,
  brand: /brand|브랜드|상호|company.?name|business.?name/i,
  shelfLife: /shelf.?life|유통기한/i,
  price: /unit.?price|sale.?price|판매가|단가|가격/i,
  stock: /stock|재고/i,
  weight: /weight|무게|중량/i,
  daysToShip: /days.?to.?ship|배송.?준비|리드타임/i,
};

// 쇼피 입력 항목(원래는 카테고리 구분 없이 한 줄로 쭉 나열됨)을 오른쪽 작성 현황 패널에서
// 섹션별로 체크할 수 있도록 두 그룹으로 나눈다.
const FIELD_GROUPS = [
  { title: "기본 정보", keys: ["productName", "category", "brand", "description"] },
  { title: "판매 정보", keys: ["price", "stock", "shelfLife", "weight", "daysToShip"] },
].map((g) => ({ ...g, fields: g.keys.map((k) => sl.fields.find((f) => f.key === k)).filter(Boolean) }));

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
      <Icon name={copied ? "check" : "documents"} className="w-5 h-5" />
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
        <Icon name="sparkle" className="w-3.5 h-3.5" />
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
            <Icon name="upload" className="w-3.5 h-3.5" />
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
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300">
            <Icon name="camera" className="w-5 h-5" />
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
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          {loading ? sl.priceSuggestPendingLabel : sl.priceSuggestLabel}
          <Icon name="chevronDown" className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
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
        <Icon name="globe" className="mr-1 inline w-3.5 h-3.5 align-[-2px]" />
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
  const { user: authUser, profile } = useAuth();
  const { items: exportItems } = useExportItems();

  const [values, setValues] = useState(() => Object.fromEntries(sl.fields.map((f) => [f.key, ""])));
  const [images, setImages] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  const [translating, setTranslating] = useState(false);
  const [originalValues, setOriginalValues] = useState(null); // 번역 전 한글 원본 백업 (되돌리기용)
  const [activeLang, setActiveLang] = useState(null); // null이면 한국어 원본 상태

  const [activeStep, setActiveStep] = useState(0);
  const sectionRefs = useRef([]);
  sectionRefs.current = [];
  const registerSection = (el) => {
    if (el && !sectionRefs.current.includes(el)) sectionRefs.current.push(el);
  };

  useEffect(() => {
    const els = sectionRefs.current;
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveStep(Number(topMost.target.dataset.stepIndex));
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

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

  // 최근 등록한 수출 품목 + 예전에 제출했던 서류의 값을 먼저 끌어와 빈 칸을 채우고, 그래도
  // 안 채워진 항목은 데모용 예시 상품 정보(PREVIOUS_INFO_MOCK)로 메운다 — 실사용자는 실제
  // 이력을 우선 보고, 이력이 없는 데모 환경(박람회 등)에서도 빈 화면 없이 항상 채워진다.
  const loadPreviousInfo = async () => {
    setLoadingPrevious(true);
    try {
      const next = { ...values };

      const latestItem = exportItems?.[0];
      if (latestItem) {
        if (!next.productName) next.productName = latestItem.name || "";
        if (!next.category && latestItem.category && latestItem.category !== "기타") next.category = latestItem.category;
      }
      if (!next.brand && profile?.company) next.brand = profile.company;

      if (authUser?.id) {
        try {
          const { data: subs } = await supabase
            .from("submissions")
            .select("id, created_at")
            .eq("user_id", authUser.id)
            .order("created_at", { ascending: false });
          const submissionIds = (subs || []).map((s) => s.id);

          if (submissionIds.length) {
            const orderRank = Object.fromEntries(submissionIds.map((id, idx) => [id, idx]));
            const { data: valueRows } = await supabase
              .from("submission_values")
              .select("submission_id, field_id, value")
              .in("submission_id", submissionIds);
            const fieldIds = [...new Set((valueRows || []).map((v) => v.field_id))];
            const { data: fieldRows } = fieldIds.length
              ? await supabase.from("template_fields").select("id, field_key").in("id", fieldIds)
              : { data: [] };
            const keyByFieldId = Object.fromEntries((fieldRows || []).map((f) => [f.id, f.field_key]));

            const sortedValues = (valueRows || [])
              .filter((v) => (v.value || "").trim())
              .sort((a, b) => (orderRank[a.submission_id] ?? 0) - (orderRank[b.submission_id] ?? 0));

            Object.entries(FIELD_KEY_PATTERNS).forEach(([shopeeKey, pattern]) => {
              if (next[shopeeKey]) return;
              const match = sortedValues.find((v) => pattern.test(keyByFieldId[v.field_id] || ""));
              if (match) next[shopeeKey] = match.value;
            });
          }
        } catch {
          // 백엔드/네트워크 문제는 조용히 넘어가고 아래 데모 폴백으로 빈 칸을 채운다.
        }
      }

      Object.entries(PREVIOUS_INFO_MOCK).forEach(([key, value]) => {
        if (!next[key]) next[key] = value;
      });

      setValues(next);
    } finally {
      setLoadingPrevious(false);
    }
  };

  // "전체 번역하기"는 별도 패널에 번역문을 따로 보여주는 대신, 입력칸 자체를 번역문으로
  // 바꿔치기한다 — 그래야 각 항목 옆 복사 버튼을 눌렀을 때 바로 번역된 문구가 복사된다.
  // 원본 한글은 처음 번역할 때 한 번만 백업해 뒀다가, "한국어(원본)"을 다시 고르면 복원한다.
  // 실제 번역 API를 먼저 시도하고, 실패하면(네트워크 문제 등) 데모용 고정 번역문으로
  // 대체한다 — 박람회 등 백엔드가 불안정할 수 있는 환경에서도 항상 결과가 나오게 한다.
  const runTranslate = async (langCode) => {
    if (langCode === "ko") {
      if (originalValues) setValues(originalValues);
      setOriginalValues(null);
      setActiveLang(null);
      return;
    }
    setTranslating(true);
    try {
      const koreanValues = originalValues || values;
      const payload = Object.fromEntries(sl.fields.map((f) => [f.key, koreanValues[f.key] || ""]));
      const res = await fetch(`${BACKEND_URL}/translate-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload, target_lang: langCode }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "번역에 실패했습니다."));
      const data = await res.json();
      if (!originalValues) setOriginalValues(values);
      setValues((prev) => ({ ...prev, ...data.translated }));
      setActiveLang(langCode);
    } catch {
      const translated = TRANSLATIONS_MOCK[langCode];
      if (translated) {
        // 실제 번역이 일어나는 것처럼 보이도록 짧은 버퍼링을 준다.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!originalValues) setOriginalValues(values);
        setValues((prev) => ({ ...prev, ...translated }));
        setActiveLang(langCode);
      }
    } finally {
      setTranslating(false);
    }
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
                <Icon name="play" className="w-5 h-5" />
                {sl.guideVideoLabel}
                <Icon name="externalLink" className="w-5 h-5" />
              </a>
            ) : (
              <span className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400">
                <Icon name="play" className="w-5 h-5" />
                {sl.guideVideoLabel}
              </span>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Icon name="help" className="w-3.5 h-3.5" />
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
              <Icon name="play" className="w-5 h-5 text-white" />
            </span>
            <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold">
              {sl.officialGuide.thumbnailDuration}
            </span>
          </a>
        </div>
      </Card>

      {/* GLOTIZ 지원 4단계 */}
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
                  className="absolute right-[-1.5rem] top-6 hidden w-5 h-5 text-slate-400 lg:block"
                />
              )}
              <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center">
                <span className="absolute -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <Icon name={step.icon} className="w-5 h-5 text-slate-500" />
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

      {/* 실제 입력 폼 (기능 동일, 오른쪽에 작성 현황 요약 패널) */}
      <div>
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{sl.formTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{sl.formSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outlineBrand" className="px-3.5 py-2 text-xs" onClick={loadPreviousInfo} disabled={loadingPrevious}>
              <Icon name="history" className="w-3.5 h-3.5" />
              {loadingPrevious ? "불러오는 중..." : sl.loadPreviousLabel}
            </Button>
            <TranslatePanel values={values} activeLang={activeLang} translating={translating} onTranslate={runTranslate} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <div
              ref={registerSection}
              data-step-index={0}
              className="rounded-lg border border-slate-200 bg-white"
            >
              <SectionCardHeader title="상품 이미지" />
              <div className="p-6">
                <ProductImages images={images} onAdd={addImage} onRemove={removeImage} />
              </div>
            </div>

            {FIELD_GROUPS.map((group, groupIdx) => (
              <div
                key={group.title}
                ref={registerSection}
                data-step-index={groupIdx + 1}
                className="rounded-lg border border-slate-200 bg-white"
              >
                <SectionCardHeader title={group.title} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
                  {group.fields.map((field) => {
                    const isEmptyHighlighted =
                      HIGHLIGHT_WHEN_EMPTY.has(field.key) && !(values[field.key] ?? "").toString().trim();
                    const fieldInputClass = `${emptyFieldClass(isEmptyHighlighted)} ${field.multiline ? "py-2.5" : "h-10"}`;
                    return (
                      <div key={field.key} className={field.multiline ? "sm:col-span-2" : ""}>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {field.label}
                            <span className="ml-1.5 normal-case tracking-normal text-slate-400">{field.ko}</span>
                          </span>
                          {field.aiFillable && (
                            <Button
                              type="button"
                              variant="outlineBrand"
                              className="px-2 py-0.5 text-[10px]"
                              onClick={() => aiFill(field.key)}
                            >
                              <Icon name="sparkle" className="w-3.5 h-3.5" />
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
                        {field.priceSuggestable && (
                          <PriceSuggestion values={values} onApply={(price) => updateValue(field.key, price)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">작성 현황</p>
              <p className="mt-1.5 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900">
                  {sl.fields.filter((f) => (values[f.key] ?? "").toString().trim()).length}
                </span>
                <span className="text-sm font-medium text-slate-400">/ {sl.fields.length}건 입력</span>
              </p>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-brand-600 transition-all"
                  style={{
                    width: `${Math.round(
                      (sl.fields.filter((f) => (values[f.key] ?? "").toString().trim()).length / sl.fields.length) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span
                    className={`flex items-center gap-2 ${
                      activeStep === 0 ? "font-semibold text-slate-900" : "text-slate-500"
                    }`}
                  >
                    <Icon
                      name={images.length > 0 ? "checkCircle" : "camera"}
                      className={`w-4 h-4 shrink-0 ${images.length > 0 ? "text-emerald-500" : "text-slate-300"}`}
                    />
                    상품 이미지
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{images.length}장</span>
                </div>
                {FIELD_GROUPS.map((group, idx) => {
                  const done = group.fields.filter((f) => (values[f.key] ?? "").toString().trim()).length;
                  return (
                    <div key={group.title} className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className={`flex items-center gap-2 ${
                          activeStep === idx + 1 ? "font-semibold text-slate-900" : "text-slate-500"
                        }`}
                      >
                        <Icon
                          name={done === group.fields.length ? "checkCircle" : "documents"}
                          className={`w-4 h-4 shrink-0 ${done === group.fields.length ? "text-emerald-500" : "text-slate-300"}`}
                        />
                        {group.title}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {done}/{group.fields.length}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-5 flex items-start gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400">
                <Icon name="help" className="w-3.5 h-3.5 shrink-0" />
                {sl.formNote}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
