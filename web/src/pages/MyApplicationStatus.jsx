import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import SubmissionDetailModal from "../components/SubmissionDetailModal";
import { myApplicationStatus as mas } from "../data/mockData";
import { govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api, idsParam } from "../lib/api";
import { isClosed } from "../lib/period";
import { readDraft } from "../lib/draft";

function reviewStatusKey(submission) {
  if (submission.review_status === "approved") return "approved";
  if (submission.review_status === "needs_revision") return "needsRevision";
  return "reviewing";
}

function ProgramRow({ index, program, expanded, onToggle, onViewDocument, onGoToDocs, onFixDocument }) {
  const closed = program.closed;
  // 서류 하나라도 펼쳐보지 않아도 이 사업에 신경 쓸 게 있는지 한눈에 보이도록, 이름 앞에 그
  // 사업 안 서류들의 상태를 요약한 점을 찍는다 — 보완할 서류가 있으면 그게 최우선, 없고
  // 승인된 서류가 있으면 그다음 우선순위로 보여준다.
  const hasNeedsRevision = program.documents.some((d) => d.statusKey === "needsRevision");
  const hasApproved = program.documents.some((d) => d.statusKey === "approved");
  const programStatusKey = hasNeedsRevision ? "needsRevision" : hasApproved ? "approved" : null;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex w-full items-center justify-between gap-4 px-5 py-4">
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          {programStatusKey && (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${mas.statusDotClasses[programStatusKey]} ${
                hasNeedsRevision ? "animate-blink" : ""
              }`}
            />
          )}
          <p className="text-base font-bold text-slate-900">
            {index}) {program.businessName}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => onGoToDocs(program)}
            disabled={closed}
          >
            <Icon name="documents" className="w-5 h-5" />
            {closed ? "마감됨" : "확인하기"}
          </Button>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-transform hover:bg-slate-50"
          >
            <Icon name={expanded ? "x" : "plus"} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {program.documents.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">{mas.documentsEmptyMessage}</p>
          ) : (
            program.documents.map((doc) => {
              const isNeedsRevision = doc.statusKey === "needsRevision";
              const isApproved = doc.statusKey === "approved";
              const needsWriting = doc.statusKey === "notStarted" || doc.statusKey === "drafting";
              return (
                <div key={doc.templateId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="text-sm font-medium text-slate-800">{doc.templateName}</p>
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex items-center gap-1.5 text-xs font-semibold ${
                        isNeedsRevision ? "text-red-500" : isApproved ? "text-emerald-600" : "text-slate-600"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${mas.statusDotClasses[doc.statusKey]} ${
                          isNeedsRevision ? "animate-blink" : ""
                        }`}
                      />
                      {mas.statusLabels[doc.statusKey]}
                    </span>
                    {(isNeedsRevision || needsWriting) && (
                      <Button
                        type="button"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => onFixDocument(program, doc)}
                        disabled={closed}
                      >
                        {closed ? "마감됨" : isNeedsRevision ? "서류 수정하기" : "서류 작성하기"}
                      </Button>
                    )}
                    {doc.submissionId && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => onViewDocument(doc)}
                      >
                        확인하기
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}

export default function MyApplicationStatus() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);

  // 배너 문구는 반드시 아래 목록에 실제로 보이는 서류와 같은 개수여야 하므로, 별도 API로
  // 다시 세지 않고 화면에 이미 그리고 있는 programs(마감+미제출 사업은 제외된 상태)에서
  // 그대로 센다 — 그래야 "N건 있다"고 해놓고 목록에는 안 보이는 불일치가 안 생긴다.
  const needsRevisionCount = useMemo(
    () =>
      programs.reduce((sum, p) => sum + p.documents.filter((d) => d.statusKey === "needsRevision").length, 0),
    [programs]
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function loadBookmarks() {
      setLoadingBookmarks(true);
      const { bookmarks: rows } = await api.get("/bookmarks", session?.access_token).catch(() => ({ bookmarks: [] }));
      if (!rows?.length) {
        if (!cancelled) {
          setBookmarks([]);
          setLoadingBookmarks(false);
        }
        return;
      }
      const businessIds = rows.map((r) => r.business_id);
      const { businesses } = await api.get(`/businesses?${idsParam("id", businessIds)}`);
      const businessById = Object.fromEntries((businesses || []).map((b) => [b.id, b]));
      if (!cancelled) {
        setBookmarks(
          rows
            .filter((r) => businessById[r.business_id])
            .map((r) => ({
              bookmarkId: r.id,
              businessId: r.business_id,
              businessName: businessById[r.business_id].name,
              closed: isClosed(businessById[r.business_id], govAnnouncementDetails),
            }))
        );
        setLoadingBookmarks(false);
      }
    }
    loadBookmarks();
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  const removeBookmark = async (bookmark) => {
    setBookmarks((prev) => prev.filter((b) => b.bookmarkId !== bookmark.bookmarkId));
    try {
      await api.delete(`/bookmarks/${bookmark.bookmarkId}`, session?.access_token);
    } catch {
      // 무시 - 다음 새로고침 시 다시 반영됨
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { submissions: subs } = await api
        .get("/submissions", session?.access_token)
        .catch(() => ({ submissions: [] }));

      const templateIds = [...new Set((subs || []).map((s) => s.template_id))];
      const { templates } = templateIds.length
        ? await api.get(`/templates?${idsParam("id", templateIds)}`)
        : { templates: [] };
      const templateById = Object.fromEntries((templates || []).map((t) => [t.id, t]));

      const businessIds = [...new Set((templates || []).map((t) => t.business_id))];
      const { businesses } = businessIds.length
        ? await api.get(`/businesses?${idsParam("id", businessIds)}`)
        : { businesses: [] };
      const businessNameById = Object.fromEntries((businesses || []).map((b) => [b.id, b.name]));
      const businessById = Object.fromEntries((businesses || []).map((b) => [b.id, b]));

      // 마감된 공고인데 필수 서류를 다 못 낸 건 더 이상 손댈 수 없어 목록에 남겨둘 이유가
      // 없다 - 지워버리려면 "몇 개 냈는지"뿐 아니라 "원래 몇 개 내야 했는지"를 알아야 하니,
      // 제출 기록이 있는 서식뿐 아니라 그 사업의 서식 전체를 따로 가져온다.
      const { templates: allTemplates } = businessIds.length
        ? await api.get(`/templates?${idsParam("business_id", businessIds)}`)
        : { templates: [] };
      const requiredCountByBusiness = {};
      const templatesByBusiness = {};
      (allTemplates || []).forEach((t) => {
        if (t.reference_only) return;
        requiredCountByBusiness[t.business_id] = (requiredCountByBusiness[t.business_id] || 0) + 1;
        (templatesByBusiness[t.business_id] ||= []).push(t);
      });

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
            closed: isClosed(businessById[businessId], govAnnouncementDetails),
            documents: [],
          };
        }
        byBusiness[businessId].documents.push({
          templateId: template.id,
          templateName: template.name,
          statusKey: reviewStatusKey(s),
          submissionId: s.id,
          reviewedAt: s.reviewed_at,
        });
      });

      // 마감 + 필수 서류를 다 못 낸 경우만 목록에서 제거한다. 진행중인 공고는 완료 여부와
      // 상관없이 그대로 두고, 마감됐어도 다 낸 경우는 "마감된 지원사업"으로 남겨둔다. 이 판단은
      // 아래에서 "서류작성전" 항목을 채워 넣기 전, 실제로 제출한 서식 수만으로 해야 한다 —
      // 채운 뒤에는 항상 documents.length === required가 되어버려 이 필터가 무의미해진다.
      const visiblePrograms = Object.values(byBusiness).filter((p) => {
        if (!p.closed) return true;
        const required = requiredCountByBusiness[p.businessId] ?? p.documents.length;
        return p.documents.length >= required;
      });

      // 아직 한 번도 제출하지 않은 서식도 같이 보여준다 — "작성중"인지는 서버가 아니라 이
      // 브라우저에 남은 임시저장 여부로만 판단할 수 있다(임시저장은 의도적으로 서버에 올리지
      // 않는 값이라 관리자·다른 기기에서는 알 수 없다).
      visiblePrograms.forEach((program) => {
        const submittedIds = new Set(program.documents.map((d) => d.templateId));
        const businessTemplates = templatesByBusiness[program.businessId] || [];
        businessTemplates.forEach((t) => {
          if (submittedIds.has(t.id)) return;
          const hasDraft = Boolean(readDraft(user.id, t.id));
          program.documents.push({
            templateId: t.id,
            templateName: t.name,
            statusKey: hasDraft ? "drafting" : "notStarted",
            submissionId: null,
            reviewedAt: null,
          });
        });
        const sortOrderById = Object.fromEntries(businessTemplates.map((t) => [t.id, t.sort_order ?? 0]));
        program.documents.sort((a, b) => (sortOrderById[a.templateId] ?? 0) - (sortOrderById[b.templateId] ?? 0));
      });

      if (!cancelled) {
        setPrograms(visiblePrograms);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-3xl font-extrabold text-slate-900">{mas.title}</h1>
      <p className="mt-2 mb-8 text-sm text-slate-500">{mas.subtitle}</p>

      {needsRevisionCount > 0 && (
        <div className="mb-8 flex items-center gap-3 rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <Icon name="bell" className="w-5 h-5 shrink-0" />
          {mas.needsRevisionAlert.replace("{count}", needsRevisionCount)}
        </div>
      )}

      {!loadingBookmarks && bookmarks.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-slate-900">
            <Icon name="bookmark" filled className="w-5 h-5 text-brand-600" />
            북마크한 공고
          </h2>
          <div className="space-y-2">
            {bookmarks.map((b) => (
              <Card key={b.bookmarkId} className="flex items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => navigate(`/gov-support/${b.businessId}`)}
                  className="flex-1 text-left text-sm font-semibold text-slate-800 hover:text-brand-700"
                >
                  {b.businessName}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => navigate("/docs", { state: { businessId: b.businessId, businessName: b.businessName } })}
                    disabled={b.closed}
                  >
                    <Icon name="documents" className="w-5 h-5" />
                    {b.closed ? "마감됨" : "서류 작성하러 가기"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => removeBookmark(b)}
                    aria-label="북마크 해제"
                    className="text-brand-500 hover:text-brand-700"
                  >
                    <Icon name="bookmark" filled className="w-5 h-5" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-base font-bold text-slate-900">신청한 지원사업</h2>

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
              onViewDocument={(doc) => setViewingDoc(doc)}
              onFixDocument={(p, doc) => {
                if (p.closed) return;
                navigate(`/docs/fill/${doc.templateId}`, {
                  state: { templateName: doc.templateName, businessId: p.businessId, businessName: p.businessName },
                });
              }}
              onGoToDocs={(p) => {
                if (p.closed) return;
                navigate("/docs", { state: { businessId: p.businessId, businessName: p.businessName } });
              }}
            />
          ))}
        </div>
      )}

      {viewingDoc && (
        <SubmissionDetailModal
          submissionId={viewingDoc.submissionId}
          templateId={viewingDoc.templateId}
          templateName={viewingDoc.templateName}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}
