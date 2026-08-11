import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { documentChecklist as dc } from "../data/mockData";
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
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          {title}
          <Badge tone="brand">선택한 지원사업</Badge>
        </h2>
      </div>

      <Card className="divide-y divide-slate-100 p-2 ring-2 ring-brand-400">
        {templates.map((t) => {
          const submission = submissions[t.id];
          const statusKey =
            submission?.status === "generated" ? "generated" : submission?.status === "filled" ? "filled" : "none";
          const meta = GOV_STATUS_META[statusKey];
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    statusKey === "generated" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Icon name={statusKey === "generated" ? "checkCircle" : "documents"} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  {t.form_number && <p className="mt-0.5 text-sm text-slate-500">{t.form_number}</p>}
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

const DOC_ICONS = {
  "doc-invoice": "documents",
  "doc-packing": "box",
  "doc-co": "checkCircle",
};

function UploadChecklistItem({ item, state, onFileSelect }) {
  const navigate = useNavigate();
  const status = state.status;
  const [shortName, detail] = (() => {
    const match = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    return match ? [match[1], match[2]] : [item.name, item.description];
  })();

  const statusLabel =
    status === "done" ? dc.uploadedLabel : status === "uploading" ? dc.uploadingLabel : dc.waitingLabel;
  const statusColor =
    status === "done" ? "text-emerald-600" : status === "uploading" ? "text-brand-600" : "text-slate-400";
  const barColor = status === "done" ? "bg-emerald-500" : "bg-brand-600";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon name={DOC_ICONS[item.id] || "documents"} className="h-6 w-6" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{shortName}</p>
          <p className="text-xs text-slate-400">{detail}</p>
        </div>
      </div>

      <div className="w-full sm:w-56">
        <div className="mb-1 flex items-center justify-between text-xs font-medium">
          <span className={`flex items-center gap-1 ${statusColor}`}>
            {status === "done" && <Icon name="checkCircle" className="h-3.5 w-3.5" />}
            {statusLabel}
          </span>
          <span className="text-slate-500">{state.progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${state.progress}%` }} />
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs"
          onClick={() =>
            item.id === "doc-invoice"
              ? navigate("/docs/new")
              : navigate("/docs/preview", { state: { docName: item.name } })
          }
        >
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
          {dc.issueLinkLabel}
        </Button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
          {status === "uploading" ? (
            <Icon name="history" className="h-3.5 w-3.5 animate-spin" />
          ) : status === "done" ? (
            <Icon name="check" className="h-3.5 w-3.5" />
          ) : (
            <Icon name="upload" className="h-3.5 w-3.5" />
          )}
          {status === "done" ? dc.reuploadButtonLabel : dc.uploadButtonLabel}
          <input
            type="file"
            className="hidden"
            onChange={(e) => onFileSelect(item.id, e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}

export default function DocumentChecklist() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeItemName = location.state?.itemName ?? null;
  const businessId = location.state?.businessId ?? null;
  const businessName = location.state?.businessName ?? null;

  const [govTemplates, setGovTemplates] = useState([]);
  const [govSubmissions, setGovSubmissions] = useState({});
  const [loadingGovTemplates, setLoadingGovTemplates] = useState(false);
  const [fillTarget, setFillTarget] = useState(null);

  const refreshGovTemplates = async () => {
    if (!businessId) return;
    setLoadingGovTemplates(true);
    const { data: templates } = await supabase
      .from("templates")
      .select("*")
      .eq("business_id", businessId)
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
  }, [businessId]);

  const [uploadState, setUploadState] = useState(() =>
    Object.fromEntries(
      dc.commonGroup.items.map((it, idx) => [
        it.id,
        idx === 1 ? { status: "done", progress: 100 } : { status: "waiting", progress: 0 },
      ])
    )
  );

  const handleFileSelect = (itemId, file) => {
    if (!file) return;
    setUploadState((prev) => ({ ...prev, [itemId]: { status: "uploading", progress: 0 } }));
    const interval = setInterval(() => {
      setUploadState((prev) => {
        const cur = prev[itemId];
        if (!cur || cur.status !== "uploading") {
          clearInterval(interval);
          return prev;
        }
        const nextProgress = Math.min(cur.progress + 20, 100);
        if (nextProgress >= 100) {
          clearInterval(interval);
          return { ...prev, [itemId]: { status: "done", progress: 100 } };
        }
        return { ...prev, [itemId]: { status: "uploading", progress: nextProgress } };
      });
    }, 200);
  };

  const doneCount = Object.values(uploadState).filter((s) => s.status === "done").length;
  const overallPercent = Math.round((doneCount / dc.commonGroup.items.length) * 100);

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
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-base font-bold text-slate-900">{dc.commonGroup.title}</h2>
        <div className="space-y-4">
          {dc.commonGroup.items.map((item) => (
            <UploadChecklistItem
              key={item.id}
              item={item}
              state={uploadState[item.id]}
              onFileSelect={handleFileSelect}
            />
          ))}
        </div>

        <Card className="mt-6 p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{dc.overallTitle}</h3>
              <p className="mt-1 text-sm text-slate-500">{dc.overallDescription}</p>
            </div>
            <span className="text-2xl font-extrabold text-brand-700">
              {overallPercent}% {dc.overallSuffix}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-brand-600 transition-all"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span>100%</span>
          </div>

          {overallPercent === 100 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <Icon name="checkCircle" className="h-4 w-4" />
              필수 서류 준비가 완료되었습니다.
              <span className="ml-auto flex items-center gap-1 text-brand-700">
                다음 단계를 진행하세요
                <Icon name="arrowRight" className="h-4 w-4" />
              </span>
            </div>
          )}
        </Card>
      </div>

      {businessId &&
        (loadingGovTemplates ? (
          <p className="mb-8 text-sm text-slate-400">불러오는 중...</p>
        ) : govTemplates.length > 0 ? (
          <GovTemplateGroup
            title={businessName ? `${businessName} 제출서류` : "필수 제출 서류"}
            templates={govTemplates}
            submissions={govSubmissions}
            onOpenFill={(t) =>
              setFillTarget({ templateId: t.id, templateName: t.name, businessId, businessName })
            }
          />
        ) : null)}

      <button
        type="button"
        onClick={() => navigate("/docs/new")}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-800 px-6 py-4 text-base font-bold text-white hover:bg-brand-900"
      >
        {dc.addDocButtonLabel}
        <Icon name="arrowRight" className="h-5 w-5" />
      </button>

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
  );
}
