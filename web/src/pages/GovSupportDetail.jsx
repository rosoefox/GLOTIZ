import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { govSupport as gs, govAnnouncementDetails } from "../data/mockData";
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

export default function GovSupportDetail() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

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
    navigate("/docs", { state: { businessId, businessName: business?.name } });
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
    <div className="mx-auto max-w-6xl px-8 py-8">
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
              href={`${BACKEND_URL}/businesses/${business.id}/reference-doc/preview-pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Icon name="eye" className="h-3.5 w-3.5" />
              기본서류 미리보기
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
  );
}
