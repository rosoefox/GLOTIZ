import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import LoginPopup from "../components/LoginPopup";
import { documentChecklist as dc, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";
import { readDraft } from "../lib/draft";
import { orderedSelect } from "../lib/supabaseOrder";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50";

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
}) {
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
          const percent = percentByTemplate[t.id] ?? 0;
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    statusKey === "reviewed"
                      ? "bg-emerald-50 text-emerald-600"
                      : statusKey === "needsRevision"
                        ? "bg-red-50 text-red-500"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Icon name={statusKey === "reviewed" ? "checkCircle" : "documents"} className="h-5 w-5" />
                </div>
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
                    <button type="button" className={SECONDARY_BUTTON_CLASS}>
                      <Icon name="externalLink" className="h-3.5 w-3.5" />
                      {dc.issueLinkLabel}
                    </button>
                    <label className={`cursor-pointer ${SECONDARY_BUTTON_CLASS} ${isUploading ? "opacity-50" : ""}`}>
                      <Icon name="upload" className="h-3.5 w-3.5" />
                      {isUploading ? dc.uploadingLabel : dc.uploadButtonLabel}
                      <input
                        type="file"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.target.value = "";
                          if (file) onUploadFile(t, file);
                        }}
                      />
                    </label>
                    <Badge tone={submission ? "success" : "neutral"}>{submission ? "업로드 완료" : "미제출"}</Badge>
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
                    >
                      {meta.buttonLabel}
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

function orgNameFor(business) {
  const detail = govAnnouncementDetails[business.id];
  return detail?.recruiter || detail?.org || "전북 지원사업 포털";
}

function ProgramCard({ business, progress, onClick }) {
  const { done, total } = progress;
  const complete = total > 0 && done >= total;
  return (
    <Card
      onClick={onClick}
      className={`flex h-full cursor-pointer flex-col justify-between overflow-hidden p-4 transition-shadow hover:shadow-md ${
        complete ? "ring-2 ring-emerald-300" : "ring-2 ring-amber-300"
      }`}
    >
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge tone="brand">모집 공고</Badge>
          <Badge tone={complete ? "success" : "warning"}>
            <Icon name={complete ? "checkCircle" : "history"} className="h-3 w-3" />
            제출 {done}/{total}
          </Badge>
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

  const [govTemplates, setGovTemplates] = useState([]);
  const [govSubmissions, setGovSubmissions] = useState({});
  const [percentByTemplate, setPercentByTemplate] = useState({});
  const [loadingGovTemplates, setLoadingGovTemplates] = useState(false);
  const [uploadingTemplateId, setUploadingTemplateId] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [progressByBusiness, setProgressByBusiness] = useState({});

  const refreshGovTemplates = async () => {
    if (!selectedBusinessId) return;
    setLoadingGovTemplates(true);
    const { data: templates } = await orderedSelect(
      () => supabase.from("templates").select("*").eq("business_id", selectedBusinessId),
      "form_number"
    );
    setGovTemplates(templates || []);

    const templateIds = (templates || []).map((t) => t.id);
    if (!templateIds.length) {
      setGovSubmissions({});
      setPercentByTemplate({});
      setLoadingGovTemplates(false);
      return;
    }

    const [{ data: submissions }, { data: allFields }] = await Promise.all([
      supabase.from("submissions").select("*").in("template_id", templateIds).order("created_at", { ascending: false }),
      supabase.from("template_fields").select("id,template_id").in("template_id", templateIds),
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
    const { data: allValues } = submittedSubmissionIds.length
      ? await supabase.from("submission_values").select("submission_id,value").in("submission_id", submittedSubmissionIds)
      : { data: [] };
    const filledCountBySubmission = {};
    (allValues || []).forEach((v) => {
      if (v.value) filledCountBySubmission[v.submission_id] = (filledCountBySubmission[v.submission_id] || 0) + 1;
    });

    const percent = {};
    (templates || []).forEach((t) => {
      if (t.user_upload_required) return;
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

      const { data: subs } = await supabase
        .from("submissions")
        .select("template_id")
        .eq("user_id", user.id);
      const submittedTemplateIds = [...new Set((subs || []).map((s) => s.template_id))];

      if (!submittedTemplateIds.length) {
        if (!cancelled) {
          setPrograms([]);
          setProgressByBusiness({});
          setLoadingPrograms(false);
        }
        return;
      }

      const { data: submittedTemplates } = await supabase
        .from("templates")
        .select("id,business_id")
        .in("id", submittedTemplateIds);
      const businessIds = [...new Set((submittedTemplates || []).map((t) => t.business_id))];

      const [{ data: businesses }, { data: allTemplates }] = await Promise.all([
        supabase.from("businesses").select("*").in("id", businessIds).order("created_at", { ascending: false }),
        supabase.from("templates").select("id,business_id").in("business_id", businessIds),
      ]);

      const submittedByBusiness = {};
      (submittedTemplates || []).forEach((t) => {
        (submittedByBusiness[t.business_id] ??= new Set()).add(t.id);
      });
      const totalByBusiness = {};
      (allTemplates || []).forEach((t) => {
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
  };

  const handleOpenFill = (template) => {
    navigate(`/docs/fill/${template.id}`, {
      state: {
        templateName: template.name,
        businessId: selectedBusinessId,
        businessName: selectedBusinessName,
      },
    });
  };

  const handleUploadFile = async (template, file) => {
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

  const perTemplatePercents = govTemplates.map((t) =>
    t.user_upload_required ? (govSubmissions[t.id] ? 100 : 0) : percentByTemplate[t.id] ?? 0
  );
  const govPercent = perTemplatePercents.length
    ? Math.round(perTemplatePercents.reduce((sum, p) => sum + p, 0) / perTemplatePercents.length)
    : 0;

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
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <Icon name="arrowLeft" className="h-4 w-4" /> 지원사업 목록으로
          </button>

          <div className="mb-3">
            <p className="text-xs font-semibold text-slate-400">내가 선택한 지원사업</p>
            <h2 className="text-lg font-bold text-slate-900">{selectedBusinessName}</h2>
          </div>

          {loadingGovTemplates ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : govTemplates.length > 0 ? (
            <>
              <GovTemplateGroup
                title="제출 서류"
                templates={govTemplates}
                submissions={govSubmissions}
                percentByTemplate={percentByTemplate}
                onOpenFill={handleOpenFill}
                onUploadFile={handleUploadFile}
                uploadingTemplateId={uploadingTemplateId}
              />
              {uploadError && (
                <p className="mb-4 text-xs font-medium text-red-500">{uploadError}</p>
              )}
              <Card className="mt-2 p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">전체 서류 준비 현황</h3>
                    <p className="mt-1 text-sm text-slate-500">이 지원사업에 필요한 전체 서류의 작성 진행률입니다.</p>
                  </div>
                  <span className="text-2xl font-extrabold" style={{ color: progressColor(govPercent) }}>
                    {govPercent}% {dc.overallSuffix}
                  </span>
                </div>
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
                {govPercent === 100 && (
                  <Link
                    to="/marketing"
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    <Icon name="sparkle" className="h-3.5 w-3.5" />
                    마케팅을 위한 AI 이미지 생성하러 가기
                  </Link>
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
