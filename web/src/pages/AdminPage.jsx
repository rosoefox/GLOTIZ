import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField, CONTROL_CLASS } from "../components/ui";
import Modal from "../components/Modal";
import { brand, adminPanel as ap, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";
import { readErrorMessage } from "../lib/apiError";
import { isClosed } from "../lib/period";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const FIELD_TYPE_OPTIONS = ["text", "number", "date", "select", "checkbox", "textarea", "long_text"];
// 마이페이지 서류 슬롯(사업자 등록증/상품 상세설명서)과 업로드형 서식을 연결할 때 쓰는 선택지.
// 값은 backend main.py의 ACCOUNT_DOC_TYPES 키와 일치해야 한다.
const ACCOUNT_DOC_TYPE_OPTIONS = [
  { value: "", label: "연결 안 함" },
  { value: "biz_reg", label: "사업자 등록증" },
  { value: "product_spec", label: "상품 상세설명서" },
];

const COMPANY_NAME_KEYS = ["company_name_kr", "company_name"];

// 관리자는 사용자가 브라우저에만 남겨둔 임시저장 여부를 알 수 없어(의도적으로 서버에 올리지
// 않는 값) "서류작성전"과 "서류작성중"을 구분하지 못한다 — 둘 다 "서류작성중"으로 뭉뚱그린다.
const REVIEW_STATUS_BADGE = {
  not_submitted: { label: "서류작성중", className: "bg-slate-100 text-slate-500" },
  reviewing: { label: "심사중", className: "bg-blue-50 text-blue-600" },
  needs_revision: { label: "반려", className: "bg-red-50 text-red-600" },
  approved: { label: "심사완료", className: "bg-emerald-50 text-emerald-600" },
};

function SubmissionRow({
  item,
  isHistory,
  applicantUserId,
  onViewSubmission,
  onSetReviewStatus,
  applicant,
  downloadingId,
}) {
  const isDownloading = item.submission && downloadingId === item.submission.id;
  const badge = !isHistory && REVIEW_STATUS_BADGE[item.statusKey];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isHistory ? "bg-slate-50" : ""}`}>
      <div>
        <p className={`flex items-center gap-2 text-sm ${isHistory ? "text-slate-600" : "font-semibold text-slate-900"}`}>
          {isHistory ? "이전 제출" : item.templateName}
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </p>
        {item.submission && (
          <p className="text-xs text-slate-400">{new Date(item.submission.created_at).toLocaleString("ko-KR")}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {item.submission && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={isDownloading}
            onClick={() => onViewSubmission(item)}
          >
            <Icon name={isDownloading ? "download" : "eye"} className="w-5 h-5" />
            {isDownloading ? ap.generatingLabel : ap.viewDocumentLabel}
          </Button>
        )}
        {!isHistory && item.submission && (
          <button
            type="button"
            onClick={() => onSetReviewStatus(applicant, item, "needs_revision")}
            className="flex w-[5.5rem] items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
          >
            <Icon name="x" className="w-5 h-5" />
            {ap.markNeedsRevisionLabel}
          </button>
        )}
        {!isHistory && item.submission && (
          <button
            type="button"
            onClick={() => onSetReviewStatus(applicant, item, "approved")}
            className="flex w-[5.5rem] items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Icon name="check" className="w-5 h-5" />
            {ap.markApprovedLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function SubmissionItem({ item, applicant, onViewSubmission, onSetReviewStatus, downloadingId }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div>
      <SubmissionRow
        item={item}
        applicant={applicant}
        onViewSubmission={onViewSubmission}
        onSetReviewStatus={onSetReviewStatus}
        downloadingId={downloadingId}
      />
      {item.history.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand-600 hover:bg-slate-50"
          >
            <Icon name="chevronDown" className={`w-5 h-5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            이전 제출 {item.history.length}건 {showHistory ? "숨기기" : "보기"}
          </button>
          {showHistory &&
            item.history.map((h) => (
              <div key={h.submission.id} className="border-t border-slate-100">
                <SubmissionRow
                  item={h}
                  isHistory
                  applicant={applicant}
                  onViewSubmission={onViewSubmission}
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
  onSetReviewStatus,
  downloadingId,
  onDeleteApplicant,
  deletingApplicantKey,
}) {
  const closed = program.closed;
  return (
    <Card className={`p-0 ${closed ? "opacity-60 grayscale" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <p className="flex items-center gap-2 font-bold text-slate-900">
            {program.businessName}
            {closed && <Badge tone="neutral">마감</Badge>}
          </p>
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
            const isDeleting = deletingApplicantKey === key;
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
                    {closed && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isDeleting) onDeleteApplicant(program, applicant);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
                        className={`flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 ${
                          isDeleting ? "pointer-events-none opacity-50" : ""
                        }`}
                      >
                        <Icon name="trash" className="w-3.5 h-3.5" />
                        {isDeleting ? "삭제 중..." : "삭제"}
                      </span>
                    )}
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
                        onSetReviewStatus={onSetReviewStatus}
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
  const [file, setFile] = useState(null);
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
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "사업 등록에 실패했습니다."));
      let data = await res.json();

      if (file) {
        const form = new FormData();
        form.append("file", file);
        const docRes = await fetch(`${BACKEND_URL}/admin/businesses/${data.id}/reference-doc`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });
        if (!docRes.ok) throw new Error(await readErrorMessage(docRes, "공고문 업로드에 실패했습니다."));
        data = await docRes.json();
      }

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
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{bf.referenceDocLabel}</span>
            <input
              type="file"
              accept=".pdf,.docx,.hwp,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
            />
            <p className="mt-1.5 text-xs text-slate-400">{bf.referenceDocHint}</p>
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
  const [file, setFile] = useState(null);
  const [docKind, setDocKind] = useState("auto_fill"); // auto_fill | user_upload | reference
  const [linkedAccountDocType, setLinkedAccountDocType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // 자동완성 서류는 업로드가 끝나자마자 같은 흐름으로 바로 "필드 추가" 단계로 넘어간다 -
  // 따로 목록에서 다시 찾아 클릭할 필요 없게.
  const [createdAutoFillTemplate, setCreatedAutoFillTemplate] = useState(null);

  const userUploadRequired = docKind === "user_upload";
  const referenceOnly = docKind === "reference";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (docKind === "auto_fill" && !file) {
      setError("DOCX 파일을 선택해주세요.");
      return;
    }
    if (referenceOnly && !file) {
      setError("참고자료로 올릴 파일을 선택해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("business_id", business.id);
      form.append("name", name);
      form.append("user_upload_required", userUploadRequired ? "true" : "false");
      form.append("reference_only", referenceOnly ? "true" : "false");
      if (docKind === "auto_fill" || referenceOnly) {
        form.append("file", file);
      } else if (linkedAccountDocType) {
        form.append("linked_account_doc_type", linkedAccountDocType);
      }
      const res = await fetch(`${BACKEND_URL}/admin/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "서류 양식 업로드에 실패했습니다."));
      const data = await res.json();
      if (docKind === "auto_fill") {
        setCreatedAutoFillTemplate(data);
      } else {
        onCreated(data);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (createdAutoFillTemplate) {
    return (
      <NewFieldsModal session={session} template={createdAutoFillTemplate} onClose={onClose} onSaved={onCreated} />
    );
  }

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
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{tf.docKindLabel}</span>
            <select value={docKind} onChange={(e) => setDocKind(e.target.value)} className={`${CONTROL_CLASS} py-3`}>
              {tf.docKindOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {docKind === "auto_fill" && (
            <>
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
          {userUploadRequired && (
            <>
              <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
                {tf.userUploadHint}
              </p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{tf.linkedDocLabel}</span>
                <select
                  value={linkedAccountDocType}
                  onChange={(e) => setLinkedAccountDocType(e.target.value)}
                  className={`${CONTROL_CLASS} py-3`}
                >
                  {ACCOUNT_DOC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value ? opt.label : tf.linkedDocNoneOption}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{tf.linkedDocHint}</span>
              </label>
            </>
          )}
          {referenceOnly && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{tf.referenceFileLabel}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.hwp,.jpg,.jpeg,.png"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-600"
                />
              </label>
              <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
                {tf.referenceHint}
              </p>
            </>
          )}
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving
              ? "업로드 중..."
              : docKind === "auto_fill"
                ? "업로드하고 필드 추가하기"
                : tf.submitLabel}
          </Button>
      </form>
    </Modal>
  );
}

function EditTemplateModal({ session, template, onClose, onUpdated }) {
  const ef = ap.businessManager.editTemplateForm;
  const [name, setName] = useState(template.name || "");
  const [formNumber, setFormNumber] = useState(template.form_number || "");
  const [linkedAccountDocType, setLinkedAccountDocType] = useState(template.linked_account_doc_type || "");
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
      if (template.user_upload_required) form.append("linked_account_doc_type", linkedAccountDocType);
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
          {template.user_upload_required ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{ef.linkedDocLabel}</span>
              <select
                value={linkedAccountDocType}
                onChange={(e) => setLinkedAccountDocType(e.target.value)}
                className={CONTROL_CLASS}
              >
                {ACCOUNT_DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value ? opt.label : ef.linkedDocNoneOption}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
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
            </>
          )}
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
          section: f.section ?? null,
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
        section: r.section ?? null,
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
            <Icon name="sparkle" className="w-5 h-5" />
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
            <Icon name="plus" className="w-5 h-5" />
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

function BusinessManager({ session, reloadKey }) {
  const bm = ap.businessManager;
  const [businesses, setBusinesses] = useState([]);
  const [templatesByBusiness, setTemplatesByBusiness] = useState({});
  const [loadingBM, setLoadingBM] = useState(true);
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
  const [expandedBusinessId, setExpandedBusinessId] = useState(null);
  const [bmSearch, setBmSearch] = useState("");
  const [dragIndex, setDragIndex] = useState(null);

  const filteredBusinesses = useMemo(() => {
    const query = bmSearch.trim().toLowerCase();
    if (!query) return businesses;
    return businesses.filter((biz) => biz.name?.toLowerCase().includes(query));
  }, [businesses, bmSearch]);

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

  // 그립 아이콘을 눌러서 끄는 동안 dragIndex에 원래 위치를 담아뒀다가, 다른 카드
  // 위에 놓으면(drop) businesses 배열에서 그 위치로 옮기고 순서 전체를 다시 매긴다.
  // 화면은 서버 응답을 기다리지 않고 바로 새 순서로 갱신하고(낙관적 업데이트),
  // PATCH는 뒤에서 조용히 반영한다 — 실패하면 그때만 서버 상태로 되돌린다.
  const reorderBusinesses = async (newOrder) => {
    setActionError(null);
    setBusinesses(newOrder);
    try {
      await Promise.all(
        newOrder.map((biz, i) =>
          fetch(`${BACKEND_URL}/admin/businesses/${biz.id}/order`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ sort_order: i }),
          })
        )
      );
    } catch (err) {
      setActionError(err.message);
      await loadBusinessManager();
    }
  };

  const handleBusinessDragStart = (index) => (e) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleBusinessDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleBusinessDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === index) return;
    const reordered = [...businesses];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(index, 0, moved);
    reorderBusinesses(reordered);
  };

  // 신청자 화면과 동일하게 참고자료 → 사용자 제출서류 → 자동완성 서식 순으로 나눈다.
  function splitTemplates(templates) {
    const referenceTemplates = templates.filter((t) => t.reference_only);
    const uploadTemplates = templates.filter((t) => t.user_upload_required && !t.reference_only);
    const formTemplates = templates.filter((t) => !t.user_upload_required && !t.reference_only);
    return { referenceTemplates, uploadTemplates, formTemplates };
  }

  function renderTemplateRow(t) {
    return (
      <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-900">{t.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditTemplateTarget(t)}>
            {bm.editTemplateButtonLabel}
          </Button>
          {!t.user_upload_required && !t.reference_only && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setFieldsModalTemplate(t)}>
              {bm.addFieldsButtonLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
            disabled={deletingTemplateId === t.id}
            onClick={() => handleDeleteTemplate(t)}
          >
            <Icon name="trash" className="w-5 h-5" />
            {deletingTemplateId === t.id ? "삭제 중..." : bm.deleteTemplateButtonLabel}
          </Button>
        </div>
      </div>
    );
  }

  async function loadBusinessManager() {
    setLoadingBM(true);
    const [{ businesses: biz }, { templates: tpl }] = await Promise.all([
      api.get("/businesses"),
      api.get("/templates"),
    ]);
    setBusinesses(biz || []);
    const grouped = {};
    for (const t of tpl || []) (grouped[t.business_id] ??= []).push(t);
    setTemplatesByBusiness(grouped);
    setLoadingBM(false);
  }

  useEffect(() => {
    loadBusinessManager();
  }, [reloadKey]);

  return (
    <div>
      {actionError && <p className="mb-4 text-xs font-medium text-red-500">{actionError}</p>}

      <div className="relative mb-4">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 w-5 h-5 -translate-y-1/2 text-slate-400"
        />
        <input
          value={bmSearch}
          onChange={(e) => setBmSearch(e.target.value)}
          placeholder="사업 이름으로 검색"
          className={`${CONTROL_CLASS} h-10 pl-10`}
        />
      </div>

      {loadingBM ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : businesses.length === 0 ? (
        <p className="text-sm text-slate-400">{bm.businessListEmptyMessage}</p>
      ) : filteredBusinesses.length === 0 ? (
        <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {filteredBusinesses.map((biz) => {
            const templates = templatesByBusiness[biz.id] || [];
            const bizIndex = businesses.findIndex((b) => b.id === biz.id);
            return (
              <Card
                key={biz.id}
                className={`p-5 transition-opacity ${dragIndex === bizIndex ? "opacity-40" : ""}`}
                onDragOver={handleBusinessDragOver}
                onDrop={handleBusinessDrop(bizIndex)}
              >
                <div
                  className={`flex items-center justify-between gap-4 ${
                    expandedBusinessId === biz.id ? "mb-3" : ""
                  }`}
                >
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
                          <Icon name="check" className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditBusinessName}
                          disabled={savingName}
                          aria-label="취소"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                        >
                          <Icon name="x" className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedBusinessId((id) => (id === biz.id ? null : biz.id))}
                          className="group flex items-center gap-1.5"
                        >
                          <Icon
                            name="chevronDown"
                            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-300 ${
                              expandedBusinessId === biz.id ? "rotate-180" : ""
                            }`}
                          />
                          <p className="font-bold text-slate-900 group-hover:text-brand-600">{biz.name}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditBusinessName(biz)}
                          aria-label="사업명 수정"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {editingBusinessId === biz.id && nameError && (
                      <p className="mt-1 text-xs font-medium text-red-500">{nameError}</p>
                    )}
                    {biz.description && <p className="mt-1 text-sm text-slate-500">{biz.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {biz.basic_info && (
                      <Badge tone="success">
                        <Icon name="checkCircle" className="w-3.5 h-3.5" /> 기본 정보 완료
                      </Badge>
                    )}
                    <button
                      type="button"
                      draggable
                      onDragStart={handleBusinessDragStart(bizIndex)}
                      onDragEnd={() => setDragIndex(null)}
                      aria-label="꾹 눌러서 끌면 순서 변경"
                      title="꾹 눌러서 끌면 순서 변경"
                      className="flex h-8 w-8 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                    >
                      <Icon name="grip" className="w-4 h-4" />
                    </button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setTemplateModalBusiness(biz)}
                    >
                      <Icon name="upload" className="w-5 h-5" />
                      {bm.uploadTemplateButtonLabel}
                    </Button>
                    <Button
                      variant="ghost"
                      className="border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                      disabled={deletingBusinessId === biz.id}
                      onClick={() => handleDeleteBusiness(biz)}
                    >
                      <Icon name="trash" className="w-5 h-5" />
                      {deletingBusinessId === biz.id ? "삭제 중..." : "사업 삭제"}
                    </Button>
                  </div>
                </div>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    expandedBusinessId === biz.id ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    {templates.length === 0 ? (
                      <p className="text-xs text-slate-400">{bm.templateListEmptyMessage}</p>
                    ) : (
                      (() => {
                        const { referenceTemplates, uploadTemplates, formTemplates } = splitTemplates(templates);
                        return (
                          <div className="space-y-4">
                            {referenceTemplates.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-black">
                                  {bm.referenceGroupLabel}
                                </p>
                                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                                  {referenceTemplates.map((t) => renderTemplateRow(t))}
                                </div>
                              </div>
                            )}
                            {uploadTemplates.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                                  {bm.userUploadGroupLabel}
                                </p>
                                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                                  {uploadTemplates.map((t) => renderTemplateRow(t))}
                                </div>
                              </div>
                            )}
                            {formTemplates.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-black">
                                  {bm.formTemplateGroupLabel}
                                </p>
                                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                                  {formTemplates.map((t) => renderTemplateRow(t))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
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
  const [businessRows, setBusinessRows] = useState([]);
  const [expandedProgramId, setExpandedProgramId] = useState(null);
  const [expandedApplicantKey, setExpandedApplicantKey] = useState(null);
  const [reviewStatusError, setReviewStatusError] = useState(null);
  const [deletingApplicantKey, setDeletingApplicantKey] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [businessReloadKey, setBusinessReloadKey] = useState(0);

  async function load() {
    setLoading(true);

    const [{ businesses }, { templates }, { submissions }, { documents: generatedDocs }] = await Promise.all([
      api.get("/businesses"),
      api.get("/templates"),
      api.get("/admin/submissions", session?.access_token),
      api.get("/generated_documents", session?.access_token),
    ]);

    setBusinessRows(businesses || []);
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
    const { fields: companyFields } = await api.get(`/template_fields?${idsParam("field_key", COMPANY_NAME_KEYS)}`);
    const companyFieldIds = (companyFields || []).map((f) => f.id);
    if (companyFieldIds.length) {
      const { values: companyValues } = await api.get(
        `/submission_values?${idsParam("field_id", companyFieldIds)}`,
        session?.access_token
      );
      companyNameBySubmission = Object.fromEntries(
        (companyValues || []).filter((v) => v.value).map((v) => [v.submission_id, v.value])
      );
    }

    // 서식 자체에 회사명 필드가 없는 경우(예: 짧은 신청서)를 대비해, 계정에 등록된
    // 이름/회사명도 보조 표시용으로 같이 가져온다.
    const submitterIds = [...new Set((submissions || []).map((s) => s.user_id).filter(Boolean))];
    const { users: submitterAccounts } = submitterIds.length
      ? await api.get(`/admin/users?${idsParam("id", submitterIds)}`, session?.access_token)
      : { users: [] };
    const accountById = Object.fromEntries((submitterAccounts || []).map((u) => [u.id, u]));

    const byUser = {};
    for (const submission of submissions || []) {
      const template = templateById[submission.template_id];
      if (!template) continue;
      const uid = submission.user_id;
      if (!byUser[uid]) {
        const account = accountById[uid];
        byUser[uid] = {
          userId: uid,
          name: companyNameBySubmission[submission.id] || account?.company || account?.name || null,
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
        // 참고자료(reference_only)는 신청자가 제출할 대상이 아니라서 체크리스트/완료율 계산에서 뺀다.
        const allTemplates = (templatesByBusiness[program.businessId] || []).filter((t) => !t.reference_only);
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
        program.totalTemplates = allTemplates.length;
        program.submittedCount = submittedTemplateIds.size;
        // "완료율"은 필드 채움 정도가 아니라 서식 제출 여부(문서 기준)로 센다 - 관리자
        // 화면에서 보는 단위가 "서류 몇 개 중 몇 개 냈는지"라 그게 더 직관적이다.
        program.percent = program.totalTemplates ? Math.round((program.submittedCount / program.totalTemplates) * 100) : 0;
      }
    }

    const list = Object.values(byUser)
      .map((bucket) => {
        const programs = Object.values(bucket.byBusiness);
        const totalTemplates = programs.reduce((s, p) => s + p.totalTemplates, 0);
        const submittedCount = programs.reduce((s, p) => s + p.submittedCount, 0);
        return {
          userId: bucket.userId,
          name: bucket.name || `${ap.applicantFallbackName} (${bucket.userId.slice(0, 8)})`,
          submissions: bucket.submissions,
          programs,
          percent: totalTemplates ? Math.round((submittedCount / totalTemplates) * 100) : 0,
          lastUpdated: new Date(bucket.lastUpdated).toLocaleDateString("ko-KR"),
        };
      })
      .sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));

    setApplicants(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const summary = useMemo(() => {
    const programCount = applicants.reduce((sum, a) => sum + a.programs.length, 0);
    const needsApprovalCount = applicants.reduce(
      (sum, a) => sum + a.programs.reduce((s, p) => s + p.items.filter((i) => i.statusKey === "reviewing").length, 0),
      0
    );
    return { applicants: applicants.length, programs: programCount, needsApproval: needsApprovalCount };
  }, [applicants]);

  const closedByBusinessId = useMemo(() => {
    const map = {};
    for (const b of businessRows) map[b.id] = isClosed(b, govAnnouncementDetails);
    return map;
  }, [businessRows]);

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
            closed: Boolean(closedByBusinessId[program.businessId]),
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
  }, [applicants, closedByBusinessId]);

  // 사업명 또는 그 사업에 신청한 기업(회사)명으로 찾는다 — 둘 중 하나만 맞아도 그 사업
  // 전체(신청 기업 목록 포함)를 보여준다.
  const filteredProgramGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return programGroups;
    return programGroups.filter(
      (program) =>
        program.businessName.toLowerCase().includes(query) ||
        program.applicants.some((a) => a.name.toLowerCase().includes(query))
    );
  }, [programGroups, search]);

  const handleDownload = async (filePath, bucket = "generated") => {
    try {
      const { url } = await api.get(
        `/generated-file-url?path=${encodeURIComponent(filePath)}&bucket=${bucket}`,
        session?.access_token
      );
      // #toolbar=0 — 크롬 내장 PDF 뷰어의 툴바(다운로드·인쇄·확대와 함께 형광펜 주석 도구까지)를
      // 통째로 숨긴다. 형광펜 도구 하나만 없애는 옵션은 크롬에 없어서, 서류를 볼 때 다른 사용자가
      // 실수로 형광펜으로 표시해버리는 일이 없도록 툴바 자체를 껐다.
      if (url) window.open(`${url}#toolbar=0`, "_blank", "noopener,noreferrer");
    } catch {
      // 다운로드 실패는 조용히 무시 - 버튼을 다시 누르면 재시도된다.
    }
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

  // 상태 변경 + 알림 생성을 백엔드(/admin/submissions/{id}/review-status)에 맡긴다. 백엔드가
  // DB를 갱신한 뒤 Pub/Sub에 이벤트를 발행하고, 그 이벤트를 구독하는 쪽(/pubsub/submission-events)이
  // notifications 행을 만든다 - 승인/반려 알림을 같은 방식으로 통일하기 위해서다.
  const handleSetReviewStatus = async (applicant, item, reviewStatus) => {
    if (!item.submission) return;
    setReviewStatusError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/submissions/${item.submission.id}/review-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: reviewStatus }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "심사 상태 변경에 실패했습니다."));
    } catch (err) {
      setReviewStatusError(err.message);
      return;
    }

    await load();
  };

  // 마감된 지원사업에서 특정 신청 기업의 제출 내역을 통째로 정리할 때 쓴다 — 되돌릴 수
  // 없으므로 반드시 확인을 받는다.
  const handleDeleteApplicant = async (program, applicant) => {
    if (
      !window.confirm(
        `"${applicant.name}"의 "${program.businessName}" 신청 내역을 삭제할까요?\n제출된 서류가 전부 함께 삭제되며 되돌릴 수 없습니다.`
      )
    )
      return;
    const key = `${program.businessId}:${applicant.userId}`;
    setDeletingApplicantKey(key);
    setReviewStatusError(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/admin/businesses/${program.businessId}/applicants/${applicant.userId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, "신청 내역 삭제에 실패했습니다."));
    } catch (err) {
      setReviewStatusError(err.message);
      setDeletingApplicantKey(null);
      return;
    }
    setDeletingApplicantKey(null);
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
          <img src={brand.logo} alt={brand.name} className="h-6 w-auto object-contain" />
          <span className="text-sm font-bold text-slate-900">관리자</span>
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

        <div className="mb-6 grid grid-cols-3 divide-x divide-slate-100 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="px-6 py-4">
            <p className="text-sm text-slate-500">{ap.summaryLabels.applicants}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{summary.applicants}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-slate-500">{ap.summaryLabels.programs}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{summary.programs}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-slate-500">{ap.summaryLabels.needsApproval}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{summary.needsApproval}</p>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="inline-flex gap-2 rounded-lg bg-slate-100 p-1">
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
          <Button onClick={() => setShowBusinessModal(true)}>
            <Icon name="plus" className="w-5 h-5" />
            {ap.businessManager.newBusinessButtonLabel}
          </Button>
        </div>

        {showBusinessModal && (
          <NewBusinessModal
            session={session}
            onClose={() => setShowBusinessModal(false)}
            onCreated={() => {
              setShowBusinessModal(false);
              setActiveTab("businesses");
              setBusinessReloadKey((k) => k + 1);
            }}
          />
        )}

        {activeTab === "businesses" ? (
          <BusinessManager session={session} reloadKey={businessReloadKey} />
        ) : (
          <>
            <div className="relative mb-6">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 w-5 h-5 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ap.searchPlaceholder}
                className={`${CONTROL_CLASS} h-10 pl-10`}
              />
            </div>

            {reviewStatusError && (
              <p className="mb-3 text-xs font-medium text-red-500">{reviewStatusError}</p>
            )}

            {loading ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : filteredProgramGroups.length === 0 ? (
              <p className="text-sm text-slate-400">{search.trim() ? ap.searchEmptyMessage : ap.emptyMessage}</p>
            ) : (
              <div className="space-y-3">
                {filteredProgramGroups.map((program) => (
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
                    onSetReviewStatus={handleSetReviewStatus}
                    downloadingId={downloadingId}
                    onDeleteApplicant={handleDeleteApplicant}
                    deletingApplicantKey={deletingApplicantKey}
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
