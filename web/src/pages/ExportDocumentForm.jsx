import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button, TextField } from "../components/ui";
import { exportDocumentForm as f } from "../data/mockData";

export default function ExportDocumentForm() {
  const navigate = useNavigate();
  const [items, setItems] = useState([{ description: "", hsCode: "", quantity: "" }]);

  const addItem = () => setItems((v) => [...v, { description: "", hsCode: "", quantity: "" }]);
  const removeItem = (idx) => setItems((v) => v.filter((_, i) => i !== idx));

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{f.title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{f.subtitle}</p>

      <Card className="p-8">
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <Icon name="building" className="h-5 w-5 text-brand-600" />
            {f.sections.exporter.title}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={f.sections.exporter.companyName.label}
              required
              defaultValue={f.sections.exporter.companyName.value}
            />
            <TextField label={f.sections.exporter.taxId.label} required placeholder="000-00-00000" />
          </div>
          <TextField label={f.sections.exporter.address.label} required className="mt-4" />
        </section>

        <hr className="my-8 border-slate-100" />

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <Icon name="truck" className="h-5 w-5 text-brand-600" />
            {f.sections.consignee.title}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label={f.sections.consignee.consigneeName.label} required />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {f.sections.consignee.destinationCountry.label} <span className="text-red-500">*</span>
              </span>
              <select className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100">
                {f.destinationCountryOptions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <hr className="my-8 border-slate-100" />

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <Icon name="documents" className="h-5 w-5 text-brand-600" />
            {f.sections.items.title}
          </h2>

          <div className="space-y-3">
            {items.map((_, idx) => (
              <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <TextField label={f.sections.items.descriptionLabel} />
                <TextField label={f.sections.items.hsCodeLabel} />
                <TextField label={f.sections.items.quantityLabel} />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="flex items-center gap-1 pb-2.5 text-sm font-medium text-red-500 hover:text-red-600 sm:pb-2.5"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  {f.sections.items.removeLabel}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Icon name="plus" className="h-4 w-4" />
            {f.sections.items.addItemLabel}
          </button>
        </section>

        <hr className="my-8 border-slate-100" />

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary">
            <Icon name="history" className="h-4 w-4" />
            {f.actions.loadPrevious}
          </Button>
          <Button variant="outlineBrand">
            <Icon name="eye" className="h-4 w-4" />
            {f.actions.preview}
          </Button>
          <Button className="ml-auto" onClick={() => navigate("/docs/preview")}>
            {f.actions.generate}
            <Icon name="arrowRight" className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
