import Icon from "../components/Icon";
import { Badge, Card, CardHeader, CardContent, Button } from "../components/ui";
import { translationEditor as te } from "../data/mockData";

function Field({ label, children, aiBadge }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {aiBadge && (
          <Badge tone="warning" className="!py-0.5 !text-[10px]">
            <Icon name="sparkle" className="w-3.5 h-3.5" />
            {aiBadge}
          </Badge>
        )}
      </div>
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          aiBadge ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function TranslationEditor() {
  const { source, target } = te;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Icon name="documents" className="w-5 h-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">{te.documentTitle}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="py-2">
            <Icon name="arrowRight" className="w-5 h-5" />
            {te.actions.exportPdf}
          </Button>
          <Button className="py-2">
            {te.actions.save}
          </Button>
        </div>
      </div>

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-slate-500">{te.languagePairLabel}:</span>
          <Badge tone="neutral">{te.languagePair.source}</Badge>
          <Icon name="arrowRight" className="w-5 h-5 text-slate-500" />
          <Badge tone="brand">{te.languagePair.target}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="py-2">
            <Icon name="globe" className="w-5 h-5" />
            {te.actions.translateAll}
          </Button>
          <Button variant="outlineBrand" className="border-amber-300 bg-amber-50 py-2 text-amber-700 hover:bg-amber-100">
            <Icon name="sparkle" className="w-5 h-5" />
            {te.actions.aiFill}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-4">
            <h3 className="text-sm font-bold text-slate-700">{te.sourcePanelTitle}</h3>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <p className="text-lg font-bold text-slate-900">COMMERCIAL INVOICE</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={te.fieldLabels.invoiceNo}>{source.invoiceNo}</Field>
              <Field label={te.fieldLabels.date}>{source.date}</Field>
            </div>
            <Field label={te.fieldLabels.shipper}>
              {source.shipper.map((l) => <p key={l}>{l}</p>)}
            </Field>
            <Field label={te.fieldLabels.consignee}>
              {source.consignee.map((l) => <p key={l}>{l}</p>)}
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">품목</span>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{te.fieldLabels.description}</th>
                      <th className="px-3 py-2 text-right font-medium">{te.fieldLabels.qty}</th>
                      <th className="px-3 py-2 text-right font-medium">{te.fieldLabels.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {source.items.map((it) => (
                      <tr key={it.description} className="border-t border-slate-100">
                        <td className="px-3 py-2">{it.description}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-3 py-2 text-right">{it.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-brand-200">
          <CardHeader className="flex-row items-center justify-between pb-4">
            <h3 className="text-sm font-bold text-brand-700">{te.targetPanelTitle}</h3>
            <span className="flex items-center gap-2">
              <Badge tone="brand">{te.targetBadge}</Badge>
              <button className="text-slate-400 hover:text-slate-600"><Icon name="undo" className="w-5 h-5" /></button>
              <button className="text-slate-400 hover:text-slate-600"><Icon name="redo" className="w-5 h-5" /></button>
            </span>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <p className="text-lg font-bold text-slate-900">상업송장 (COMMERCIAL INVOICE)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={te.fieldLabels.invoiceNo}>{target.invoiceNo}</Field>
              <Field label={te.fieldLabels.date} aiBadge={target.dateAiTranslated ? te.aiTranslatedBadge : null}>
                {target.date}
              </Field>
            </div>
            <Field label={te.fieldLabels.shipper}>
              {target.shipper.map((l) => <p key={l}>{l}</p>)}
            </Field>
            <Field label={te.fieldLabels.consignee} aiBadge={target.consigneeAiTranslated ? te.aiTranslatedBadge : null}>
              {target.consignee.map((l) => <p key={l}>{l}</p>)}
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">품목</span>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{te.fieldLabels.description}</th>
                      <th className="px-3 py-2 text-right font-medium">{te.fieldLabels.qty}</th>
                      <th className="px-3 py-2 text-right font-medium">{te.fieldLabels.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {target.items.map((it) => (
                      <tr key={it.description} className="border-t border-slate-100">
                        <td className={`px-3 py-2 ${it.aiTranslated ? "font-medium text-brand-700" : ""}`}>
                          {it.description}
                        </td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-3 py-2 text-right">{it.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
