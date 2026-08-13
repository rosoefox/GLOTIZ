import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button, TextField } from "../components/ui";
import { exportDocumentForm as f, documentPreview as dp, user } from "../data/mockData";
import { DocumentPreviewContent } from "./DocumentPreview";

const PREVIOUS_INFO = {
  companyName: user.company,
  taxId: "123-45-67890",
  address: "전라북도 전주시 산업로 123",
  consigneeName: dp.document.consignee.name,
  destinationCountry: "미국",
  items: dp.document.items.map((it) => ({
    description: it.description,
    hsCode: it.hsCode,
    quantity: it.quantity,
  })),
};

function PreviewModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">문서 미리보기</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <DocumentPreviewContent onEdit={onClose} />
      </div>
    </div>
  );
}

export default function ExportDocumentForm() {
  const navigate = useNavigate();
  const [items, setItems] = useState([{ description: "", hsCode: "", quantity: "" }]);
  const [exporter, setExporter] = useState({
    companyName: f.sections.exporter.companyName.value,
    taxId: "",
    address: "",
  });
  const [consignee, setConsignee] = useState({
    consigneeName: "",
    destinationCountry: f.destinationCountryOptions[0],
  });
  const [showPreview, setShowPreview] = useState(false);

  const addItem = () => setItems((v) => [...v, { description: "", hsCode: "", quantity: "" }]);
  const removeItem = (idx) => setItems((v) => v.filter((_, i) => i !== idx));
  const updateItem = (idx, key, value) =>
    setItems((v) => v.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));

  const loadPrevious = () => {
    setExporter({
      companyName: PREVIOUS_INFO.companyName,
      taxId: PREVIOUS_INFO.taxId,
      address: PREVIOUS_INFO.address,
    });
    setConsignee({
      consigneeName: PREVIOUS_INFO.consigneeName,
      destinationCountry: PREVIOUS_INFO.destinationCountry,
    });
    setItems(PREVIOUS_INFO.items);
  };

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
              value={exporter.companyName}
              onChange={(e) => setExporter((s) => ({ ...s, companyName: e.target.value }))}
            />
            <TextField
              label={f.sections.exporter.taxId.label}
              required
              placeholder="000-00-00000"
              value={exporter.taxId}
              onChange={(e) => setExporter((s) => ({ ...s, taxId: e.target.value }))}
            />
          </div>
          <TextField
            label={f.sections.exporter.address.label}
            required
            className="mt-4"
            value={exporter.address}
            onChange={(e) => setExporter((s) => ({ ...s, address: e.target.value }))}
          />
        </section>

        <hr className="my-8 border-slate-100" />

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <Icon name="truck" className="h-5 w-5 text-brand-600" />
            {f.sections.consignee.title}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={f.sections.consignee.consigneeName.label}
              required
              value={consignee.consigneeName}
              onChange={(e) => setConsignee((s) => ({ ...s, consigneeName: e.target.value }))}
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {f.sections.consignee.destinationCountry.label} <span className="text-red-500">*</span>
              </span>
              <select
                value={consignee.destinationCountry}
                onChange={(e) => setConsignee((s) => ({ ...s, destinationCountry: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
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
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <TextField
                  label={f.sections.items.descriptionLabel}
                  value={item.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                />
                <TextField
                  label={f.sections.items.hsCodeLabel}
                  value={item.hsCode}
                  onChange={(e) => updateItem(idx, "hsCode", e.target.value)}
                />
                <TextField
                  label={f.sections.items.quantityLabel}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                />
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
          <Button variant="secondary" onClick={loadPrevious}>
            <Icon name="history" className="h-4 w-4" />
            {f.actions.loadPrevious}
          </Button>
          <Button variant="outlineBrand" onClick={() => navigate("/docs/preview")}>
            <Icon name="eye" className="h-4 w-4" />
            {f.actions.preview}
          </Button>
          <Button className="ml-auto" onClick={() => setShowPreview(true)}>
            {f.actions.generate}
            <Icon name="arrowRight" className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {showPreview && <PreviewModal onClose={() => setShowPreview(false)} />}
    </div>
  );
}
