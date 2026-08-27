import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from "../components/ui";
import LoginPopup from "../components/LoginPopup";
import { documentChecklist as dc, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";
import { readErrorMessage } from "../lib/apiError";
import { readDraft } from "../lib/draft";
import { isClosed } from "../lib/period";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-none border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50";

// 진행률이 낮으면 노란색, 다 채워질수록 초록색이 되도록 두 색을 선형으로 보간한다.
function progressColor(percent) {
  const t = Math.max(0, Math.min(100, percent)) / 100;
  const from = { h: 45, s: 93, l: 47 }; // amber-400ish
  const to = { h: 152, s: 69, l: 40 }; // emerald-600ish
  const h = from.h + (to.h - from.h) * t;
  const s = from.s + (to.s - from.s) * t;
  const l = from.l + (to.l - from.l) * t;
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

// 서류 한 건의 상태들. dot 색을 서로 다르게 줘서 한눈에 구분되게 한다.
const STATUS_META = {
  notStarted: { label: "작성전", dot: "bg-slate-300", buttonLabel: "서류작성하기" },
  drafting: { label: "작성중", dot: "bg-amber-400", buttonLabel: "수정" },
  reviewing: { label: "심사중", dot: "bg-blue-400", buttonLabel: "수정" },
  needsRevision: { label: "서류보완필요", dot: "bg-red-500", buttonLabel: "보완하기" },
  reviewed: { label: "심사완료", dot: "bg-emerald-500", buttonLabel: "수정" },
};

function statusKeyFor(submission) {
  if (!submission) return null;
  if (submission.review_status === "approved") return "reviewed";
  if (submission.review_status === "needs_revision") return "needsRevision";
  return "reviewing";
}

function GovTemplateGroup({
  title,
  templates,
  submissions,
  percentByTemplate,
  onOpenFill,
  onUploadFile,
  uploadingTemplateId,
  accountDocs,
  onImportFromAccount,
  importingTemplateId,
  closed = false,
}) {
  if (templates.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">{title}</h2>
      </div>

      <Card className="divide-y divide-slate-100 p-2 ring-2 ring-brand-400">
        {templates.map((t) => {
          const submission = submissions[t.id];
          const statusKey = statusKeyFor(submission) || (percentByTemplate[t.id] > 0 ? "drafting" : "notStarted");
          const meta = STATUS_META[statusKey];
          const isUploading = uploadingTemplateId === t.id;
          const isImporting = importingTemplateId === t.id;
          const percent = percentByTemplate[t.id] ?? 0;
          const importableDoc = t.linked_account_doc_type ? accountDocs?.[t.linked_account_doc_type] : null;
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Icon
                  name={statusKey === "reviewed" ? "checkCircle" : "documents"}
                  className={`w-5 h-5 shrink-0 ${
                    statusKey === "reviewed"
                      ? "text-emerald-600"
                      : statusKey === "needsRevision"
                        ? "text-red-500"
                        : "text-slate-500"
                  }`}
                />
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {t.form_number && <span className="text-slate-400">{t.form_number}.</span>}
                    {t.name}
                  </p>
                  {!t.user_upload_required && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: progressColor(percent) }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-400">{percent}%</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {t.user_upload_required ? (
                  <>
                    <a href="#" target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON_CLASS}>
                      <Icon name="externalLink" className="w-5 h-5" />
                      {dc.issueLinkLabel}
                    </a>
                    {importableDoc && (
                      <button
                        type="button"
                        className={`${SECONDARY_BUTTON_CLASS} ${isImporting ? "opacity-50" : ""}`}
                        disabled={closed || isImporting}
                        onClick={() => onImportFromAccount(t)}
                      >
                        <Icon name="documents" className="w-5 h-5" />
                        {closed ? "마감됨" : isImporting ? dc.importingLabel : dc.importButtonLabel}
                      </button>
                    )}
                    <label className={`${closed ? "pointer-events-none opacity-50" : "cursor-pointer"} ${SECONDARY_BUTTON_CLASS} ${isUploading ? "opacity-50" : ""}`}>
                      <Icon name="upload" className="w-5 h-5" />
                      {closed ? "마감됨" : isUploading ? dc.uploadingLabel : dc.uploadButtonLabel}
                      <input
                        type="file"
                        className="hidden"
                        disabled={closed || isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.target.value = "";
                          if (file) onUploadFile(t, file);
                        }}
                      />
                    </label>
                    <Badge
                      tone={
                        !submission
                          ? "neutral"
                          : statusKey === "needsRevision"
                            ? "danger"
                            : statusKey === "reviewed"
                              ? "success"
                              : "neutral"
                      }
                    >
                      {!submission
                        ? "미제출"
                        : statusKey === "needsRevision"
                          ? "업로드 필요"
                          : statusKey === "reviewed"
                            ? "승인 완료"
                            : "업로드 완료"}
                    </Badge>
                  </>
                ) : (
                  <>
                    <span
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        statusKey === "needsRevision"
                          ? "text-red-500"
                          : statusKey === "reviewed"
                            ? "text-emerald-600"
                            : "text-slate-500"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${statusKey === "needsRevision" ? "animate-blink" : ""}`} />
                      {meta.label}
                    </span>
                    <Button
                      variant="secondary"
                      className={`px-3 py-1.5 text-xs ${
                        statusKey === "needsRevision" ? "border-red-300 text-red-600 hover:bg-red-50" : ""
                      }`}
                      onClick={() => onOpenFill(t)}
                      disabled={closed || statusKey === "reviewed"}
                    >
                      {closed ? "마감됨" : meta.buttonLabel}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// 참고서류: 제출 대상이 아니라 다운로드만 받는 파일이라, 진행률/상태 표시 없이
// 이름 + 다운로드 버튼만 있는 훨씬 단순한 목록으로 따로 보여준다.
function ReferenceDocGroup({ title, templates, onDownload }) {
  if (templates.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">{title}</h2>
      </div>
      <Card className="divide-y divide-slate-100 p-2">
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Icon name="documents" className="w-5 h-5 shrink-0 text-slate-500" />
              <p className="font-semibold text-slate-900">{t.name}</p>
            </div>
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => onDownload(t)}>
              <Icon name="download" className="w-5 h-5" />
              다운로드
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function orgNameFor(business) {
  // 실제로 관리자가 등록한 공고 정보(business.basic_info)를 최우선으로 쓰고, 예전에 미리
  // 채워둔 데모용 목업(govAnnouncementDetails)은 그 정보가 없는 경우에만 참고한다 — 반대
  // 순서였을 때는 실제 공고에도 항상 목업이 없다는 이유로 하드코딩된 문구만 나왔었다.
  const detail = business.basic_info || govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function ProgramCard({ business, progress, onClick }) {
  const { done, total } = progress;
  const complete = total > 0 && done >= total;
  const closed = isClosed(business, govAnnouncementDetails);
  return (
    <Card
      interactive={!closed}
      onClick={closed ? undefined : onClick}
      className={`relative flex h-full flex-col justify-between overflow-hidden p-4 ${
        closed ? "cursor-not-allowed grayscale" : complete ? "ring-2 ring-emerald-300" : "ring-2 ring-amber-300"
      }`}
    >
      {closed && <div className="absolute inset-0 z-10 rounded-none bg-slate-200/50" aria-hidden="true" />}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge tone="brand">모집 공고</Badge>
          {closed ? (
            <Badge tone="neutral">마감</Badge>
          ) : (
            <Badge tone={complete ? "success" : "warning"}>
              <Icon name={complete ? "checkCircle" : "history"} className="w-3.5 h-3.5" />
              제출 {done}/{total}
            </Badge>
          )}
        </div>
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-slate-900">{business.name}</h3>
      </div>
      <p className="mt-3 truncate text-xs text-slate-400">모집처: {orgNameFor(business)}</p>
    </Card>
  );
}

function ProgramPicker({ programs, progressByBusiness, loading, onSelect }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-base font-bold text-slate-900">내가 신청한 사업</h2>
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : programs.length === 0 ? (
        <p className="text-sm text-slate-400">아직 서류를 제출한 지원사업이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {programs.map((b) => (
            <ProgramCard
              key={b.id}
              business={b}
              progress={progressByBusiness[b.id] || { done: 0, total: 0 }}
              onClick={() => onSelect(b)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function DocumentChecklist() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn, session, ready } = useAuth();
  const showLoginGate = ready && !isLoggedIn;
  const activeItemName = location.state?.itemName ?? null;

  const [selectedBusinessId, setSelectedBusinessId] = useState(location.state?.businessId ?? null);
  const [selectedBusinessName, setSelectedBusinessName] = useState(location.state?.businessName ?? null);
  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const [govTemplates, setGovTemplates] = useState([]);
  const [govSubmissions, setGovSubmissions] = useState({});
  const [percentByTemplate, setPercentByTemplate] = useState({});
  const [loadingGovTemplates, setLoadingGovTemplates] = useState(false);
  const [uploadingTemplateId, setUploadingTemplateId] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [accountDocs, setAccountDocs] = useState({});
  const [importingTemplateId, setImportingTemplateId] = useState(null);

  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [progressByBusiness, setProgressByBusiness] = useState({});
  const selectedBusinessClosed = selectedBusiness ? isClosed(selectedBusiness, govAnnouncementDetails) : false;

  useEffect(() => {
    if (!selectedBusinessId) {
      setSelectedBusiness(null);
      return;
    }
    let cancelled = false;
    api.get(`/businesses/${selectedBusinessId}`).then((business) => {
      if (cancelled) return;
      setSelectedBusiness(business);
      setSelectedBusinessName((prev) => prev || business?.name || null);
    }).catch(() => {
      if (!cancelled) setSelectedBusiness(null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBusinessId]);

  const refreshGovTemplates = async () => {
    if (!selectedBusinessId) return;
    setLoadingGovTemplates(true);
    const { templates } = await api.get(`/templates?business_id=${selectedBusinessId}&order_by=form_number`);
    setGovTemplates(templates || []);

    const templateIds = (templates || []).map((t) => t.id);
    if (!templateIds.length) {
      setGovSubmissions({});
      setPercentByTemplate({});
      setLoadingGovTemplates(false);
      return;
    }

    const [{ submissions }, { fields: allFields }] = await Promise.all([
      api.get(`/submissions?${idsParam("template_id", templateIds)}`, session?.access_token),
      api.get(`/template_fields?${idsParam("template_id", templateIds)}`),
    ]);

    const latestByTemplate = {};
    (submissions || []).forEach((s) => {
      if (!latestByTemplate[s.template_id]) latestByTemplate[s.template_id] = s;
    });
    setGovSubmissions(latestByTemplate);

    const fieldCountByTemplate = {};
    (allFields || []).forEach((f) => {
      fieldCountByTemplate[f.template_id] = (fieldCountByTemplate[f.template_id] || 0) + 1;
    });

    const submittedSubmissionIds = Object.values(latestByTemplate).map((s) => s.id);
    const { values: allValues } = submittedSubmissionIds.length
      ? await api.get(`/submission_values?${idsParam("submission_id", submittedSubmissionIds)}`, session?.access_token)
      : { values: [] };
    const filledCountBySubmission = {};
    (allValues || []).forEach((v) => {
      if (v.value) filledCountBySubmission[v.submission_id] = (filledCountBySubmission[v.submission_id] || 0) + 1;
    });

    const percent = {};
    (templates || []).forEach((t) => {
      if (t.user_upload_required || t.reference_only) return;
      const total = fieldCountByTemplate[t.id] || 0;
      if (!total) {
        percent[t.id] = 0;
        return;
      }
      const submission = latestByTemplate[t.id];
      if (submission) {
        percent[t.id] = Math.round(((filledCountBySubmission[submission.id] || 0) / total) * 100);
      } else if (user?.id) {
        const draft = readDraft(user.id, t.id);
        const filled = draft ? Object.values(draft).filter(Boolean).length : 0;
        percent[t.id] = Math.round((filled / total) * 100);
      } else {
        percent[t.id] = 0;
      }
    });
    setPercentByTemplate(percent);

    setLoadingGovTemplates(false);
  };

  useEffect(() => {
    refreshGovTemplates();
    // location.key changes on every navigation (e.g. 임시저장 후 목록으로 돌아왔을 때)
    // even when selectedBusinessId is unchanged, so 진행률이 최신 초안을 반영하도록 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusinessId, location.key]);

  // 마이페이지 서류 슬롯(사업자 등록증/상품 상세설명서)에 등록된 파일 유무를 미리 조회해서
  // "마이페이지에서 가져오기" 버튼을 보여줄지 판단한다.
  useEffect(() => {
    if (!session) {
      setAccountDocs({});
      return;
    }
    let cancelled = false;
    Promise.all(
      ["biz_reg", "product_spec"].map((docType) =>
        fetch(`${BACKEND_URL}/account/documents?doc_type=${docType}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((res) => (res.ok ? res.json() : { documents: [] }))
          .then((data) => [docType, data.documents?.[0] || null])
      )
    ).then((entries) => {
      if (!cancelled) setAccountDocs(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // 지원사업을 선택하지 않은 상태(사이드바에서 바로 진입)면, 내가 서류를
  // 하나라도 제출한 사업만 목록에 보여주고, 각 사업의 제출 현황(N/전체)을 표시한다.
  useEffect(() => {
    if (selectedBusinessId) return;
    let cancelled = false;
    async function loadPrograms() {
      setLoadingPrograms(true);
      if (!user?.id) {
        if (!cancelled) {
          setPrograms([]);
          setProgressByBusiness({});
          setLoadingPrograms(false);
        }
        return;
      }

      const { submissions: subs } = await api.get("/submissions", session?.access_token);
      const submittedTemplateIds = [...new Set((subs || []).map((s) => s.template_id))];

      if (!submittedTemplateIds.length) {
        if (!cancelled) {
          setPrograms([]);
          setProgressByBusiness({});
          setLoadingPrograms(false);
        }
        return;
      }

      const { templates: submittedTemplates } = await api.get(
        `/templates?${idsParam("id", submittedTemplateIds)}`
      );
      const businessIds = [...new Set((submittedTemplates || []).map((t) => t.business_id))];

      const [{ businesses }, { templates: allTemplates }] = await Promise.all([
        api.get(`/businesses?${idsParam("id", businessIds)}`),
        api.get(`/templates?${idsParam("business_id", businessIds)}`),
      ]);

      const submittedByBusiness = {};
      (submittedTemplates || []).forEach((t) => {
        (submittedByBusiness[t.business_id] ??= new Set()).add(t.id);
      });
      const totalByBusiness = {};
      (allTemplates || []).forEach((t) => {
        if (t.reference_only) return; // 참고서류는 제출 대상이 아니라 카운트에서 뺀다.
        totalByBusiness[t.business_id] = (totalByBusiness[t.business_id] || 0) + 1;
      });

      const progress = {};
      businessIds.forEach((id) => {
        progress[id] = { done: submittedByBusiness[id]?.size || 0, total: totalByBusiness[id] || 0 };
      });

      if (!cancelled) {
        setPrograms(businesses || []);
        setProgressByBusiness(progress);
        setLoadingPrograms(false);
      }
    }
    loadPrograms();
    return () => {
      cancelled = true;
    };
  }, [selectedBusinessId, user?.id]);

  const handleSelectProgram = (business) => {
    setSelectedBusinessId(business.id);
    setSelectedBusinessName(business.name);
    setSelectedBusiness(business);
  };

  const handleOpenFill = (template) => {
    if (selectedBusinessClosed) return;
    navigate(`/docs/fill/${template.id}`, {
      state: {
        templateName: template.name,
        businessId: selectedBusinessId,
        businessName: selectedBusinessName,
      },
    });
  };

  const handleUploadFile = async (template, file) => {
    if (selectedBusinessClosed) return;
    if (!session) return;
    setUploadingTemplateId(template.id);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("template_id", template.id);
      form.append("file", file);
      const res = await fetch(`${BACKEND_URL}/submissions/user-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "파일 업로드에 실패했습니다."));
      await refreshGovTemplates();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingTemplateId(null);
    }
  };

  const handleImportFromAccount = async (template) => {
    if (selectedBusinessClosed) return;
    if (!session) return;
    setImportingTemplateId(template.id);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("template_id", template.id);
      const res = await fetch(`${BACKEND_URL}/submissions/import-from-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "마이페이지 서류를 가져오지 못했습니다."));
      await refreshGovTemplates();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setImportingTemplateId(null);
    }
  };

  // 참고서류는 제출 대상이 아니라서 3그룹으로 나눠 보여준다 — 진행률 계산에서도 뺀다.
  const referenceTemplates = govTemplates.filter((t) => t.reference_only);
  const userUploadTemplates = govTemplates.filter((t) => t.user_upload_required && !t.reference_only);
  const autoFillTemplates = govTemplates.filter((t) => !t.user_upload_required && !t.reference_only);

  const perTemplatePercents = govTemplates
    .filter((t) => !t.reference_only)
    .map((t) =>
      t.user_upload_required
        ? govSubmissions[t.id] && govSubmissions[t.id].review_status !== "needs_revision"
          ? 100
          : 0
        : percentByTemplate[t.id] ?? 0
    );
  const govPercent = perTemplatePercents.length
    ? Math.round(perTemplatePercents.reduce((sum, p) => sum + p, 0) / perTemplatePercents.length)
    : 0;

  const handleDownloadReference = async (t) => {
    try {
      const { url } = await api.get(
        `/generated-file-url?path=${encodeURIComponent(t.original_file_path)}&bucket=templates`,
        session?.access_token
      );
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // 다운로드 실패는 조용히 무시 - 버튼을 다시 누르면 재시도된다.
    }
  };

  return (
    <>
      <div className={`mx-auto max-w-6xl px-8 py-8 ${showLoginGate ? "pointer-events-none blur-sm" : ""}`}>
      <h1 className="text-2xl font-bold text-slate-900">{dc.title}</h1>

      <div className="mt-1 mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        {activeItemName && (
          <>
            <span className="font-semibold text-slate-700">&ldquo;{activeItemName}&rdquo;</span>
            <span>·</span>
          </>
        )}
        <span>{dc.subtitle}</span>
      </div>

      {selectedBusinessId ? (
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-400">내가 선택한 지원사업</p>
              <h2 className="text-lg font-bold text-slate-900">{selectedBusinessName}</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/gov-support/${selectedBusinessId}`, { state: { from: "docs" } })}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Icon name="documents" className="w-4 h-4" /> 공고 확인하기
            </button>
          </div>
          {selectedBusinessClosed && (
            <div className="mb-4 rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              접수 마감된 지원사업입니다. 서류 작성, 업로드, 가져오기를 진행할 수 없습니다.
            </div>
          )}

          {loadingGovTemplates ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : govTemplates.length > 0 ? (
            <>
              <ReferenceDocGroup title="참고서류" templates={referenceTemplates} onDownload={handleDownloadReference} />
              <GovTemplateGroup
                title="사용자 제출서류"
                templates={userUploadTemplates}
                submissions={govSubmissions}
                percentByTemplate={percentByTemplate}
                onOpenFill={handleOpenFill}
                onUploadFile={handleUploadFile}
                uploadingTemplateId={uploadingTemplateId}
                accountDocs={accountDocs}
                onImportFromAccount={handleImportFromAccount}
                importingTemplateId={importingTemplateId}
                closed={selectedBusinessClosed}
              />
              <GovTemplateGroup
                title="자동완성 서류"
                templates={autoFillTemplates}
                submissions={govSubmissions}
                percentByTemplate={percentByTemplate}
                onOpenFill={handleOpenFill}
                onUploadFile={handleUploadFile}
                uploadingTemplateId={uploadingTemplateId}
                accountDocs={accountDocs}
                onImportFromAccount={handleImportFromAccount}
                importingTemplateId={importingTemplateId}
                closed={selectedBusinessClosed}
              />
              {uploadError && (
                <p className="mb-4 text-xs font-medium text-red-500">{uploadError}</p>
              )}
              <Card className="mt-2">
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>전체 서류 준비 현황</CardTitle>
                    <CardDescription className="mt-1">이 지원사업에 필요한 전체 서류의 작성 진행률입니다.</CardDescription>
                  </div>
                  <span className="text-2xl font-extrabold" style={{ color: progressColor(govPercent) }}>
                    {govPercent}% {dc.overallSuffix}
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{ width: `${govPercent}%`, backgroundColor: progressColor(govPercent) }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-400">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </CardContent>
                {govPercent === 100 && (
                  <CardFooter>
                    <Link
                      to="/marketing"
                      className="flex w-full items-center justify-center gap-1.5 rounded-none bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      <Icon name="sparkle" className="w-5 h-5" />
                      마케팅을 위한 AI 이미지 생성하러 가기
                    </Link>
                  </CardFooter>
                )}
              </Card>
            </>
          ) : (
            <p className="text-sm text-slate-400">등록된 제출 서류가 없습니다.</p>
          )}
        </div>
      ) : (
        <ProgramPicker
          programs={programs}
          progressByBusiness={progressByBusiness}
          loading={loadingPrograms}
          onSelect={handleSelectProgram}
        />
      )}
      </div>

      {showLoginGate && (
        <LoginPopup onClose={() => navigate("/gov-support")} onSuccess={() => {}} />
      )}
    </>
  );
}
