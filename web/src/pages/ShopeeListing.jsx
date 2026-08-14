import { useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { shopeeListing as sl } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";
import { useExportItems } from "../context/ExportItemsContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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

function mockAiDescription(productName, category) {
  const name = productName?.trim() || "이 상품";
  const cat = category?.trim() || "관심 카테고리";
  return `${name}은(는) ${cat} 부문에서 꾸준히 사랑받는 상품입니다. 우수한 품질과 실용적인 디자인으로 데일리 사용에 적합하며, 선물용으로도 좋은 반응을 얻고 있습니다. 지금 바로 만나보세요!`;
}

function buildAllText(fields, values) {
  return fields.map((f) => `${f.label}: ${values[f.key] || ""}`).join("\n");
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

function TranslatePanel({ values, translated, targetLang, translating, onTranslate, onCopy, copiedAll }) {
  const [open, setOpen] = useState(false);
  const hasContent = sl.fields.some((f) => (values[f.key] || "").trim());

  return (
    <div className="relative">
      <Button
        type="button"
        className="px-3 py-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        disabled={translating}
      >
        <Icon name="globe" className="h-3.5 w-3.5" />
        {translating ? sl.translatingLabel : sl.translateAllLabel}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {!hasContent && <p className="px-2 py-2 text-xs text-slate-400">{sl.translateEmptyNote}</p>}
          {sl.translateLanguages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              disabled={!hasContent}
              onClick={() => {
                onTranslate(lang.code);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {lang.label}
              {targetLang === lang.code && translated && <Icon name="check" className="h-3.5 w-3.5 text-brand-600" />}
            </button>
          ))}
        </div>
      )}

      {translated && (
        <div className="absolute right-0 top-full z-10 mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              {sl.translateResultTitle} ({sl.translateLanguages.find((l) => l.code === targetLang)?.label})
            </p>
            <Button type="button" variant="secondary" className="px-2.5 py-1.5 text-[11px]" onClick={onCopy}>
              <Icon name={copiedAll ? "check" : "documents"} className="h-3.5 w-3.5" />
              {copiedAll ? sl.copiedLabel : sl.copyLabel}
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
            {sl.fields.map((f) => (
              <div key={f.key}>
                <p className="font-semibold text-slate-500">{f.label}</p>
                <p className="whitespace-pre-wrap text-slate-800">{translated[f.key] || "-"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const [loadError, setLoadError] = useState(null);

  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const [translated, setTranslated] = useState(null);
  const [targetLang, setTargetLang] = useState(null);
  const [copiedAllTranslated, setCopiedAllTranslated] = useState(false);

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

  // 최근 등록한 수출 품목 + 예전에 제출했던 서류의 값을 끌어와 빈 칸을 채운다.
  const loadPreviousInfo = async () => {
    setLoadingPrevious(true);
    setLoadError(null);
    try {
      const next = { ...values };

      const latestItem = exportItems?.[0];
      if (latestItem) {
        if (!next.productName) next.productName = latestItem.name || "";
        if (!next.category && latestItem.category && latestItem.category !== "기타") next.category = latestItem.category;
      }
      if (!next.brand && profile?.company) next.brand = profile.company;

      if (authUser?.id) {
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
      }

      setValues(next);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoadingPrevious(false);
    }
  };

  const runTranslate = async (langCode) => {
    setTranslating(true);
    setTranslateError(null);
    try {
      const payload = Object.fromEntries(sl.fields.map((f) => [f.key, values[f.key] || ""]));
      const res = await fetch(`${BACKEND_URL}/translate-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload, target_lang: langCode }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "번역에 실패했습니다."));
      const data = await res.json();
      setTranslated(data.translated);
      setTargetLang(langCode);
    } catch (err) {
      setTranslateError(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const copyTranslated = async () => {
    if (!translated) return;
    try {
      await navigator.clipboard.writeText(buildAllText(sl.fields, translated));
      setCopiedAllTranslated(true);
      setTimeout(() => setCopiedAllTranslated(false), 1500);
    } catch {
      // clipboard access denied; silently ignore
    }
  };

  const aiFill = (key) => {
    if (key === "description") {
      updateValue("description", mockAiDescription(values.productName, values.category));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{sl.title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{sl.subtitle}</p>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-bold text-slate-900">{sl.introTitle}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sl.introSteps.map((step, idx) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {idx + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          {sl.guideVideoUrl ? (
            <a
              href={sl.guideVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Icon name="play" className="h-4 w-4" />
              {sl.guideVideoLabel}
            </a>
          ) : (
            <div>
              <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400">
                <Icon name="play" className="h-4 w-4" />
                {sl.guideVideoLabel}
              </span>
              <p className="mt-1.5 text-xs text-slate-400">{sl.guideVideoPendingNote}</p>
            </div>
          )}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={loadPreviousInfo} disabled={loadingPrevious}>
          <Icon name="history" className="h-3.5 w-3.5" />
          {loadingPrevious ? "불러오는 중..." : sl.loadPreviousLabel}
        </Button>
        <TranslatePanel
          values={values}
          translated={translated}
          targetLang={targetLang}
          translating={translating}
          onTranslate={runTranslate}
          onCopy={copyTranslated}
          copiedAll={copiedAllTranslated}
        />
      </div>
      {loadError && <p className="mb-3 text-xs font-medium text-red-500">{loadError}</p>}
      {translateError && <p className="mb-3 text-xs font-medium text-red-500">{translateError}</p>}

      <Card className="p-6">
        <div className="mb-5">
          <ProductImages images={images} onAdd={addImage} onRemove={removeImage} />
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {sl.fields.map((field) => (
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
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              ) : (
                <input
                  value={values[field.key] ?? ""}
                  onChange={(e) => updateValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              )}
              <CopyButton copied={copiedKey === field.key} onClick={() => copyField(field.key, values[field.key])} />
            </div>
            {field.priceSuggestable && <PriceSuggestion values={values} onApply={(price) => updateValue(field.key, price)} />}
          </div>
        ))}
        </div>
      </Card>
    </div>
  );
}
