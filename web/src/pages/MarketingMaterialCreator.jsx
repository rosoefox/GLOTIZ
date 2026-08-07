import { useState } from "react";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { marketingMaterialCreator as mc } from "../data/mockData";

export default function MarketingMaterialCreator() {
  const [activeTemplate, setActiveTemplate] = useState(
    mc.templates.items.find((t) => t.selected)?.id
  );
  const [activeCategory, setActiveCategory] = useState(mc.templates.categories[0]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{mc.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{mc.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="py-2">
            <Icon name="history" className="h-4 w-4" />
            {mc.actions.loadFromDoc}
          </Button>
          <Button className="py-2">
            <Icon name="upload" className="h-4 w-4" />
            {mc.actions.saveImage}
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
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                <Icon name="upload" className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">{mc.uploadHint.title}</p>
              <p className="mt-1 text-xs text-slate-400">{mc.uploadHint.sub}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-14 w-14 rounded-lg bg-slate-800" />
              <button className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:bg-slate-50">
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
                  <div className="flex h-20 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
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
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-lg">
              <div className="relative flex h-56 items-center justify-center bg-slate-900">
                <div className="h-32 w-16 rounded-lg bg-slate-700" />
                <Badge tone="warning" className="absolute right-3 top-3">
                  <Icon name="sparkle" className="h-3 w-3" />
                  {mc.preview.sourceBadge}
                </Badge>
              </div>
              <div className="p-5">
                <h4 className="text-xl font-bold text-slate-900">{mc.preview.productName}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{mc.preview.description}</p>
                <div className="mt-4 flex gap-2">
                  {mc.preview.specs.map((s) => (
                    <div key={s.label} className="flex-1 rounded-lg bg-slate-50 p-3 text-center">
                      <Icon name={s.icon === "temperature" ? "analysis" : "growth"} className="mx-auto mb-1 h-4 w-4 text-brand-600" />
                      <p className="text-[11px] text-slate-400">{s.label}</p>
                      <p className="text-sm font-bold text-slate-900">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span className="font-bold text-brand-700">{mc.preview.brand}</span>
                  <span>{mc.preview.website}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
