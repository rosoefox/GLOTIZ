import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { marketingMaterialCreator as mc, documentPreview as dp } from "../data/mockData";
import { useMarketingImages } from "../context/MarketingImagesContext";

const TEMPLATE_SWATCHES = {
  "tpl-modern-minimal": "from-indigo-200 via-white to-sky-200",
  "tpl-b2b-spec-sheet": "from-stone-200 to-teal-100",
  "tpl-promo-banner": "from-lime-200 to-emerald-200",
};

// 뷰티 화보형: 사진 풀블리드 + 세리프 타이포 오버레이 (미니멀·에디토리얼)
function ModernMinimalPreview({ preview, uploadedImage }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-100 via-white to-sky-100 shadow-lg">
      <div
        className="absolute inset-0 bg-slate-800 bg-cover bg-center"
        style={uploadedImage ? { backgroundImage: `url(${uploadedImage})` } : undefined}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/15 to-transparent" />
      <p className="absolute left-5 top-14 max-w-[60%] text-xs italic leading-relaxed text-white/90">
        {preview.description}
      </p>
      <div className="absolute bottom-6 left-5 right-5">
        <p className="text-lg font-semibold text-white/90">{preview.brand}</p>
        <p className="text-3xl font-bold italic leading-tight text-sky-100">{preview.productName}</p>
        <p className="mt-2 text-[10px] font-semibold tracking-[0.2em] text-white/80">
          {(preview.tagline || "").toUpperCase()}
        </p>
      </div>
    </div>
  );
}

// 할인 배너형: 좌(사진)·우(텍스트+가격) 분할 구성
function DiscountBannerPreview({ preview, uploadedImage }) {
  return (
    <div className="relative flex aspect-square w-full overflow-hidden rounded-2xl bg-stone-100 shadow-lg">
      <div
        className="h-full w-1/2 shrink-0 bg-slate-300 bg-cover bg-center"
        style={uploadedImage ? { backgroundImage: `url(${uploadedImage})` } : undefined}
      />
      <div className="flex w-1/2 flex-col justify-center gap-2 p-4">
        <p className="text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">{preview.brand}</p>
        <h4 className="text-lg font-bold leading-snug text-slate-900">{preview.productName}</h4>
        <p className="text-xs leading-relaxed text-slate-500">{preview.description}</p>
        {preview.price && (
          <>
            <span className="mt-2 inline-block w-fit rounded-full bg-teal-800 px-3 py-1 text-[10px] font-semibold text-white">
              {preview.brand} 단독할인
            </span>
            <p className="text-xl font-extrabold text-teal-800">{preview.price}</p>
          </>
        )}
      </div>
    </div>
  );
}

// 프로모션 배너형: 굵은 헤드라인 + 말풍선 스펙 강조 + 가격 뱃지 (SNS용)
function PromoBannerPreview({ preview, uploadedImage }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-lime-200 via-lime-100 to-emerald-100 p-5 text-center shadow-lg">
      <p className="pt-1 text-right text-sm font-bold italic text-emerald-800">{preview.brand}</p>

      <span className="mt-1 inline-flex items-center gap-1 rounded-full border-2 border-emerald-800 bg-white px-3 py-1 text-xs font-extrabold text-emerald-800">
        NEW
      </span>
      <p className="mt-2 text-xs font-medium text-emerald-700">{preview.tagline}</p>
      <h4 className="mt-1 text-2xl font-extrabold leading-tight text-emerald-900">{preview.productName}</h4>

      <div
        className="relative mx-auto mt-4 flex h-36 w-36 items-center justify-center rounded-full bg-white/60 bg-cover bg-center shadow-inner"
        style={uploadedImage ? { backgroundImage: `url(${uploadedImage})` } : undefined}
      >
        {!uploadedImage && <Icon name="camera" className="h-8 w-8 text-emerald-300" />}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {preview.specs.map((s) => (
          <span key={s.label} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 shadow">
            {s.label} {s.value}
          </span>
        ))}
      </div>

      {preview.price && (
        <span className="mt-3 inline-block rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-extrabold text-white shadow">
          {preview.price}
        </span>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-emerald-800/60">
        ※ 이미지는 연출된 예시 컷이며 실제와 다를 수 있습니다.
      </p>
    </div>
  );
}

const TEMPLATE_PREVIEWS = {
  "tpl-modern-minimal": ModernMinimalPreview,
  "tpl-b2b-spec-sheet": DiscountBannerPreview,
  "tpl-promo-banner": PromoBannerPreview,
};

export default function MarketingMaterialCreator() {
  const [activeTemplate, setActiveTemplate] = useState(
    mc.templates.items.find((t) => t.selected)?.id
  );
  const [activeCategory, setActiveCategory] = useState(mc.templates.categories[0]);
  const [preview, setPreview] = useState(mc.preview);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const { addImage } = useMarketingImages();

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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUploadedImage(url);
    addImage(url, preview.productName || file.name);
  };

  const loadFromDoc = () => {
    const item = dp.document.items[0];
    setPreview((p) => ({
      ...p,
      productName: item.description,
      description: `HS코드 ${item.hsCode} · 수량 ${item.quantity} · 단가 ${item.unitPrice}`,
    }));
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{mc.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{mc.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="py-2" onClick={loadFromDoc}>
            <Icon name="history" className="h-4 w-4" />
            {mc.actions.loadFromDoc}
          </Button>
          <Button className="py-2" onClick={handleSaveImage} disabled={savingImage}>
            <Icon name="download" className="h-4 w-4" />
            {savingImage ? "저장 중..." : mc.actions.saveImage}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Icon name="camera" className="h-4 w-4" />
              {mc.uploadLabel}
            </h3>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center hover:border-brand-300 hover:bg-brand-50"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                <Icon name="upload" className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">{mc.uploadHint.title}</p>
              <p className="mt-1 text-xs text-slate-400">{mc.uploadHint.sub}</p>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <div className="mt-3 flex gap-2">
              <div
                className="h-14 w-14 rounded-lg bg-slate-800 bg-cover bg-center"
                style={uploadedImage ? { backgroundImage: `url(${uploadedImage})` } : undefined}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:bg-slate-50"
              >
                <Icon name="plus" className="h-5 w-5" />
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-900">{mc.templateSectionTitle}</h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {mc.templates.categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    activeCategory === c
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mc.templates.items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTemplate(t.id)}
                  className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${
                    activeTemplate === t.id ? "border-brand-500" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`flex h-20 items-center justify-center bg-gradient-to-br text-slate-400 ${
                      TEMPLATE_SWATCHES[t.id] || "from-slate-100 to-slate-200"
                    }`}
                  >
                    <Icon name="documents" className="h-6 w-6" />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-semibold text-slate-700">{t.name}</span>
                    {activeTemplate === t.id && (
                      <Icon name="checkCircle" className="h-4 w-4 text-brand-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Icon name="eye" className="h-4 w-4" />
            {mc.previewTitle}
          </h3>

          <div className="flex min-h-[420px] items-center justify-center rounded-xl bg-slate-100 p-8">
            <div ref={previewRef} className="w-full max-w-sm">
              {(() => {
                const TemplatePreview = TEMPLATE_PREVIEWS[activeTemplate] || ModernMinimalPreview;
                return <TemplatePreview preview={preview} uploadedImage={uploadedImage} />;
              })()}
            </div>
          </div>
          {saveError && <p className="mt-3 text-xs font-medium text-red-500">{saveError}</p>}
        </Card>
      </div>
    </div>
  );
}
