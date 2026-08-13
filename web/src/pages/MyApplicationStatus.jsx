import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card } from "../components/ui";
import { myApplicationStatus as mas } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function reviewStatusKey(submission) {
  if (submission.review_status === "approved") return "approved";
  if (submission.review_status === "needs_revision") return "needsRevision";
  return "reviewing";
}

function ProgramRow({ index, program, expanded, onToggle }) {
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <p className="text-base font-bold text-slate-900">
          {index}) {program.businessName}
        </p>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-transform hover:bg-slate-50">
          <Icon name={expanded ? "x" : "plus"} className="h-3.5 w-3.5" />
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {program.documents.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">{mas.documentsEmptyMessage}</p>
          ) : (
            program.documents.map((doc) => (
              <div key={doc.templateId} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm font-medium text-slate-800">{doc.templateName}</p>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${mas.statusDotClasses[doc.statusKey]}`} />
                  {mas.statusLabels[doc.statusKey]}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

export default function MyApplicationStatus() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: subs } = await supabase
        .from("submissions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const templateIds = [...new Set((subs || []).map((s) => s.template_id))];
      const { data: templates } = templateIds.length
        ? await supabase.from("templates").select("id,name,business_id").in("id", templateIds)
        : { data: [] };
      const templateById = Object.fromEntries((templates || []).map((t) => [t.id, t]));

      const businessIds = [...new Set((templates || []).map((t) => t.business_id))];
      const { data: businesses } = businessIds.length
        ? await supabase.from("businesses").select("id,name").in("id", businessIds)
        : { data: [] };
      const businessNameById = Object.fromEntries((businesses || []).map((b) => [b.id, b.name]));

      const latestByTemplate = {};
      (subs || []).forEach((s) => {
        if (!latestByTemplate[s.template_id]) latestByTemplate[s.template_id] = s;
      });

      const byBusiness = {};
      Object.values(latestByTemplate).forEach((s) => {
        const template = templateById[s.template_id];
        if (!template) return;
        const businessId = template.business_id;
        if (!byBusiness[businessId]) {
          byBusiness[businessId] = {
            businessId,
            businessName: businessNameById[businessId] || "알 수 없는 공고",
            documents: [],
          };
        }
        byBusiness[businessId].documents.push({
          templateId: template.id,
          templateName: template.name,
          statusKey: reviewStatusKey(s),
        });
      });

      if (!cancelled) {
        setPrograms(Object.values(byBusiness));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <button
        type="button"
        onClick={() => navigate("/mypage")}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> 마이페이지로
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900">{mas.title}</h1>
      <p className="mt-2 mb-8 text-sm text-slate-500">{mas.subtitle}</p>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : programs.length === 0 ? (
        <p className="text-sm text-slate-400">{mas.emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {programs.map((program, idx) => (
            <ProgramRow
              key={program.businessId}
              index={idx + 1}
              program={program}
              expanded={expandedId === program.businessId}
              onToggle={() => setExpandedId((id) => (id === program.businessId ? null : program.businessId))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
