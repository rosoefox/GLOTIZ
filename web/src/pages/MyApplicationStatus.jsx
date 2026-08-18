import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import SubmissionDetailModal from "../components/SubmissionDetailModal";
import { myApplicationStatus as mas } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function reviewStatusKey(submission) {
  if (submission.review_status === "approved") return "approved";
  if (submission.review_status === "needs_revision") return "needsRevision";
  return "reviewing";
}

// 승인 확인 여부는 서버에 저장하지 않고, 이 브라우저에 로컬로만 기록한다 —
// "사용자가 확인하면 사라진다"는 건 이 사용자 화면에서의 강조 표시가 사라진다는 뜻이라
// 굳이 새 테이블/컬럼을 만들 필요 없이 localStorage로 충분하다.
function ackKey(userId) {
  return `jbxport:approved-ack:${userId}`;
}
function loadAcked(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(ackKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}
function saveAcked(userId, set) {
  localStorage.setItem(ackKey(userId), JSON.stringify([...set]));
}
// submissionId만으로는 "그 서류가 다시 반려됐다가 재승인된" 경우를 구분 못 하니,
// 승인 시각까지 같이 묶어서 키로 쓴다.
function approvalAckId(doc) {
  return `${doc.submissionId}:${doc.reviewedAt || ""}`;
}

function ProgramRow({ index, program, expanded, onToggle, onViewDocument, onGoToDocs, onFixDocument, isNewApproval }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex w-full items-center justify-between gap-4 px-5 py-4">
        <button type="button" onClick={onToggle} className="flex-1 text-left">
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
          >
            <Icon name="documents" className="h-3.5 w-3.5" />
            서류 작성하러 가기
          </Button>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-transform hover:bg-slate-50"
          >
            <Icon name={expanded ? "x" : "plus"} className="h-3.5 w-3.5" />
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
              const isUnseenApproval = isApproved && isNewApproval(doc);
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
                          isNeedsRevision || isUnseenApproval ? "animate-blink" : ""
                        }`}
                      />
                      {mas.statusLabels[doc.statusKey]}
                    </span>
                    {isNeedsRevision && (
                      <Button
                        type="button"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => onFixDocument(program, doc)}
                      >
                        보완하기
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => onViewDocument(doc)}
                    >
                      확인하기
                    </Button>
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
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  const [ackedApprovals, setAckedApprovals] = useState(new Set());

  useEffect(() => {
    if (!user?.id) return;
    setAckedApprovals(loadAcked(user.id));
  }, [user?.id]);

  const isNewApproval = (doc) => !ackedApprovals.has(approvalAckId(doc));

  const acknowledgeApproval = (doc) => {
    if (!user?.id || doc.statusKey !== "approved") return;
    const id = approvalAckId(doc);
    if (ackedApprovals.has(id)) return;
    const next = new Set(ackedApprovals).add(id);
    setAckedApprovals(next);
    saveAcked(user.id, next);
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function loadBookmarks() {
      setLoadingBookmarks(true);
      const { data: rows, error } = await supabase
        .from("bookmarks")
        .select("id, business_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error || !rows?.length) {
        if (!cancelled) {
          setBookmarks([]);
          setLoadingBookmarks(false);
        }
        return;
      }
      const businessIds = rows.map((r) => r.business_id);
      const { data: businesses } = await supabase.from("businesses").select("id,name").in("id", businessIds);
      const businessById = Object.fromEntries((businesses || []).map((b) => [b.id, b]));
      if (!cancelled) {
        setBookmarks(
          rows
            .filter((r) => businessById[r.business_id])
            .map((r) => ({ bookmarkId: r.id, businessId: r.business_id, businessName: businessById[r.business_id].name }))
        );
        setLoadingBookmarks(false);
      }
    }
    loadBookmarks();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const removeBookmark = async (bookmark) => {
    setBookmarks((prev) => prev.filter((b) => b.bookmarkId !== bookmark.bookmarkId));
    try {
      await supabase.from("bookmarks").delete().eq("id", bookmark.bookmarkId);
    } catch {
      // 무시 - 다음 새로고침 시 다시 반영됨
    }
  };

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
          submissionId: s.id,
          reviewedAt: s.reviewed_at,
        });
      });

      if (!cancelled) {
        setPrograms(Object.values(byBusiness));
        setLoading(false);
      }
    }
    load();

    // 관리자가 승인/반려 버튼을 누르면 이 화면을 새로고침하지 않아도 바로 반영되도록,
    // 이 사용자의 submissions 변경을 실시간으로 구독해 다시 불러온다.
    const channel = supabase
      .channel(`my-applications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> 마이페이지로
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900">{mas.title}</h1>
      <p className="mt-2 mb-8 text-sm text-slate-500">{mas.subtitle}</p>

      {!loadingBookmarks && bookmarks.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-slate-900">
            <Icon name="bookmark" filled className="h-4 w-4 text-brand-600" />
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
                  >
                    <Icon name="documents" className="h-3.5 w-3.5" />
                    서류 작성하러 가기
                  </Button>
                  <button
                    type="button"
                    onClick={() => removeBookmark(b)}
                    aria-label="북마크 해제"
                    className="text-brand-500 hover:text-brand-700"
                  >
                    <Icon name="bookmark" filled className="h-4 w-4" />
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
              onViewDocument={(doc) => {
                acknowledgeApproval(doc);
                setViewingDoc(doc);
              }}
              onFixDocument={(p, doc) =>
                navigate(`/docs/fill/${doc.templateId}`, {
                  state: { templateName: doc.templateName, businessId: p.businessId, businessName: p.businessName },
                })
              }
              isNewApproval={isNewApproval}
              onGoToDocs={(p) =>
                navigate("/docs", { state: { businessId: p.businessId, businessName: p.businessName } })
              }
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
