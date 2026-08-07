import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { documentPreview as dp } from "../data/mockData";

function Highlight({ children }) {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5">{children}</span>;
}

export default function DocumentPreview() {
  const { document: doc } = dp;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">문서 미리보기</h1>
        <Badge tone="warning">
          <Icon name="sparkle" className="h-3 w-3" />
          {dp.badge}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Icon name="documents" className="h-4 w-4" />
              {dp.fileName}
            </span>
            <span className="text-xs text-slate-400">{dp.zoom}</span>
          </div>

          <div className="bg-slate-100 p-8">
            <div className="mx-auto max-w-xl rounded-lg bg-white p-8 text-sm shadow-sm">
              <h2 className="mb-6 text-center text-xl font-bold tracking-wide">{doc.title}</h2>

              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 font-semibold text-slate-800">{doc.shipperLabel}</p>
                  <p className="text-slate-600">{doc.shipper.name}</p>
                  {doc.shipper.address.map((l) => (
                    <p key={l} className="text-slate-600">{l}</p>
                  ))}
                </div>
                <div>
                  <p className="mb-1 font-semibold text-slate-800">{doc.consigneeLabel}</p>
                  <p><Highlight>{doc.consignee.name}</Highlight></p>
                  {doc.consignee.address.map((l) => (
                    <p key={l}><Highlight>{l}</Highlight></p>
                  ))}
                </div>
              </div>

              <table className="w-full border-t border-slate-200 text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-2 font-medium">{doc.tableHeaders.description}</th>
                    <th className="py-2 font-medium">{doc.tableHeaders.hsCode}</th>
                    <th className="py-2 text-right font-medium">{doc.tableHeaders.quantity}</th>
                    <th className="py-2 text-right font-medium">{doc.tableHeaders.unitPrice}</th>
                    <th className="py-2 text-right font-medium">{doc.tableHeaders.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((it) => (
                    <tr key={it.description} className="border-t border-slate-100">
                      <td className="py-2">{it.description}</td>
                      <td className="py-2"><Highlight>{it.hsCode}</Highlight></td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">{it.unitPrice}</td>
                      <td className="py-2 text-right">{it.totalValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <span className="font-semibold text-slate-800">{doc.termsLabel}: </span>
                <Highlight>{doc.termsOfSale}</Highlight>
              </div>

              <p className="mt-6 text-[11px] italic leading-relaxed text-slate-400">
                {doc.disclaimer}
              </p>
            </div>
          </div>
        </Card>

        <Card className="h-fit p-6">
          <div className="mb-3 flex items-center gap-2 text-brand-600">
            <Icon name="sparkle" className="h-5 w-5" />
            <h3 className="text-base font-bold text-slate-900">{dp.aiFillingComplete.title}</h3>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            {dp.aiFillingComplete.description}
          </p>

          <ul className="mb-5 space-y-2.5">
            {dp.aiFillingComplete.checklist.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-slate-700">
                <Icon name="checkCircle" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {c}
              </li>
            ))}
          </ul>

          <div className="mb-5 rounded-lg bg-brand-50 p-3 text-xs leading-relaxed text-brand-800">
            {dp.aiFillingComplete.warning}
          </div>

          <div className="space-y-2.5">
            <Button className="w-full py-3">
              <Icon name="arrowRight" className="h-4 w-4" />
              {dp.actions.submit}
            </Button>
            <Button variant="secondary" className="w-full py-3">
              {dp.actions.edit}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
