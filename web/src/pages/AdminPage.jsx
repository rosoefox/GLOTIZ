import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { brand, adminPanel as ap } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const FIELD_TYPE_OPTIONS = ["text", "number", "date", "select", "checkbox", "textarea", "long_text"];

const STATUS_META = {
  approved: { label: ap.reviewStatusLabels.approved, tone: "success" },
  needs_revision: { label: ap.reviewStatusLabels.needsRevision, tone: "warning" },
  reviewing: { label: ap.reviewStatusLabels.reviewing, tone: "neutral" },
  not_submitted: { label: ap.reviewStatusLabels.notSubmitted, tone: "neutral" },
};

const COMPANY_NAME_KEYS = ["company_name_kr", "company_name"];

function SubmissionDetailModal({ submission, templateName, onClose }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: fieldRows }, { data: valueRows }] = await Promise.all([
        supabase.from("template_fields").select("*").eq("template_id", submission.template_id),
        supabase.from("submission_values").select("*").eq("submission_id", submission.id),
      ]);
      setFields(fieldRows || []);
      const byFieldId = Object.fromEntries((valueRows || []).map((v) => [v.field_id, v.value]));
      setValues(byFieldId);
      setLoading(false);
    }
    load();
  }, [submission.id, submission.template_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{templateName}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 입력 필드가 없습니다.</p>
        ) : (
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {fields.map((field) => (
              <div key={field.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="shrink-0 text-slate-500">{field.field_label}</dt>
                <dd className="text-right font-medium text-slate-900">{values[field.id] || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function ApplicantRow({ applicant, expanded, onToggle, onViewSubmission, onDownload, onNotify, notifying, notified }) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {applicant.name[0]}
          </div>
          <div>
            <p className="font-bold text-slate-900">{applicant.name}</p>
            <p className="text-xs text-slate-400">
              {ap.tableHeaders.program} {applicant.programs.length}건 · {ap.tableHeaders.documents}{" "}
              {applicant.submissions.length}건
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={applicant.percent === 100 ? "success" : "brand"}>
            {ap.percentLabel} {applicant.percent}%
          </Badge>
          <span className="text-xs text-slate-400">
            {ap.tableHeaders.lastUpdated} {applicant.lastUpdated}
          </span>
          <Icon
            name="chevronDown"
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4">
          {applicant.programs.map((program) => (
            <div key={program.businessId} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">{program.businessName}</p>
                <span className="text-xs font-medium text-slate-400">
                  {ap.percentLabel} {program.percent}%
                </span>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {program.items.map((item) => {
                  const meta = STATUS_META[item.statusKey];
                  const key = item.submission ? item.submission.id : `${applicant.userId}:${item.templateId}`;
                  const canNotify = item.statusKey === "not_submitted" || item.statusKey === "needs_revision";
                  return (
                    <div key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.templateName}</p>
                        {item.submission && (
                          <p className="text-xs text-slate-400">
                            {new Date(item.submission.created_at).toLocaleString("ko-KR")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {item.submission && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => onViewSubmission(item)}
                          >
                            <Icon name="eye" className="h-3.5 w-3.5" />
                            {ap.viewDocumentLabel}
                          </Button>
                        )}
                        {item.generatedPath && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => onDownload(item.generatedPath)}
                          >
                            <Icon name="download" className="h-3.5 w-3.5" />
                            {ap.downloadLabel}
                          </Button>
                        )}
                        {canNotify && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            disabled={notifying[key] || notified[key]}
                            onClick={() => onNotify(applicant, item)}
                          >
                            <Icon name="send" className="h-3.5 w-3.5" />
                            {notified[key] ? ap.notifiedLabel : ap.notifyLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NewBusinessModal({ session, onClose, onCreated }) {
  const bf = ap.businessManager.businessForm;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "사업 등록에 실패했습니다.");
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{bf.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <TextField
            label={bf.nameLabel}
            required
            placeholder={bf.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{bf.descriptionLabel}</span>
            <textarea
              rows={4}
              placeholder={bf.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? "등록 중..." : bf.submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}

function NewTemplateModal({ session, business, onClose, onCreated }) {
  const tf = ap.businessManager.templateForm;
  const [name, setName] = useState("");
  const [formNumber, setFormNumber] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("DOCX 파일을 선택해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("business_id", business.id);
      form.append("name", name);
      form.append("form_number", formNumber);
      form.append("file", file);
      const res = await fetch(`${BACKEND_URL}/admin/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "서류 양식 업로드에 실패했습니다.");
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {tf.title} · {business.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <TextField
            label={tf.nameLabel}
            required
            placeholder={tf.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label={tf.formNumberLabel}
            placeholder={tf.formNumberPlaceholder}
            value={formNumber}
            onChange={(e) => setFormNumber(e.target.value)}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{tf.fileLabel}</span>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-600"
            />
          </label>
          <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">{tf.docxHint}</p>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? "업로드 중..." : tf.submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}

function NewFieldsModal({ session, template, onClose, onSaved }) {
  const ff = ap.businessManager.fieldsForm;
  const [rows, setRows] = useState([{ field_key: "", field_label: "", field_type: "text", options: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addRow = () => setRows((r) => [...r, { field_key: "", field_label: "", field_type: "text", options: "" }]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fields = rows.map((r) => ({
        field_key: r.field_key.trim(),
        field_label: r.field_label,
        field_type: r.field_type,
        options:
          (r.field_type === "select" || r.field_type === "checkbox") && r.options.trim()
            ? r.options.split(",").map((s) => s.trim()).filter(Boolean)
            : null,
      }));
      const res = await fetch(`${BACKEND_URL}/admin/templates/${template.id}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "필드 추가에 실패했습니다.");
      onSaved(data.fields);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {ff.title} · {template.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    placeholder={ff.fieldKeyPlaceholder}
                    value={row.field_key}
                    onChange={(e) => updateRow(i, { field_key: e.target.value })}
                  />
                  <TextField
                    placeholder={ff.fieldLabelPlaceholder}
                    value={row.field_label}
                    onChange={(e) => updateRow(i, { field_label: e.target.value })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    value={row.field_type}
                    onChange={(e) => updateRow(i, { field_type: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {FIELD_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {ff.fieldTypeLabels[t]}
                      </option>
                    ))}
                  </select>
                  {(row.field_type === "select" || row.field_type === "checkbox") && (
                    <TextField
                      placeholder={ff.optionsPlaceholder}
                      value={row.options}
                      onChange={(e) => updateRow(i, { options: e.target.value })}
                    />
                  )}
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="mt-2 text-xs font-medium text-red-500 hover:underline"
                  >
                    {ff.removeRowLabel}
                  </button>
                )}
              </div>
            ))}
          </div>

          <Button type="button" variant="secondary" className="mt-3 px-3 py-2 text-xs" onClick={addRow}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            {ff.addRowLabel}
          </Button>

          {error && <p className="mt-3 text-xs font-medium text-red-500">{error}</p>}

          <Button type="submit" className="mt-5 w-full justify-center" disabled={saving}>
            {saving ? "저장 중..." : ff.submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}

function BusinessManager({ session }) {
  const bm = ap.businessManager;
  const [businesses, setBusinesses] = useState([]);
  const [templatesByBusiness, setTemplatesByBusiness] = useState({});
  const [loadingBM, setLoadingBM] = useState(true);
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [templateModalBusiness, setTemplateModalBusiness] = useState(null);
  const [fieldsModalTemplate, setFieldsModalTemplate] = useState(null);

  async function loadBusinessManager() {
    setLoadingBM(true);
    const [{ data: biz }, { data: tpl }] = await Promise.all([
      supabase.from("businesses").select("*").order("created_at", { ascending: false }),
      supabase.from("templates").select("*").order("form_number"),
    ]);
    setBusinesses(biz || []);
    const grouped = {};
    for (const t of tpl || []) (grouped[t.business_id] ??= []).push(t);
    setTemplatesByBusiness(grouped);
    setLoadingBM(false);
  }

  useEffect(() => {
    loadBusinessManager();
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowBusinessModal(true)}>
          <Icon name="plus" className="h-4 w-4" />
          {bm.newBusinessButtonLabel}
        </Button>
      </div>

      {loadingBM ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : businesses.length === 0 ? (
        <p className="text-sm text-slate-400">{bm.businessListEmptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {businesses.map((biz) => {
            const templates = templatesByBusiness[biz.id] || [];
            return (
              <Card key={biz.id} className="p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-900">{biz.name}</p>
                    {biz.description && <p className="mt-1 text-sm text-slate-500">{biz.description}</p>}
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0 px-3 py-1.5 text-xs"
                    onClick={() => setTemplateModalBusiness(biz)}
                  >
                    <Icon name="upload" className="h-3.5 w-3.5" />
                    {bm.uploadTemplateButtonLabel}
                  </Button>
                </div>

                {templates.length === 0 ? (
                  <p className="text-xs text-slate-400">{bm.templateListEmptyMessage}</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                          {t.form_number && <p className="text-xs text-slate-400">서식 번호 {t.form_number}</p>}
                        </div>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setFieldsModalTemplate(t)}
                        >
                          {bm.addFieldsButtonLabel}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showBusinessModal && (
        <NewBusinessModal session={session} onClose={() => setShowBusinessModal(false)} onCreated={loadBusinessManager} />
      )}
      {templateModalBusiness && (
        <NewTemplateModal
          session={session}
          business={templateModalBusiness}
          onClose={() => setTemplateModalBusiness(null)}
          onCreated={loadBusinessManager}
        />
      )}
      {fieldsModalTemplate && (
        <NewFieldsModal
          session={session}
          template={fieldsModalTemplate}
          onClose={() => setFieldsModalTemplate(null)}
          onSaved={loadBusinessManager}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const [activeTab, setActiveTab] = useState("submissions");
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const [notifying, setNotifying] = useState({});
  const [notified, setNotified] = useState({});

  async function load() {
    setLoading(true);

    const [{ data: businesses }, { data: templates }, { data: submissions }, { data: generatedDocs }] =
      await Promise.all([
        supabase.from("businesses").select("id,name"),
        supabase.from("templates").select("id,name,business_id"),
        supabase.from("submissions").select("*").order("created_at", { ascending: false }),
        supabase.from("generated_documents").select("submission_id,file_path"),
      ]);

    const businessNameById = Object.fromEntries((businesses || []).map((b) => [b.id, b.name]));
    const templateById = Object.fromEntries((templates || []).map((t) => [t.id, t]));
    const templatesByBusiness = {};
    for (const t of templates || []) {
      (templatesByBusiness[t.business_id] ??= []).push(t);
    }
    const generatedPathBySubmission = Object.fromEntries(
      (generatedDocs || []).map((g) => [g.submission_id, g.file_path])
    );

    let companyNameBySubmission = {};
    const companyFieldRes = await supabase
      .from("template_fields")
      .select("id")
      .in("field_key", COMPANY_NAME_KEYS);
    const companyFieldIds = (companyFieldRes.data || []).map((f) => f.id);
    if (companyFieldIds.length) {
      const { data: companyValues } = await supabase
        .from("submission_values")
        .select("submission_id,value")
        .in("field_id", companyFieldIds);
      companyNameBySubmission = Object.fromEntries(
        (companyValues || []).filter((v) => v.value).map((v) => [v.submission_id, v.value])
      );
    }

    const byUser = {};
    for (const submission of submissions || []) {
      const template = templateById[submission.template_id];
      if (!template) continue;
      const uid = submission.user_id;
      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          name: companyNameBySubmission[submission.id] || null,
          submissions: [],
          byBusiness: {},
          lastUpdated: submission.created_at,
        };
      }
      const bucket = byUser[uid];
      if (!bucket.name && companyNameBySubmission[submission.id]) {
        bucket.name = companyNameBySubmission[submission.id];
      }
      bucket.submissions.push(submission);
      if (submission.created_at > bucket.lastUpdated) bucket.lastUpdated = submission.created_at;

      const businessId = template.business_id;
      if (!bucket.byBusiness[businessId]) {
        bucket.byBusiness[businessId] = {
          businessId,
          businessName: businessNameById[businessId] || "알 수 없는 공고",
          items: [],
        };
      }
      const statusKey =
        submission.review_status === "approved"
          ? "approved"
          : submission.review_status === "needs_revision"
            ? "needs_revision"
            : "reviewing";
      bucket.byBusiness[businessId].items.push({
        submission,
        templateId: template.id,
        templateName: template.name,
        statusKey,
        generatedPath: generatedPathBySubmission[submission.id] || null,
      });
    }

    for (const bucket of Object.values(byUser)) {
      for (const program of Object.values(bucket.byBusiness)) {
        const submittedTemplateIds = new Set(program.items.map((i) => i.templateId));
        const allTemplates = templatesByBusiness[program.businessId] || [];
        for (const t of allTemplates) {
          if (!submittedTemplateIds.has(t.id)) {
            program.items.push({
              submission: null,
              templateId: t.id,
              templateName: t.name,
              statusKey: "not_submitted",
              generatedPath: null,
            });
          }
        }
        program.totalTemplates = allTemplates.length;
        program.submittedCount = submittedTemplateIds.size;
        program.percent = allTemplates.length
          ? Math.round((submittedTemplateIds.size / allTemplates.length) * 100)
          : 0;
      }
    }

    const list = Object.values(byUser)
      .map((bucket) => {
        const programs = Object.values(bucket.byBusiness);
        const totalTemplates = programs.reduce((s, p) => s + p.totalTemplates, 0);
        const totalSubmitted = programs.reduce((s, p) => s + p.submittedCount, 0);
        return {
          userId: bucket.userId,
          name: bucket.name || `${ap.applicantFallbackName} (${bucket.userId.slice(0, 8)})`,
          submissions: bucket.submissions,
          programs,
          percent: totalTemplates ? Math.round((totalSubmitted / totalTemplates) * 100) : 0,
          lastUpdated: new Date(bucket.lastUpdated).toLocaleDateString("ko-KR"),
        };
      })
      .sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));

    setApplicants(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-submissions-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const summary = useMemo(() => {
    const submissionCount = applicants.reduce((sum, a) => sum + a.submissions.length, 0);
    const completedCount = applicants.reduce(
      (sum, a) => sum + a.submissions.filter((s) => s.status === "generated").length,
      0
    );
    return { applicants: applicants.length, submissions: submissionCount, completed: completedCount };
  }, [applicants]);

  const handleDownload = async (filePath) => {
    const { data, error } = await supabase.storage.from("generated").createSignedUrl(filePath, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleNotify = async (applicant, item) => {
    const key = item.submission ? item.submission.id : `${applicant.userId}:${item.templateId}`;
    if (notifying[key] || notified[key]) return;
    setNotifying((prev) => ({ ...prev, [key]: true }));

    const type = item.statusKey === "not_submitted" ? "not_submitted" : "needs_revision";
    const message =
      type === "not_submitted"
        ? `[${item.templateName}] 서류가 아직 제출되지 않았습니다. 확인 후 제출해주세요.`
        : `[${item.templateName}] 제출하신 서류에 보완이 필요합니다.${
            item.submission?.review_note ? ` (${item.submission.review_note})` : ""
          }`;

    const { error } = await supabase.from("notifications").insert({
      user_id: applicant.userId,
      submission_id: item.submission?.id ?? null,
      template_id: item.templateId,
      type,
      message,
    });

    setNotifying((prev) => ({ ...prev, [key]: false }));
    if (!error) setNotified((prev) => ({ ...prev, [key]: true }));
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link to="/admin" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Icon name="building" className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-900">{brand.name} · 관리자</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          로그아웃
        </button>
      </header>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-900">{ap.title}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">{ap.subtitle}</p>

        <div className="mb-6 inline-flex gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("submissions")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "submissions" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {ap.tabs.submissions}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("businesses")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "businesses" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {ap.tabs.businesses}
          </button>
        </div>

        {activeTab === "businesses" ? (
          <BusinessManager session={session} />
        ) : (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="text-sm text-slate-500">{ap.summaryLabels.applicants}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-700">{summary.applicants}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-slate-500">{ap.summaryLabels.submissions}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-700">{summary.submissions}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-slate-500">{ap.summaryLabels.completed}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-700">{summary.completed}</p>
              </Card>
            </div>

            {loading ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : applicants.length === 0 ? (
              <p className="text-sm text-slate-400">{ap.emptyMessage}</p>
            ) : (
              <div className="space-y-3">
                {applicants.map((applicant) => (
                  <ApplicantRow
                    key={applicant.userId}
                    applicant={applicant}
                    expanded={expandedId === applicant.userId}
                    onToggle={() => setExpandedId((id) => (id === applicant.userId ? null : applicant.userId))}
                    onViewSubmission={(item) =>
                      setViewingSubmission({ submission: item.submission, templateName: item.templateName })
                    }
                    onDownload={handleDownload}
                    onNotify={handleNotify}
                    notifying={notifying}
                    notified={notified}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {viewingSubmission && (
        <SubmissionDetailModal
          submission={viewingSubmission.submission}
          templateName={viewingSubmission.templateName}
          onClose={() => setViewingSubmission(null)}
        />
      )}
    </div>
  );
}
