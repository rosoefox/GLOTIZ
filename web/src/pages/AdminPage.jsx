import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { brand, adminPanel as ap } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const STATUS_META = {
  generated: { label: ap.statusLabels.generated, tone: "success" },
  filled: { label: ap.statusLabels.filled, tone: "warning" },
  none: { label: ap.statusLabels.none, tone: "neutral" },
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

function ApplicantRow({ applicant, expanded, onToggle, onViewSubmission, onDownload }) {
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
              <p className="mb-2 text-sm font-bold text-slate-800">{program.businessName}</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {program.items.map((item) => {
                  const meta = STATUS_META[item.statusKey];
                  return (
                    <div
                      key={item.submission.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.templateName}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(item.submission.created_at).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => onViewSubmission(item)}
                        >
                          <Icon name="eye" className="h-3.5 w-3.5" />
                          {ap.viewDocumentLabel}
                        </Button>
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

export default function AdminPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [viewingSubmission, setViewingSubmission] = useState(null);

  useEffect(() => {
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
        bucket.byBusiness[businessId].items.push({
          submission,
          templateName: template.name,
          statusKey: submission.status === "generated" ? "generated" : submission.status === "filled" ? "filled" : "none",
          generatedPath: generatedPathBySubmission[submission.id] || null,
        });
      }

      const list = Object.values(byUser)
        .map((bucket) => ({
          userId: bucket.userId,
          name: bucket.name || `${ap.applicantFallbackName} (${bucket.userId.slice(0, 8)})`,
          submissions: bucket.submissions,
          programs: Object.values(bucket.byBusiness),
          lastUpdated: new Date(bucket.lastUpdated).toLocaleDateString("ko-KR"),
        }))
        .sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));

      setApplicants(list);
      setLoading(false);
    }
    load();
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
              />
            ))}
          </div>
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
