import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs, login as loginLabels } from "../data/mockData";
import { loadAnnouncements } from "../data/govSupportData";
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const dp = gs.detailPage;

// AI 간편신청하기 버튼 전용 커스텀 커서: 기본 화살표보다 큼직한 8비트 픽셀 아트 포인터.
const PIXEL_CURSOR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 8 8" shape-rendering="crispEdges">
  <rect x="0" y="0" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="1" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="1" y="1" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="2" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="1" y="2" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="2" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="3" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="1" y="3" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="3" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="3" y="3" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="4" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="1" y="4" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="4" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="3" y="4" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="4" y="4" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="5" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="1" y="5" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="5" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="0" y="6" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="6" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="3" y="6" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="2" y="7" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
  <rect x="3" y="7" width="1" height="1" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.12"/>
</svg>`;
const PIXEL_CURSOR_STYLE = {
  cursor: `url("data:image/svg+xml,${encodeURIComponent(PIXEL_CURSOR_SVG)}") 2 2, pointer`,
};

function LoginPopup({ onClose, onSuccess }) {
  const { login: signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn({ email, password });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{gs.loginPopup.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{gs.loginPopup.description}</p>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={loginLabels.fields.idPlaceholder}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={loginLabels.fields.passwordPlaceholder}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full py-2.5" disabled={submitting}>
            {submitting ? "로그인 중..." : loginLabels.submitLabel}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          {loginLabels.signupPrompt.text}{" "}
          <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
            {loginLabels.signupPrompt.cta}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function GovAnnouncementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [announcement, setAnnouncement] = useState(undefined); // undefined = 로딩 중, null = 없음
  const [showLoginPopup, setShowLoginPopup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAnnouncements().then((list) => {
      if (!cancelled) setAnnouncement(list.find((a) => a.id === id) || null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleApplyClick = () => {
    if (!isLoggedIn) {
      setShowLoginPopup(true);
      return;
    }
    navigate("/docs", { state: { businessId: announcement.id, businessName: announcement.name } });
  };

  const handleLoginSuccess = () => {
    setShowLoginPopup(false);
    navigate("/gov-support");
  };

  if (announcement === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  if (announcement === null) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="text-sm text-slate-400">해당 공고를 찾을 수 없습니다.</p>
        <Link to="/gov-support" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
          <Icon name="arrowLeft" className="h-4 w-4" /> {dp.backLabel}
        </Link>
      </div>
    );
  }

  const infoRows = [
    { label: dp.basicInfoLabels.department, value: announcement.department },
    { label: dp.basicInfoLabels.agency, value: announcement.agency },
    { label: dp.basicInfoLabels.applyPeriod, value: announcement.applyPeriod },
    { label: dp.basicInfoLabels.overview, value: announcement.description },
    { label: dp.basicInfoLabels.applyMethod, value: announcement.applyMethod },
    { label: dp.basicInfoLabels.applySite, value: announcement.applySite },
    { label: dp.basicInfoLabels.contact, value: announcement.contact },
  ];

  return (
    <div className="relative">
      <div
        className={`mx-auto max-w-3xl px-8 py-8 transition-[filter] ${
          showLoginPopup ? "pointer-events-none select-none blur-sm" : ""
        }`}
      >
        <Link to="/gov-support" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <Icon name="arrowLeft" className="h-4 w-4" /> {dp.backLabel}
        </Link>

        <h1 className="mb-4 text-3xl font-extrabold text-slate-900">{dp.heading}</h1>

        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="brand">모집 공고</Badge>
            {announcement.org && <span className="text-xs text-slate-400">출처: {announcement.org}</span>}
          </div>
          <h2 className="mb-5 text-xl font-bold leading-snug text-slate-900">{announcement.name}</h2>

          <div className="divide-y divide-slate-100 text-sm">
            {infoRows.map((row) => (
              <div key={row.label} className="flex gap-4 py-3">
                <span className="w-32 shrink-0 font-semibold text-slate-500">{row.label}</span>
                <span className="text-slate-800">{row.value || "-"}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mb-6 p-6">
          <h3 className="mb-4 text-base font-bold text-slate-900">{dp.previewTitle}</h3>
          {announcement.hasTemplatePreview ? (
            <iframe
              title="공고 서류 양식 미리보기"
              src={`${BACKEND_URL}/templates/${announcement.previewTemplateId}/preview-pdf`}
              className="h-[600px] w-full rounded-lg border border-slate-200"
            />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              {dp.previewUnavailable}
            </p>
          )}
        </Card>

        <button
          type="button"
          onClick={handleApplyClick}
          style={PIXEL_CURSOR_STYLE}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-6 py-4 text-base font-bold text-white hover:bg-brand-900"
        >
          <Icon name="sparkle" className="h-5 w-5" />
          {dp.applyButtonLabel}
        </button>
      </div>

      {showLoginPopup && <LoginPopup onClose={() => setShowLoginPopup(false)} onSuccess={handleLoginSuccess} />}
    </div>
  );
}
