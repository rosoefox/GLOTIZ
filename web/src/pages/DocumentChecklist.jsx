import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import LoginPopup from "../components/LoginPopup";
import { documentChecklist as dc, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { DocumentAutoFillContent } from "./DocumentAutoFill";

const GOV_STATUS_META = {
  generated: { label: "완성", tone: "success" },
  filled: { label: "AI 생성 대기", tone: "warning" },
  none: { label: "미작성", tone: "neutral" },
};

function GovTemplateGroup({ title, templates, submissions, onOpenFill }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">{title}</h2>
      </div>

      <Card className="divide-y divide-slate-100 p-2 ring-2 ring-brand-400">
        {templates.map((t) => {
          const submission = submissions[t.id];
          const statusKey =
            submission?.status === "generated" ? "generated" : submission?.status === "filled" ? "filled" : "none";
          const meta = GOV_STATUS_META[statusKey];
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    statusKey === "generated" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Icon name={statusKey === "generated" ? "checkCircle" : "documents"} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {t.form_number && <span className="mr-2 text-slate-400">{t.form_number}.</span>}
                    {t.name}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => onOpenFill(t)}
                >
                  <Icon name="sparkle" className="h-3.5 w-3.5" />
                  서류 작성하기
                </Button>
                <Badge tone={meta.tone}>{meta.label}</Badge>
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

export default function DocumentChecklist() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useAuth();
  const activeItemName = location.state?.itemName ?? null;

  const [selectedBusinessId, setSelectedBusinessId] = useState(location.state?.businessId ?? null);
  const [selectedBusinessName, setSelectedBusinessName] = useState(location.state?.businessName ?? null);

  const [govTemplates, setGovTemplates] = useState([]);
  const [govSubmissions, setGovSubmissions] = useState({});
  const [loadingGovTemplates, setLoadingGovTemplates] = useState(false);
  const [fillTarget, setFillTarget] = useState(null);

  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [progressByBusiness, setProgressByBusiness] = useState({});

  const refreshGovTemplates = async () => {
    if (!selectedBusinessId) return;
    setLoadingGovTemplates(true);
    const { data: templates } = await supabase
      .from("templates")
      .select("*")
      .eq("business_id", selectedBusinessId)
      .order("form_number");
    setGovTemplates(templates || []);

    const templateIds = (templates || []).map((t) => t.id);
    if (templateIds.length) {
      const { data: submissions } = await supabase
        .from("submissions")
        .select("*")
        .in("template_id", templateIds)
        .order("created_at", { ascending: false });
      const latestByTemplate = {};
      (submissions || []).forEach((s) => {
        if (!latestByTemplate[s.template_id]) latestByTemplate[s.template_id] = s;
      });
      setGovSubmissions(latestByTemplate);
    }
    setLoadingGovTemplates(false);
  };

  useEffect(() => {
    refreshGovTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusinessId]);

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

  const govDoneCount = Object.keys(govSubmissions).length;
  const govPercent = govTemplates.length ? Math.round((govDoneCount / govTemplates.length) * 100) : 0;

  return (
    <>
      <div className={`mx-auto max-w-6xl px-8 py-8 ${!isLoggedIn ? "pointer-events-none blur-sm" : ""}`}>
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
            onClick={() => {
              setSelectedBusinessId(null);
              setSelectedBusinessName(null);
            }}
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
                onOpenFill={(t) =>
                  setFillTarget({
                    templateId: t.id,
                    templateName: t.name,
                    businessId: selectedBusinessId,
                    businessName: selectedBusinessName,
                  })
                }
              />
              <Card className="mt-2 p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">서류 준비 현황</h3>
                    <p className="mt-1 text-sm text-slate-500">이 지원사업에 제출한 서류 진행률입니다.</p>
                  </div>
                  <span className="text-2xl font-extrabold text-brand-700">
                    {govPercent}% {dc.overallSuffix}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-brand-600 transition-all"
                    style={{ width: `${govPercent}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>0%</span>
                  <span>100%</span>
                </div>
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

      {fillTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setFillTarget(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">서류 작성하기</h2>
              <button
                type="button"
                onClick={() => setFillTarget(null)}
                aria-label="닫기"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <DocumentAutoFillContent
              templateId={fillTarget.templateId}
              templateName={fillTarget.templateName}
              businessId={fillTarget.businessId}
              businessName={fillTarget.businessName}
              onDone={() => {
                setFillTarget(null);
                refreshGovTemplates();
              }}
            />
          </div>
        </div>
      )}
      </div>

      {!isLoggedIn && (
        <LoginPopup onClose={() => navigate("/gov-support")} onSuccess={() => {}} />
      )}
    </>
  );
}
