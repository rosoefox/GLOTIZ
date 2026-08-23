import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, CardHeader, CardTitle, CardContent, Button } from "../components/ui";
import { govSupport as gs, govAnnouncementDetails } from "../data/mockData";
import { api } from "../lib/api";
import { displayPeriod } from "../lib/period";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const biz = await api.get(`/businesses/${businessId}`).catch(() => null);
      if (!cancelled) {
        setBusiness(biz);
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
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm text-slate-400">해당 공고를 찾을 수 없습니다.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" className="w-5 h-5" /> 목록으로
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="w-5 h-5" /> 목록으로
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900">{gs.detailPageTitle}</h1>
      <p className="mt-2 text-lg font-bold text-brand-700">{business.name}</p>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{gs.basicInfoTitle}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="space-y-2">
            {detail ? (
              <>
                <Row label={gs.basicInfoLabels.org} value={detail.org} />
                <Row label={gs.basicInfoLabels.period} value={displayPeriod(business, govAnnouncementDetails)} />
                <Row label={gs.basicInfoLabels.target} value={detail.target} />
                <Row label={gs.basicInfoLabels.support} value={detail.support} />
                <Row label={gs.basicInfoLabels.contact} value={detail.contact} />
              </>
            ) : (
              business.description && <Row label="안내" value={business.description} />
            )}
          </dl>
        </CardContent>
      </Card>

      <Button className="mt-6 w-full justify-center py-4 text-base" onClick={handleApply}>
        <Icon name="sparkle" className="w-5 h-5" />
        {gs.applyButtonLabel}
      </Button>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{gs.previewSectionTitle}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {business.reference_file_path ? (
            <iframe
              title="기본서류 미리보기"
              src={`${BACKEND_URL}/businesses/${business.id}/reference-doc/preview-pdf`}
              className="h-[420px] w-full rounded-md border border-slate-200 sm:h-[600px] lg:h-[900px]"
            />
          ) : (
            <p className="text-sm text-slate-400">{gs.previewUnavailable}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
