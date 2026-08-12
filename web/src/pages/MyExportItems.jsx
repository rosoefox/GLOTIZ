import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { myExportItems as mi, exportDocumentForm as f, documentChecklist as dc } from "../data/mockData";
import { useExportItems } from "../context/ExportItemsContext";

const PROGRAM_OPTIONS = dc.programGroups.map((g) => g.program);

function ProgramMultiSelect({ selected, onToggle }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <span className={selected.length ? "text-slate-900" : "text-slate-400"}>
          {selected.length ? `${selected.length}개 선택됨` : "지원사업을 선택하세요"}
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {PROGRAM_OPTIONS.map((program) => (
            <label
              key={program}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(program)}
                onChange={() => onToggle(program)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {program}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function BasicInfoForm({ item, onSave, onCancel }) {
  const [name, setName] = useState(item?.name ?? "");
  const [destination, setDestination] = useState(item?.destination ?? f.destinationCountryOptions[0]);
  const [govPrograms, setGovPrograms] = useState(item?.govPrograms ?? []);

  const toggleProgram = (program) => {
    setGovPrograms((prev) =>
      prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]
    );
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="품목 이름"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            {f.sections.consignee.destinationCountry.label} <span className="text-red-500">*</span>
          </span>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {f.destinationCountryOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">지원사업 선택</span>
          <ProgramMultiSelect selected={govPrograms} onToggle={toggleProgram} />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2 text-sm" onClick={onCancel}>
          취소
        </Button>
        <Button className="px-4 py-2 text-sm" onClick={() => onSave({ name, destination, govPrograms })}>
          <Icon name="check" className="h-4 w-4" />
          저장
        </Button>
      </div>
    </div>
  );
}

export default function MyExportItems() {
  const navigate = useNavigate();
  const { items, addItem, updateItem } = useExportItems();
  const [expandedId, setExpandedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const toggleExpand = (id) => {
    setShowNewForm(false);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const toggleNewForm = () => {
    setExpandedId(null);
    setShowNewForm((v) => !v);
  };

  const handleSaveExisting = (id, values) => {
    updateItem(id, values);
    setExpandedId(null);
  };

  const handleCreateNew = (values) => {
    addItem(values);
    setShowNewForm(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{mi.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{mi.subtitle}</p>
        </div>
        <Button onClick={toggleNewForm}>
          <Icon name="plus" className="h-4 w-4" />
          {mi.addButtonLabel}
        </Button>
      </div>

      {showNewForm && (
        <BasicInfoForm onSave={handleCreateNew} onCancel={() => setShowNewForm(false)} />
      )}

      <div className="mt-6 space-y-4">
        {items.map((item) => {
          const done = item.basicInfoDone;
          const expanded = expandedId === item.id;
          return (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p className="text-base font-bold text-slate-900">{item.name}</p>
                <span className="text-sm text-slate-500">{item.category}</span>
                <span className="text-sm text-slate-500">{item.destination}</span>
                <Badge tone={mi.statusTone[item.status]}>{mi.statusLabels[item.status]}</Badge>
                <span className="ml-auto text-xs text-slate-400">최근 업데이트 {item.updatedAt}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  className="whitespace-nowrap px-4 py-2.5 text-sm"
                  onClick={() => toggleExpand(item.id)}
                >
                  {mi.basicInfoButtonLabel}
                </Button>
                <Badge tone={done ? "success" : "neutral"}>
                  {done ? mi.basicInfoDoneLabel : mi.basicInfoPendingLabel}
                </Badge>

                {item.govPrograms.length > 0 && <span className="mx-1 h-5 w-px bg-slate-200" />}

                {item.govPrograms.map((program) => (
                  <span key={program} className="flex items-center gap-2">
                    <Badge tone="brand" className="whitespace-nowrap">
                      {program}
                    </Badge>
                    <Button
                      variant="secondary"
                      className="whitespace-nowrap px-3 py-1.5 text-xs"
                      onClick={() => navigate("/docs", { state: { program, itemName: item.name } })}
                    >
                      {mi.actionLabel}
                    </Button>
                  </span>
                ))}
              </div>

              {expanded && (
                <BasicInfoForm
                  item={item}
                  onSave={(values) => handleSaveExisting(item.id, values)}
                  onCancel={() => setExpandedId(null)}
                />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
