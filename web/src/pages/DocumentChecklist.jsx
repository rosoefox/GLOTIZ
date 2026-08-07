import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { documentChecklist as dc } from "../data/mockData";

const STATUS_META = {
  notStarted: { label: dc.notStartedLabel, tone: "neutral" },
  done: { label: dc.doneLabel, tone: "success" },
  manual: { label: dc.manualLabel, tone: "danger" },
};

function ChecklistGroup({ title, items, highlighted, relatedItem, relatedItemDestination }) {
  const navigate = useNavigate();
  const [statusMap, setStatusMap] = useState(() =>
    Object.fromEntries(items.map((it) => [it.id, "notStarted"]))
  );

  const autoFillAll = () => {
    setStatusMap((prev) => {
      const next = { ...prev };
      items.forEach((it) => {
        next[it.id] = it.autoResult;
      });
      return next;
    });
  };

  const autoFillOne = (item) => {
    setStatusMap((prev) => ({ ...prev, [item.id]: item.autoResult }));
  };

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {title}
            {highlighted && <Badge tone="brand">선택한 지원사업</Badge>}
          </h2>
          {relatedItem && (
            <p className="mt-1 text-xs text-slate-500">
              관련 품목: <span className="font-medium text-slate-700">{relatedItem}</span>
              {relatedItemDestination && ` · ${relatedItemDestination} 수출`}
            </p>
          )}
        </div>
        <Button variant="outlineBrand" className="px-3 py-1.5 text-xs" onClick={autoFillAll}>
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          {dc.autoFillAllLabel}
        </Button>
      </div>

      <Card className={highlighted ? "divide-y divide-slate-100 p-2 ring-2 ring-brand-400" : "divide-y divide-slate-100 p-2"}>
        {items.map((item) => {
          const status = statusMap[item.id];
          const meta = STATUS_META[status];
          const resolved = status !== "notStarted";
          return (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    status === "done" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Icon name={status === "done" ? "checkCircle" : "documents"} className="h-5 w-5" />
                </div>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {item.name}
                    {item.lang && (
                      <Badge tone="neutral" className="!px-1.5 !py-0.5 !text-[10px] font-bold tracking-wide">
                        {item.lang}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => autoFillOne(item)}
                  disabled={resolved}
                >
                  <Icon name="sparkle" className="h-3.5 w-3.5" />
                  {dc.autoFillLabel}
                </Button>
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => navigate("/docs/preview", { state: { docName: item.name } })}
                >
                  <Icon name="eye" className="h-3.5 w-3.5" />
                  미리보기
                </Button>
                {item.lang === "EN" && (
                  <button
                    onClick={() => navigate("/docs/translate", { state: { docName: item.name } })}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    번역된 서류입니다 · 원본 확인
                  </button>
                )}
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function ViewSelector({ groups, selected, onToggleGroup, onToggleAll }) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.size === groups.length;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        전체 서류 보기
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            전체 서류 보기
          </label>
          <div className="my-1 border-t border-slate-100" />
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => onToggleGroup(g.id)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {g.program ? `${g.program} 서류 보기` : "공통 서류 보기"}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentChecklist() {
  const location = useLocation();
  const activeProgram = location.state?.program ?? null;
  const activeItemName = location.state?.itemName ?? null;

  const allGroups = [dc.commonGroup, ...dc.programGroups];
  const matchedGroup = activeProgram
    ? dc.programGroups.find((g) => g.program === activeProgram)
    : null;

  const [selectedIds, setSelectedIds] = useState(() =>
    matchedGroup
      ? new Set([dc.commonGroup.id, matchedGroup.id])
      : new Set(allGroups.map((g) => g.id))
  );

  const toggleGroup = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === allGroups.length ? new Set() : new Set(allGroups.map((g) => g.id))
    );
  };

  const visibleGroups = allGroups.filter((g) => selectedIds.has(g.id));

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{dc.title}</h1>

      <div className="mt-1 mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        {activeItemName && (
          <>
            <span className="font-semibold text-slate-700">&ldquo;{activeItemName}&rdquo;</span>
            <span>·</span>
          </>
        )}
        <span>{dc.subtitle}</span>
        <ViewSelector
          groups={allGroups}
          selected={selectedIds}
          onToggleGroup={toggleGroup}
          onToggleAll={toggleAll}
        />
      </div>

      {visibleGroups.map((group) => (
        <ChecklistGroup
          key={group.id}
          title={group.title}
          items={group.items}
          highlighted={group.program === activeProgram}
          relatedItem={group.relatedItem}
          relatedItemDestination={group.relatedItemDestination}
        />
      ))}
    </div>
  );
}
