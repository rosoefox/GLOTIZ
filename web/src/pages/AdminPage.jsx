import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import Modal from "../components/Modal";
import { brand, adminPanel as ap } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";
import { orderedSelect } from "../lib/supabaseOrder";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const FIELD_TYPE_OPTIONS = ["text", "number", "date", "select", "checkbox", "textarea", "long_text"];

const STATUS_META = {
  approved: { label: ap.reviewStatusLabels.approved, tone: "success" },
  needs_revision: { label: ap.reviewStatusLabels.needsRevision, tone: "warning" },
  reviewing: { label: ap.reviewStatusLabels.reviewing, tone: "neutral" },
  not_submitted: { label: ap.reviewStatusLabels.notSubmitted, tone: "neutral" },
};

const COMPANY_NAME_KEYS = ["company_name_kr", "company_name"];

function SubmissionRow({
  item,
  isHistory,
  applicantUserId,
  onViewSubmission,
  onNotify,
  onSetReviewStatus,
  applicant,
  notifying,
  notified,
  downloadingId,
}) {
  const meta = STATUS_META[item.statusKey];
  const key = item.submission ? item.submission.id : `${applicantUserId}:${item.templateId}`;
  const canNotify = item.statusKey === "not_submitted" || item.statusKey === "needs_revision";
  const isDownloading = item.submission && downloadingId === item.submission.id;
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
        <Badge tone={meta.tone} className={item.statusKey === "needs_revision" ? "animate-blink" : ""}>
          {meta.label}
        </Badge>
        {item.submission && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={isDownloading}
            onClick={() => onViewSubmission(item)}
          >
            <Icon name={isDownloading ? "download" : "eye"} className="h-3.5 w-3.5" />
            {isDownloading ? ap.generatingLabel : ap.viewDocumentLabel}
          </Button>
        )}
        {!isHistory && item.submission && item.statusKey !== "needs_revision" && (
          <button
            type="button"
            onClick={() => onSetReviewStatus(applicant, item, "needs_revision")}
            className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
            {ap.markNeedsRevisionLabel}
          </button>
        )}
        {!isHistory && item.submission && item.statusKey !== "approved" && (
          <button
            type="button"
            onClick={() => onSetReviewStatus(applicant, item, "approved")}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Icon name="check" className="h-3.5 w-3.5" />
            {ap.markApprovedLabel}
          </button>
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

function SubmissionItem({ item, applicant, onViewSubmission, onNotify, onSetReviewStatus, notifying, notified, downloadingId }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div>
      <SubmissionRow
        item={item}
        applicantUserId={applicant.userId}
        applicant={applicant}
        onViewSubmission={onViewSubmission}
        onNotify={onNotify}
        onSetReviewStatus={onSetReviewStatus}
        notifying={notifying}
        notified={notified}
        downloadingId={downloadingId}
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
                  onNotify={onNotify}
                  notifying={notifying}
                  notified={notified}
                  downloadingId={downloadingId}
                />
              </div>
            ))}
        </>
      )}
    </div>
  );
}

// 지원사업(공고) 기준으로 묶어, 각 사업에 신청한 기업 수를 먼저 보여주고
// 펼치면 신청 기업 목록 → 다시 펼치면 그 기업이 제출한 서류 목록이 나오는 2단 구조.
function ProgramRow({
  program,
  expanded,
  onToggle,
  expandedApplicantKey,
  onToggleApplicant,
  onViewSubmission,
  onNotify,
  onSetReviewStatus,
  notifying,
  notified,
  downloadingId,
}) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <p className="font-bold text-slate-900">{program.businessName}</p>
          <p className="mt-1 text-xs text-slate-400">
            {ap.tableHeaders.lastUpdated} {program.lastUpdated}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="brand">
            {ap.applicantCountLabel} {program.applicants.length}개
          </Badge>
          <Icon
            name="chevronDown"
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-slate-100 px-5 py-4">
          {program.applicants.map((applicant) => {
            const key = `${program.businessId}:${applicant.userId}`;
            const applicantExpanded = expandedApplicantKey === key;
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onToggleApplicant(key)}
                  className="flex w-full items-center justify-between gap-4 bg-white px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {applicant.name[0]}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{applicant.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={applicant.percent === 100 ? "success" : "brand"}>
                      {ap.percentLabel} {applicant.percent}%
                    </Badge>
                    <Icon
                      name="chevronDown"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${applicantExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                {applicantExpanded && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {applicant.items.map((item) => (
                      <SubmissionItem
                        key={item.submission ? item.submission.id : `${applicant.userId}:${item.templateId}`}
                        item={item}
                        applicant={applicant}
                        onViewSubmission={onViewSubmission}
                        onNotify={onNotify}
                        onSetReviewStatus={onSetReviewStatus}
                        notifying={notifying}
                        notified={notified}
                        downloadingId={downloadingId}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
    <Modal title={bf.title} onClose={onClose}>
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
    </Modal>
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
    <Modal title={`${tf.title} · ${business.name}`} onClose={onClose}>
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
    </Modal>
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
    <Modal title={ef.title} onClose={onClose}>
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
    </Modal>
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
    <Modal title={`${ff.title} · ${template.name}`} onClose={onClose} width="max-w-2xl">
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
    </Modal>
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

  const swapOrder = async (kind, current, neighbor) => {
    const path = kind === "business" ? "businesses" : "templates";
    setActionError(null);
    try {
      await Promise.all([
        fetch(`${BACKEND_URL}/admin/${path}/${current.id}/order`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ sort_order: neighbor.sort_order }),
        }),
        fetch(`${BACKEND_URL}/admin/${path}/${neighbor.id}/order`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ sort_order: current.sort_order }),
        }),
      ]);
      await loadBusinessManager();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const moveBusiness = (index, direction) => {
    const neighborIndex = index + direction;
    if (neighborIndex < 0 || neighborIndex >= businesses.length) return;
    swapOrder("business", businesses[index], businesses[neighborIndex]);
  };

  const moveTemplate = (list, index, direction) => {
    const neighborIndex = index + direction;
    if (neighborIndex < 0 || neighborIndex >= list.length) return;
    swapOrder("template", list[index], list[neighborIndex]);
  };

  async function loadBusinessManager() {
    setLoadingBM(true);
    const [{ data: biz }, { data: tpl }] = await Promise.all([
      orderedSelect(() => supabase.from("businesses").select("*"), "created_at", { ascending: false }),
      orderedSelect(() => supabase.from("templates").select("*"), "form_number"),
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
          {businesses.map((biz, bizIndex) => {
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
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="사업 순서 위로"
                        disabled={bizIndex === 0}
                        onClick={() => moveBusiness(bizIndex, -1)}
                        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <Icon name="chevronDown" className="h-3.5 w-3.5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label="사업 순서 아래로"
                        disabled={bizIndex === businesses.length - 1}
                        onClick={() => moveBusiness(bizIndex, 1)}
                        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <Icon name="chevronDown" className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
                    {templates.map((t, tIndex) => (
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
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              aria-label="서식 순서 위로"
                              disabled={tIndex === 0}
                              onClick={() => moveTemplate(templates, tIndex, -1)}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            >
                              <Icon name="chevronDown" className="h-3.5 w-3.5 rotate-180" />
                            </button>
                            <button
                              type="button"
                              aria-label="서식 순서 아래로"
                              disabled={tIndex === templates.length - 1}
                              onClick={() => moveTemplate(templates, tIndex, 1)}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            >
                              <Icon name="chevronDown" className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
  const [expandedProgramId, setExpandedProgramId] = useState(null);
  const [expandedApplicantKey, setExpandedApplicantKey] = useState(null);
  const [notifying, setNotifying] = useState({});
  const [notified, setNotified] = useState({});
  const [reviewStatusError, setReviewStatusError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  async function load() {
    setLoading(true);

    const [{ data: businesses }, templatesRes, { data: submissions }, { data: generatedDocs }, { data: allFields }] =
      await Promise.all([
        supabase.from("businesses").select("id,name"),
        supabase.from("templates").select("id,name,business_id,sort_order"),
        supabase.from("submissions").select("*").order("created_at", { ascending: false }),
        supabase.from("generated_documents").select("submission_id,file_path"),
        supabase.from("template_fields").select("id,template_id"),
      ]);
    // sort_order 컬럼이 아직 마이그레이션되지 않았으면 위 select가 에러를 반환하므로,
    // 그 컬럼 없이 다시 조회해 화면 자체는 계속 정상 동작하게 한다.
    const templates = templatesRes.error
      ? (await supabase.from("templates").select("id,name,business_id")).data
      : templatesRes.data;

    const businessNameById = Object.fromEntries((businesses || []).map((b) => [b.id, b.name]));
    const templateById = Object.fromEntries((templates || []).map((t) => [t.id, t]));
    const templatesByBusiness = {};
    for (const t of templates || []) {
      (templatesByBusiness[t.business_id] ??= []).push(t);
    }
    const generatedPathBySubmission = Object.fromEntries(
      (generatedDocs || []).map((g) => [g.submission_id, g.file_path])
    );

    // 퍼센티지는 "서류를 제출했는지"가 아니라 사용자 화면(DocumentChecklist)과 동일하게
    // "실제로 채워진 필드 수 / 전체 필드 수"로 계산한다 — 그래야 두 화면의 숫자가 일치한다.
    const fieldCountByTemplate = {};
    (allFields || []).forEach((f) => {
      fieldCountByTemplate[f.template_id] = (fieldCountByTemplate[f.template_id] || 0) + 1;
    });
    const submissionIds = (submissions || []).map((s) => s.id);
    const { data: allValues } = submissionIds.length
      ? await supabase.from("submission_values").select("submission_id,value").in("submission_id", submissionIds)
      : { data: [] };
    const filledCountBySubmission = {};
    (allValues || []).forEach((v) => {
      if (v.value) filledCountBySubmission[v.submission_id] = (filledCountBySubmission[v.submission_id] || 0) + 1;
    });

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
        // "사업 관리자" 탭과 동일하게 sort_order 기준으로 정렬해 두 탭의 서식 순서를 통일한다.
        program.items.sort(
          (a, b) => (templateById[a.templateId]?.sort_order ?? 0) - (templateById[b.templateId]?.sort_order ?? 0)
        );
        const totalFields = allTemplates.reduce((sum, t) => sum + (fieldCountByTemplate[t.id] || 0), 0);
        const filledFields = program.items.reduce(
          (sum, item) => sum + (item.submission ? filledCountBySubmission[item.submission.id] || 0 : 0),
          0
        );
        program.totalTemplates = allTemplates.length;
        program.submittedCount = submittedTemplateIds.size;
        program.totalFields = totalFields;
        program.filledFields = filledFields;
        program.percent = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;
      }
    }

    const list = Object.values(byUser)
      .map((bucket) => {
        const programs = Object.values(bucket.byBusiness);
        const totalFields = programs.reduce((s, p) => s + p.totalFields, 0);
        const filledFields = programs.reduce((s, p) => s + p.filledFields, 0);
        return {
          userId: bucket.userId,
          name: bucket.name || `${ap.applicantFallbackName} (${bucket.userId.slice(0, 8)})`,
          submissions: bucket.submissions,
          programs,
          percent: totalFields ? Math.round((filledFields / totalFields) * 100) : 0,
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
    return { applicants: applicants.length, programs: programCount };
  }, [applicants]);

  // 신청자 기준으로 모아둔 applicants를 지원사업(공고) 기준으로 다시 묶는다 —
  // 각 사업에 신청한 기업 수를 먼저 보여주고, 펼치면 기업별 서류를 볼 수 있게 하기 위함.
  const programGroups = useMemo(() => {
    const byBusiness = {};
    for (const applicant of applicants) {
      for (const program of applicant.programs) {
        if (!byBusiness[program.businessId]) {
          byBusiness[program.businessId] = {
            businessId: program.businessId,
            businessName: program.businessName,
            applicants: [],
            lastUpdated: applicant.lastUpdated,
          };
        }
        const bucket = byBusiness[program.businessId];
        if (applicant.lastUpdated > bucket.lastUpdated) bucket.lastUpdated = applicant.lastUpdated;
        bucket.applicants.push({
          userId: applicant.userId,
          name: applicant.name,
          percent: program.percent,
          items: program.items,
        });
      }
    }
    return Object.values(byBusiness).sort((a, b) => b.applicants.length - a.applicants.length);
  }, [applicants]);

  const handleDownload = async (filePath, bucket = "generated") => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  // "제출 내용 보기"를 누르면 사용자가 입력한 값이 채워진 문서를 바로 다운로드한다.
  // 사용자가 직접 업로드한 서류는 그 파일을, 서식형은 이미 생성된 문서가 있으면 그것을,
  // 없으면 백엔드에 생성을 요청한 뒤 바로 다운로드한다.
  const handleViewSubmission = async (item) => {
    if (!item.submission) return;
    if (item.submission.file_path) {
      return handleDownload(item.submission.file_path, "templates");
    }
    if (item.generatedPath) {
      return handleDownload(item.generatedPath);
    }
    setDownloadingId(item.submission.id);
    setReviewStatusError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: item.submission.id }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "문서 생성에 실패했습니다."));
      const data = await res.json();
      await handleDownload(data.file_path);
      await load();
    } catch (err) {
      setReviewStatusError(err.message);
    } finally {
      setDownloadingId(null);
    }
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

  const handleSetReviewStatus = async (applicant, item, reviewStatus) => {
    if (!item.submission) return;
    setReviewStatusError(null);
    const { data, error } = await supabase
      .from("submissions")
      .update({ review_status: reviewStatus, reviewed_at: new Date().toISOString() })
      .eq("id", item.submission.id)
      .select();
    if (error) {
      setReviewStatusError(error.message);
      return;
    }
    // RLS 정책이 막으면 PostgREST는 에러 없이 빈 배열을 반환한다 — 이 경우를 명시적으로 감지해서
    // 버튼을 눌러도 조용히 아무 일도 안 일어나는 것처럼 보이지 않게 한다.
    if (!data || data.length === 0) {
      setReviewStatusError("권한이 없어 상태를 변경하지 못했습니다. (submissions 테이블의 관리자 UPDATE 정책을 확인하세요)");
      return;
    }

    // 반려(서류 보완 필요)일 때는 사용자에게 실시간 알림이 뜨도록 notifications에도 남긴다.
    if (reviewStatus === "needs_revision") {
      try {
        await supabase.from("notifications").insert({
          user_id: applicant.userId,
          submission_id: item.submission.id,
          template_id: item.templateId,
          type: "needs_revision",
          message: `[${item.templateName}] 제출하신 서류에 보완이 필요합니다. 확인 후 다시 제출해주세요.`,
        });
      } catch {
        // 알림 생성에 실패해도 심사 상태 변경 자체는 이미 반영됐다.
      }
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
          <img src={brand.logo} alt={brand.name} className="h-8 w-8 rounded-lg object-contain" />
          <span className="text-sm font-bold text-slate-900">{brand.name} · 관리자</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex min-w-[5.5rem] items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-6">
                <p className="text-base text-slate-500">{ap.summaryLabels.applicants}</p>
                <p className="mt-1 text-4xl font-extrabold text-brand-700">{summary.applicants}</p>
              </Card>
              <Card className="p-6">
                <p className="text-base text-slate-500">{ap.summaryLabels.programs}</p>
                <p className="mt-1 text-4xl font-extrabold text-brand-700">{summary.programs}</p>
              </Card>
            </div>

            {reviewStatusError && (
              <p className="mb-3 text-xs font-medium text-red-500">{reviewStatusError}</p>
            )}

            {loading ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : programGroups.length === 0 ? (
              <p className="text-sm text-slate-400">{ap.emptyMessage}</p>
            ) : (
              <div className="space-y-3">
                {programGroups.map((program) => (
                  <ProgramRow
                    key={program.businessId}
                    program={program}
                    expanded={expandedProgramId === program.businessId}
                    onToggle={() =>
                      setExpandedProgramId((id) => (id === program.businessId ? null : program.businessId))
                    }
                    expandedApplicantKey={expandedApplicantKey}
                    onToggleApplicant={(key) =>
                      setExpandedApplicantKey((k) => (k === key ? null : key))
                    }
                    onViewSubmission={handleViewSubmission}
                    onNotify={handleNotify}
                    onSetReviewStatus={handleSetReviewStatus}
                    notifying={notifying}
                    notified={notified}
                    downloadingId={downloadingId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
