import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { brand, adminPanel as ap } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";

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

function SubmissionRow({
  item,
  isHistory,
  applicantUserId,
  onViewSubmission,
  onDownload,
  onNotify,
  onSetReviewStatus,
  applicant,
  notifying,
  notified,
}) {
  const meta = STATUS_META[item.statusKey];
  const key = item.submission ? item.submission.id : `${applicantUserId}:${item.templateId}`;
  const canNotify = item.statusKey === "not_submitted" || item.statusKey === "needs_revision";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isHistory ? "bg-slate-50" : ""}`}>
      <div>
        <p className={`text-sm ${isHistory ? "text-slate-600" : "font-semibold text-slate-900"}`}>
          {isHistory ? "이전 제출" : item.templateName}
        </p>
        {item.submission && (
          <p className="text-xs text-slate-400">{new Date(item.submission.created_at).toLocaleString("ko-KR")}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {item.submission && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onViewSubmission(item)}>
            <Icon name="eye" className="h-3.5 w-3.5" />
            {ap.viewDocumentLabel}
          </Button>
        )}
        {item.generatedPath && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onDownload(item.generatedPath)}>
            <Icon name="download" className="h-3.5 w-3.5" />
            {ap.downloadLabel}
          </Button>
        )}
        {!isHistory && item.submission && item.statusKey !== "needs_revision" && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50"
            onClick={() => onSetReviewStatus(item, "needs_revision")}
          >
            {ap.markNeedsRevisionLabel}
          </Button>
        )}
        {!isHistory && item.submission && item.statusKey !== "approved" && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs text-emerald-600 hover:bg-emerald-50"
            onClick={() => onSetReviewStatus(item, "approved")}
          >
            {ap.markApprovedLabel}
          </Button>
        )}
        {!isHistory && canNotify && (
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
}

function SubmissionItem({ item, applicant, onViewSubmission, onDownload, onNotify, onSetReviewStatus, notifying, notified }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div>
      <SubmissionRow
        item={item}
        applicantUserId={applicant.userId}
        applicant={applicant}
        onViewSubmission={onViewSubmission}
        onDownload={onDownload}
        onNotify={onNotify}
        onSetReviewStatus={onSetReviewStatus}
        notifying={notifying}
        notified={notified}
      />
      {item.history.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand-600 hover:bg-slate-50"
          >
            <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            이전 제출 {item.history.length}건 {showHistory ? "숨기기" : "보기"}
          </button>
          {showHistory &&
            item.history.map((h) => (
              <div key={h.submission.id} className="border-t border-slate-100">
                <SubmissionRow
                  item={h}
                  isHistory
                  applicantUserId={applicant.userId}
                  applicant={applicant}
                  onViewSubmission={onViewSubmission}
                  onDownload={onDownload}
                  onNotify={onNotify}
                  notifying={notifying}
                  notified={notified}
                />
              </div>
            ))}
        </>
      )}
    </div>
  );
}

function ApplicantRow({
  applicant,
  expanded,
  onToggle,
  onViewSubmission,
  onDownload,
  onNotify,
  onSetReviewStatus,
  notifying,
  notified,
}) {
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
                {program.items.map((item) => (
                  <SubmissionItem
                    key={item.submission ? item.submission.id : `${applicant.userId}:${item.templateId}`}
                    item={item}
                    applicant={applicant}
                    onViewSubmission={onViewSubmission}
                    onDownload={onDownload}
                    onNotify={onNotify}
                    onSetReviewStatus={onSetReviewStatus}
                    notifying={notifying}
                    notified={notified}
                  />
                ))}
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
      if (!res.ok) throw new Error(await readErrorMessage(res, "사업 등록에 실패했습니다."));
      const data = await res.json();
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
  const [userUploadRequired, setUserUploadRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userUploadRequired && !file) {
      setError("DOCX 파일을 선택해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("business_id", business.id);
      form.append("name", name);
      form.append("user_upload_required", userUploadRequired ? "true" : "false");
      if (!userUploadRequired) {
        form.append("form_number", formNumber);
        form.append("file", file);
      }
      const res = await fetch(`${BACKEND_URL}/admin/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "서류 양식 업로드에 실패했습니다."));
      const data = await res.json();
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
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={userUploadRequired}
              onChange={(e) => setUserUploadRequired(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-100"
            />
            <span className="text-sm font-medium text-slate-700">{tf.userUploadCheckboxLabel}</span>
          </label>
          {userUploadRequired ? (
            <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
              {tf.userUploadHint}
            </p>
          ) : (
            <>
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
              <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
                {tf.docxHint}
              </p>
            </>
          )}
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? "업로드 중..." : tf.submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}

function EditTemplateModal({ session, template, onClose, onUpdated }) {
  const ef = ap.businessManager.editTemplateForm;
  const [name, setName] = useState(template.name || "");
  const [formNumber, setFormNumber] = useState(template.form_number || "");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("form_number", formNumber);
      if (file) form.append("file", file);
      const res = await fetch(`${BACKEND_URL}/admin/templates/${template.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "서류 양식 수정에 실패했습니다."));
      const data = await res.json();
      onUpdated(data);
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
          <h2 className="text-lg font-bold text-slate-900">{ef.title}</h2>
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
            label={ef.nameLabel}
            required
            placeholder={ef.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label={ef.formNumberLabel}
            placeholder={ef.formNumberPlaceholder}
            value={formNumber}
            onChange={(e) => setFormNumber(e.target.value)}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{ef.fileLabel}</span>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-600"
            />
          </label>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? "저장 중..." : ef.submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}

const EMPTY_FIELD_ROW = { field_key: "", field_label: "", field_type: "text", options: "" };

function NewFieldsModal({ session, template, onClose, onSaved }) {
  const ff = ap.businessManager.fieldsForm;
  const [rows, setRows] = useState([EMPTY_FIELD_ROW]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    fetch(`${BACKEND_URL}/admin/templates/${template.id}/suggest-fields`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        const suggested = (data.fields || []).map((f) => ({
          field_key: f.field_key,
          field_label: f.field_label,
          field_type: f.field_type,
          options: (f.options || []).join(", "),
        }));
        if (suggested.length) setRows(suggested);
      })
      .catch(() => {
        // AI 제안을 못 가져와도 빈 줄 1개로 시작해서 수동 입력은 계속 가능하게 둔다.
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [template.id, session.access_token]);

  const addRow = () => setRows((r) => [...r, EMPTY_FIELD_ROW]);
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
      if (!res.ok) throw new Error(await readErrorMessage(res, "필드 추가에 실패했습니다."));
      const data = await res.json();
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

        {loadingSuggestions && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-brand-600">
            <Icon name="sparkle" className="h-3.5 w-3.5" />
            AI가 서식을 분석해서 필드를 제안하는 중...
          </p>
        )}

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

          <Button type="submit" className="mt-5 w-full justify-center" disabled={saving || loadingSuggestions}>
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
  const [editTemplateTarget, setEditTemplateTarget] = useState(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState(null);
  const [deletingBusinessId, setDeletingBusinessId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editingBusinessId, setEditingBusinessId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);

  const startEditBusinessName = (biz) => {
    setNameError(null);
    setEditingBusinessId(biz.id);
    setEditingName(biz.name);
  };

  const cancelEditBusinessName = () => {
    setEditingBusinessId(null);
    setEditingName("");
  };

  const saveBusinessName = async (biz) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === biz.name) {
      cancelEditBusinessName();
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/businesses/${biz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "사업명 수정에 실패했습니다."));
      await loadBusinessManager();
      cancelEditBusinessName();
    } catch (err) {
      setNameError(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteBusiness = async (biz) => {
    if (
      !window.confirm(
        `"${biz.name}"을(를) 삭제할까요?\n서식, 제출된 신청서, 생성된 문서까지 전부 함께 삭제되며 되돌릴 수 없습니다.`
      )
    )
      return;
    setDeletingBusinessId(biz.id);
    setActionError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/businesses/${biz.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "사업 삭제에 실패했습니다."));
      await loadBusinessManager();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingBusinessId(null);
    }
  };

  const handleDeleteTemplate = async (t) => {
    if (
      !window.confirm(
        `"${t.name}" 서식을 삭제할까요?\n이 서식으로 제출된 신청서와 생성된 문서도 함께 삭제되며 되돌릴 수 없습니다.`
      )
    )
      return;
    setDeletingTemplateId(t.id);
    setActionError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/templates/${t.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "서식 삭제에 실패했습니다."));
      await loadBusinessManager();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingTemplateId(null);
    }
  };

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
      <div className="mb-4 flex items-center justify-between gap-4">
        {actionError ? <p className="text-xs font-medium text-red-500">{actionError}</p> : <span />}
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
                    {editingBusinessId === biz.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveBusinessName(biz);
                            if (e.key === "Escape") cancelEditBusinessName();
                          }}
                          disabled={savingName}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-bold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          type="button"
                          onClick={() => saveBusinessName(biz)}
                          disabled={savingName}
                          aria-label="저장"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-brand-600 hover:bg-brand-50"
                        >
                          <Icon name="check" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditBusinessName}
                          disabled={savingName}
                          aria-label="취소"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900">{biz.name}</p>
                        <button
                          type="button"
                          onClick={() => startEditBusinessName(biz)}
                          aria-label="사업명 수정"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Icon name="pencil" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {editingBusinessId === biz.id && nameError && (
                      <p className="mt-1 text-xs font-medium text-red-500">{nameError}</p>
                    )}
                    {biz.description && <p className="mt-1 text-sm text-slate-500">{biz.description}</p>}
                    {biz.basic_info && (
                      <Badge tone="success" className="mt-2">
                        <Icon name="checkCircle" className="h-3 w-3" /> 기본 정보 완료
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setTemplateModalBusiness(biz)}
                    >
                      <Icon name="upload" className="h-3.5 w-3.5" />
                      {bm.uploadTemplateButtonLabel}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                      disabled={deletingBusinessId === biz.id}
                      onClick={() => handleDeleteBusiness(biz)}
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                      {deletingBusinessId === biz.id ? "삭제 중..." : "사업 삭제"}
                    </Button>
                  </div>
                </div>

                {templates.length === 0 ? (
                  <p className="text-xs text-slate-400">{bm.templateListEmptyMessage}</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                          {t.user_upload_required ? (
                            <Badge tone="brand" className="mt-1">
                              {bm.userUploadBadgeLabel}
                            </Badge>
                          ) : (
                            t.form_number && <p className="text-xs text-slate-400">서식 번호 {t.form_number}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => setEditTemplateTarget(t)}
                          >
                            {bm.editTemplateButtonLabel}
                          </Button>
                          {!t.user_upload_required && (
                            <Button
                              variant="secondary"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => setFieldsModalTemplate(t)}
                            >
                              {bm.addFieldsButtonLabel}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                            disabled={deletingTemplateId === t.id}
                            onClick={() => handleDeleteTemplate(t)}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                            {deletingTemplateId === t.id ? "삭제 중..." : bm.deleteTemplateButtonLabel}
                          </Button>
                        </div>
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
      {editTemplateTarget && (
        <EditTemplateModal
          session={session}
          template={editTemplateTarget}
          onClose={() => setEditTemplateTarget(null)}
          onUpdated={loadBusinessManager}
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
  const [reviewStatusError, setReviewStatusError] = useState(null);

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
        // 같은 템플릿에 여러 번 제출한 경우, 최신 제출만 대표로 남기고 나머지는
        // history로 묶어서 드롭다운으로 펼쳐볼 수 있게 한다.
        const byTemplate = new Map();
        for (const item of program.items) {
          const list = byTemplate.get(item.templateId) || [];
          list.push(item);
          byTemplate.set(item.templateId, list);
        }
        program.items = Array.from(byTemplate.values()).map((list) => {
          list.sort((a, b) => new Date(b.submission.created_at) - new Date(a.submission.created_at));
          const [latest, ...history] = list;
          return { ...latest, history };
        });

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
              history: [],
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
    const programCount = applicants.reduce((sum, a) => sum + a.programs.length, 0);
    const completedCount = applicants.reduce(
      (sum, a) => sum + a.submissions.filter((s) => s.status === "generated").length,
      0
    );
    return { applicants: applicants.length, programs: programCount, completed: completedCount };
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

  const handleSetReviewStatus = async (item, reviewStatus) => {
    if (!item.submission) return;
    setReviewStatusError(null);
    const { error } = await supabase
      .from("submissions")
      .update({ review_status: reviewStatus, reviewed_at: new Date().toISOString() })
      .eq("id", item.submission.id);
    if (error) {
      setReviewStatusError(error.message);
      return;
    }
    await load();
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
                <p className="text-sm text-slate-500">{ap.summaryLabels.programs}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-700">{summary.programs}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-slate-500">{ap.summaryLabels.completed}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-700">{summary.completed}</p>
              </Card>
            </div>

            {reviewStatusError && (
              <p className="mb-3 text-xs font-medium text-red-500">{reviewStatusError}</p>
            )}

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
                    onSetReviewStatus={handleSetReviewStatus}
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
