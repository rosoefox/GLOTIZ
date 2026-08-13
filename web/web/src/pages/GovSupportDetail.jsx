import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { govSupport as gs, govAnnouncementDetails } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function Row({ label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function CompactLoginPopup({ onClose, onSuccess }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email, password });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{gs.loginPopup.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-slate-400 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">{gs.loginPopup.description}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password"
            required
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center py-2 text-sm" disabled={submitting}>
            {submitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function GovSupportDetail() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [business, setBusiness] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginPopup, setShowLoginPopup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: biz }, { data: tpls }] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", businessId).maybeSingle(),
        supabase.from("templates").select("*").eq("business_id", businessId).order("form_number"),
      ]);
      if (!cancelled) {
        setBusiness(biz || null);
        setTemplates(tpls || []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // 관리자가 기본서류를 업로드해 AI가 뽑아준 실제 정보가 있으면 그걸 쓰고,
  // 아직 없으면 임시 목업(govAnnouncementDetails)으로 대체한다.
  const detail = business?.basic_info || govAnnouncementDetails[businessId];

  const handleApply = () => {
    if (isLoggedIn) {
      navigate("/docs", { state: { businessId, businessName: business?.name } });
    } else {
      setShowLoginPopup(true);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="text-sm text-slate-400">해당 공고를 찾을 수 없습니다.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/gov-support")}>
          <Icon name="arrowLeft" className="h-4 w-4" /> 목록으로
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`mx-auto max-w-6xl px-8 py-8 transition-all ${
          showLoginPopup ? "pointer-events-none blur-sm" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => navigate("/gov-support")}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <Icon name="arrowLeft" className="h-4 w-4" /> 목록으로
        </button>

        <h1 className="text-3xl font-extrabold text-slate-900">{gs.detailPageTitle}</h1>
        <p className="mt-2 text-lg font-bold text-brand-700">{business.name}</p>

        <Card className="mt-6 p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">{gs.basicInfoTitle}</h2>
            {business.reference_file_path && (
              <a
                href={`${BACKEND_URL}/businesses/${business.id}/reference-doc`}
                download
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Icon name="download" className="h-3.5 w-3.5" />
                기본서류 다운로드
              </a>
            )}
          </div>
          <dl className="space-y-2">
            {detail ? (
              <>
                <Row label={gs.basicInfoLabels.org} value={detail.org} />
                <Row label={gs.basicInfoLabels.period} value={detail.period} />
                <Row label={gs.basicInfoLabels.target} value={detail.target} />
                <Row label={gs.basicInfoLabels.support} value={detail.support} />
                <Row label={gs.basicInfoLabels.contact} value={detail.contact} />
              </>
            ) : (
              business.description && <Row label="안내" value={business.description} />
            )}
          </dl>
        </Card>

        <Button className="mt-6 w-full justify-center py-4 text-base" onClick={handleApply}>
          <Icon name="sparkle" className="h-4 w-4" />
          {gs.applyButtonLabel}
        </Button>

        <Card className="mt-6 p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-900">{gs.previewSectionTitle}</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">{gs.previewUnavailable}</p>
          ) : (
            <div className="space-y-6">
              {templates.map((t) => (
                <div key={t.id}>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{t.name}</p>
                  <iframe
                    title={t.name}
                    src={`${BACKEND_URL}/templates/${t.id}/preview-pdf`}
                    className="h-[900px] w-full rounded-xl border border-slate-200"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showLoginPopup && (
        <CompactLoginPopup onClose={() => setShowLoginPopup(false)} onSuccess={() => navigate("/gov-support")} />
      )}
    </>
  );
}
