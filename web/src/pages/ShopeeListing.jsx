import { useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { shopeeListing as sl, shopeeReferenceForm as rf, myExportItems as mi, user } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";

function mockAiDescription(productName, category) {
  const name = productName?.trim() || "이 상품";
  const cat = category?.trim() || "관심 카테고리";
  return `${name}은(는) ${cat} 부문에서 꾸준히 사랑받는 상품입니다. 우수한 품질과 실용적인 디자인으로 데일리 사용에 적합하며, 선물용으로도 좋은 반응을 얻고 있습니다. 지금 바로 만나보세요!`;
}

function buildAllText(fields, values) {
  return fields.map((f) => `${f.enLabel}: ${values[f.key] || ""}`).join("\n");
}

function CopyButton({ copied, onClick }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0 whitespace-nowrap px-2.5 py-2 text-xs"
      onClick={onClick}
    >
      {copied ? <Icon name="check" className="h-3.5 w-3.5" /> : <Icon name="documents" className="h-3.5 w-3.5" />}
      {copied ? sl.copiedLabel : sl.copyLabel}
    </Button>
  );
}

// 영문 라벨 + 작은 한국어 뜻 + (있다면) AI 자동완성 버튼
function FieldHeader({ field, onAiFill }) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
      <span>
        <span className="text-xs font-bold text-slate-800">
          {field.en}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        <span className="ml-1.5 text-[10px] text-slate-400">{field.ko}</span>
      </span>
      <div className="flex items-center gap-2">
        {field.meta && <span className="text-[10px] text-slate-400">{field.meta}</span>}
        {field.aiFillable && (
          <Button type="button" variant="outlineBrand" className="px-2 py-0.5 text-[10px]" onClick={onAiFill}>
            <Icon name="sparkle" className="h-3 w-3" />
            {sl.aiFillLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// 실제 필요한 값(field.key 존재)은 입력창 + 복사 버튼으로, 그 외 나머지 스펙 항목은
// 참고용 자리표시자로 렌더링한다 — 참고 레이아웃과 입력 영역을 하나로 합친 형태.
function LiveField({ field, values, onChange, onCopy, copiedKey, onAiFill }) {
  if (!field.key) {
    return (
      <div>
        <FieldHeader field={field} />
        <div className={field.multiline ? "h-16 rounded-md bg-slate-100" : "h-8 rounded-md bg-slate-100"} />
      </div>
    );
  }

  const Tag = field.multiline ? "textarea" : "input";
  return (
    <div>
      <FieldHeader field={field} onAiFill={() => onAiFill(field.key)} />
      <div className="flex items-start gap-2">
        <Tag
          rows={field.multiline ? 3 : undefined}
          value={values[field.key] ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <CopyButton copied={copiedKey === field.key} onClick={() => onCopy(field.key, values[field.key])} />
      </div>
    </div>
  );
}

function RefSpecField({ field, values, onChange, onCopy, copiedKey }) {
  if (!field.key) {
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">
            {field.en}
            {field.required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
          {field.tag && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${field.errorTag ? "text-red-500" : "text-amber-500"}`}>
              {field.tag}
            </span>
          )}
        </div>
        <p className="mb-1.5 text-[11px] text-slate-400">{field.ko}</p>
        <div className="h-7 rounded-md bg-slate-100" />
        {field.errorTag && (
          <p className="mt-1 text-[10px] font-semibold text-red-500">{field.errorTag} · Edit now</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">
          {field.en}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {field.tag && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-500">{field.tag}</span>}
      </div>
      <p className="mb-1.5 text-[11px] text-slate-400">{field.ko}</p>
      <div className="flex items-start gap-1.5">
        <input
          value={values[field.key] ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => onCopy(field.key, values[field.key])}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50"
          aria-label={sl.copyLabel}
        >
          <Icon name={copiedKey === field.key ? "check" : "documents"} className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
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
                    onPick(img.url);
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

function LoadMenus({ onLoadPrevious, onLoadMyInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => setOpen((v) => !v)}>
        <Icon name="history" className="h-3.5 w-3.5" />
        {sl.loadPreviousLabel}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {mi.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onLoadPrevious(item);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-800">{item.name}</span>
              <span className="text-xs text-slate-400">{item.category} · {item.destination}</span>
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            onClick={() => {
              onLoadMyInfo();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-50"
          >
            <Icon name="user" className="h-3.5 w-3.5" />
            {sl.loadMyInfoLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShopeeListing() {
  const [values, setValues] = useState(() => Object.fromEntries(sl.fields.map((f) => [f.key, ""])));
  const [copiedKey, setCopiedKey] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [showAllSpecs, setShowAllSpecs] = useState(false);

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

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildAllText(sl.fields, values));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // clipboard access denied; silently ignore
    }
  };

  const loadPrevious = (item) => {
    setValues((prev) => ({ ...prev, productName: item.name, category: item.category }));
  };

  const loadMyInfo = () => {
    setValues((prev) => ({ ...prev, brand: user.company }));
  };

  const aiFill = (key) => {
    if (key === "description") {
      updateValue("description", mockAiDescription(values.productName, values.category));
    }
  };

  const visibleSpecs = showAllSpecs ? rf.specification.fields : rf.specification.fields.slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
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
        <LoadMenus onLoadPrevious={loadPrevious} onLoadMyInfo={loadMyInfo} />
        <Button type="button" className="px-3 py-2 text-xs" onClick={copyAll}>
          {copiedAll ? <Icon name="check" className="h-3.5 w-3.5" /> : <Icon name="documents" className="h-3.5 w-3.5" />}
          {copiedAll ? sl.copiedLabel : sl.copyAllLabel}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-xs font-semibold text-slate-500">
            {rf.breadcrumb.join(" > ")} <span className="text-slate-300">(쇼피 화면 그대로 정보 입력)</span>
          </p>
        </div>

        <div className="flex divide-x divide-slate-100">
          <div className="hidden w-36 shrink-0 flex-col gap-3 bg-slate-50 p-4 sm:flex">
            {rf.steps.map((step) => (
              <div key={step.en}>
                <p className="text-[11px] font-bold text-slate-700">{step.en}</p>
                <p className="text-[10px] text-slate-400">{step.ko}</p>
              </div>
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-4 p-5">
            {/* Basic information */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">
                {rf.basic.title} <span className="text-xs font-normal text-slate-400">({rf.basic.ko})</span>
              </p>

              <div className="mb-1 flex items-center justify-between gap-2">
                <FieldHeader field={rf.basic.images} />
                <ImagePickerButton onPick={setCoverImage} />
              </div>
              <p className="mb-2 -mt-1 text-[10px] text-slate-400">{rf.basic.images.note}</p>
              <div className="mb-3 flex gap-2">
                <div
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-cover bg-center text-slate-300"
                  style={coverImage ? { backgroundImage: `url(${coverImage})`, borderStyle: "solid" } : undefined}
                >
                  {!coverImage && <Icon name="camera" className="h-5 w-5" />}
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300">
                  <Icon name="upload" className="h-5 w-5" />
                </div>
              </div>

              <FieldHeader field={rf.basic.video} />
              <p className="mb-2 -mt-1 text-[10px] text-slate-400">{rf.basic.video.note}</p>
              <div className="mb-3 h-10 w-16 rounded-lg border-2 border-dashed border-slate-200" />

              <div className="mb-3">
                <LiveField field={rf.basic.name} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
              </div>
              <div className="mb-3">
                <LiveField field={rf.basic.category} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
              </div>
              <div>
                <LiveField field={rf.basic.description} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
                {!values.description && <p className="mt-1 text-[10px] text-red-500">{rf.basic.description.error}</p>}
              </div>
            </div>

            {/* Specification */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-800">
                {rf.specification.title} <span className="text-xs font-normal text-slate-400">({rf.specification.ko})</span>
              </p>
              <p className="mb-3 text-[11px] text-slate-400">{rf.specification.completeNote}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visibleSpecs.map((field) => (
                  <RefSpecField key={field.en} field={field} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAllSpecs((v) => !v)}
                className="mt-3 text-xs font-semibold text-brand-600 hover:underline"
              >
                {showAllSpecs ? rf.specification.showLessLabel : `+${rf.specification.fields.length - 8} more`}
              </button>
            </div>

            {/* Sales Information */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">
                {rf.sales.title} <span className="text-xs font-normal text-slate-400">({rf.sales.ko})</span>
              </p>
              <FieldHeader field={rf.sales.variations} />
              <div className="mb-3 inline-block rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-600">
                + {rf.sales.variations.action}
              </div>
              <div className="mb-1">
                <LiveField field={rf.sales.price} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
              </div>
              <p className="mb-3 text-[10px] leading-relaxed text-slate-400">{rf.sales.priceNote}</p>
              <LiveField field={rf.sales.stock} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
            </div>

            {/* Shipping */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">
                {rf.shipping.title} <span className="text-xs font-normal text-slate-400">({rf.shipping.ko})</span>
              </p>
              <div className="mb-3">
                <LiveField field={rf.shipping.weight} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
              </div>
              <FieldHeader field={rf.shipping.parcelSize} />
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="h-8 rounded-md bg-slate-100" />
                <div className="h-8 rounded-md bg-slate-100" />
                <div className="h-8 rounded-md bg-slate-100" />
              </div>
              <LiveField field={rf.shipping.daysToShip} values={values} onChange={updateValue} onCopy={copyField} copiedKey={copiedKey} onAiFill={aiFill} />
            </div>

            {/* Others */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">
                {rf.others.title} <span className="text-xs font-normal text-slate-400">({rf.others.ko})</span>
              </p>
              <div className="mb-3">
                <FieldHeader field={rf.others.condition} />
                <div className="h-8 w-1/2 rounded-md bg-slate-100" />
              </div>
              <FieldHeader field={rf.others.parentSku} />
              <div className="h-8 w-1/2 rounded-md bg-slate-100" />
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex gap-2">
                {rf.bottomToolbar.map((label, idx) => (
                  <span
                    key={label}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      idx === 0
                        ? "border border-slate-300 text-slate-500"
                        : idx === 1
                          ? "bg-brand-600 text-white"
                          : "bg-amber-500 text-white"
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-600">
                {rf.bottomErrorTag}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-700">
          {sl.referenceNote}
        </div>
      </Card>
    </div>
  );
}
