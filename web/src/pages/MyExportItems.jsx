import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { myExportItems as mi, exportDocumentForm as f } from "../data/mockData";
import { useExportItems } from "../context/ExportItemsContext";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";

const PROGRESS_STATUS_STYLES = {
  not_submitted: "border-slate-200 bg-slate-50 text-slate-500",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_revision: "border-red-200 bg-red-50 text-red-700",
};

function ProgramMultiSelect({ businesses, selected, onToggle }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <span className={selected.length ? "text-slate-900" : "text-slate-400"}>
          {selected.length ? `${selected.length}개 선택됨` : "지원사업 공고를 선택하세요"}
        </span>
        <Icon
          name="chevronDown"
          className={`w-5 h-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {businesses.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">등록된 지원사업이 없습니다.</p>
          ) : (
            businesses.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(b.id)}
                  onChange={() => onToggle(b.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {b.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BasicInfoForm({ item, businesses, onSave, onCancel }) {
  const [name, setName] = useState(item?.name ?? "");
  const [destination, setDestination] = useState(item?.destination ?? f.destinationCountryOptions[0]);
  const [govPrograms, setGovPrograms] = useState(item?.govPrograms ?? []);

  const toggleProgram = (businessId) => {
    setGovPrograms((prev) =>
      prev.includes(businessId) ? prev.filter((p) => p !== businessId) : [...prev, businessId]
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
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{mi.programsLabel}</span>
          <ProgramMultiSelect businesses={businesses} selected={govPrograms} onToggle={toggleProgram} />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2 text-sm" onClick={onCancel}>
          취소
        </Button>
        <Button className="px-4 py-2 text-sm" onClick={() => onSave({ name, destination, govPrograms })}>
          <Icon name="check" className="w-5 h-5" />
          저장
        </Button>
      </div>
    </div>
  );
}

function ProgressPanel({ businessId, token }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [subsByTemplate, setSubsByTemplate] = useState({});
  const [fieldCountByTemplate, setFieldCountByTemplate] = useState({});
  const [filledCountBySubmission, setFilledCountBySubmission] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { templates: tpls } = await api.get(`/templates?business_id=${businessId}&order_by=form_number`);
      const templateIds = (tpls || []).map((t) => t.id);

      let subs = {};
      let fieldCountByTemplate = {};
      let filledCountBySubmission = {};
      if (templateIds.length) {
        const [{ submissions }, { fields: allFields }] = await Promise.all([
          api.get(`/submissions?${idsParam("template_id", templateIds)}`, token),
          api.get(`/template_fields?${idsParam("template_id", templateIds)}`),
        ]);
        (submissions || []).forEach((s) => {
          if (!subs[s.template_id]) subs[s.template_id] = s;
        });
        (allFields || []).forEach((f) => {
          fieldCountByTemplate[f.template_id] = (fieldCountByTemplate[f.template_id] || 0) + 1;
        });

        const submissionIds = Object.values(subs).map((s) => s.id);
        if (submissionIds.length) {
          const { values: allValues } = await api.get(
            `/submission_values?${idsParam("submission_id", submissionIds)}`,
            token
          );
          (allValues || []).forEach((v) => {
            if (v.value) filledCountBySubmission[v.submission_id] = (filledCountBySubmission[v.submission_id] || 0) + 1;
          });
        }
      }
      if (!cancelled) {
        setTemplates(tpls || []);
        setSubsByTemplate(subs);
        setFieldCountByTemplate(fieldCountByTemplate);
        setFilledCountBySubmission(filledCountBySubmission);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId, token]);

  // 사용자 화면(DocumentChecklist)과 동일하게 "실제로 채워진 필드 수 / 전체 필드 수"로 계산한다 —
  // 서류를 제출만 하면 무조건 100%로 표시되던 것과 달리, 실제 작성 진행도를 반영한다.
  const totalFields = templates.reduce((sum, t) => sum + (fieldCountByTemplate[t.id] || 0), 0);
  const filledFields = templates.reduce((sum, t) => {
    const sub = subsByTemplate[t.id];
    return sum + (sub ? filledCountBySubmission[sub.id] || 0 : 0);
  }, 0);
  const total = templates.length;
  const percent = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5">
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : total === 0 ? (
        <p className="text-sm text-slate-400">{mi.progressEmptyMessage}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">{mi.progressTitle}</p>
            <span className="text-xl font-extrabold text-brand-700">{percent}%</span>
          </div>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
          </div>

          <div className="space-y-2">
            {templates.map((t) => {
              const sub = subsByTemplate[t.id];
              const statusKey = !sub
                ? "not_submitted"
                : sub.review_status === "approved"
                  ? "approved"
                  : sub.review_status === "needs_revision"
                    ? "needs_revision"
                    : "pending";
              return (
                <div
                  key={t.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${PROGRESS_STATUS_STYLES[statusKey]}`}
                >
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs font-bold">
                    {mi.progressStatusLabels[statusKey]}
                    {statusKey === "needs_revision" && sub?.review_note ? ` · ${sub.review_note}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ProgramBlock({ business, token }) {
  const [showProgress, setShowProgress] = useState(false);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-bold leading-snug text-brand-800">
          {business ? business.name : "알 수 없는 공고"}
        </p>
        <Button
          variant="secondary"
          className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
          onClick={() => setShowProgress((v) => !v)}
        >
          {mi.actionLabel}
          <Icon name="chevronDown" className={`w-5 h-5 transition-transform ${showProgress ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {showProgress && business && <ProgressPanel businessId={business.id} token={token} />}
    </div>
  );
}

export default function MyExportItems() {
  const { user, session } = useAuth();
  const { items, addItem, updateItem } = useExportItems();
  const [expandedId, setExpandedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [revisionCount, setRevisionCount] = useState(0);

  useEffect(() => {
    api.get("/businesses").then(({ businesses }) => setBusinesses(businesses || []));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    api
      .get("/notifications?type=needs_revision&is_read=false&count_only=true", session?.access_token)
      .then(({ count }) => setRevisionCount(count || 0))
      .catch(() => {});
  }, [user?.id, session?.access_token]);

  const businessById = Object.fromEntries(businesses.map((b) => [b.id, b]));

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
          <Icon name="plus" className="w-5 h-5" />
          {mi.addButtonLabel}
        </Button>
      </div>

      {revisionCount > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <Icon name="bell" className="w-5 h-5" />
          {revisionCount}
          {mi.revisionBannerLabel}
        </div>
      )}

      {showNewForm && (
        <BasicInfoForm businesses={businesses} onSave={handleCreateNew} onCancel={() => setShowNewForm(false)} />
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
              </div>

              <div className="mt-4 space-y-3">
                {item.govPrograms.length === 0 ? (
                  <p className="text-sm text-slate-400">{mi.noProgramsMessage}</p>
                ) : (
                  item.govPrograms.map((businessId) => (
                    <ProgramBlock key={businessId} business={businessById[businessId]} token={session?.access_token} />
                  ))
                )}
              </div>

              {expanded && (
                <BasicInfoForm
                  item={item}
                  businesses={businesses}
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
