import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { supabase } from "../lib/supabase";

export default function AiDocuments() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [error, setError] = useState(null);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    async function loadBusinesses() {
      setLoadingBusinesses(true);
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) setError(error.message);
      else setBusinesses(data);
      setLoadingBusinesses(false);
    }
    loadBusinesses();
  }, []);

  const selectBusiness = async (business) => {
    setSelectedBusiness(business);
    setTemplates([]);
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("business_id", business.id)
      .order("name");
    if (error) setError(error.message);
    else setTemplates(data);
    setLoadingTemplates(false);
  };

  const selectTemplate = (template) => {
    navigate("/ai-docs/fill", {
      state: {
        templateId: template.id,
        templateName: template.name,
        businessId: selectedBusiness.id,
        businessName: selectedBusiness.name,
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">AI 서식 자동 채우기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        사업을 선택하면 해당 사업에 등록된 서식 목록을 볼 수 있습니다.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-base font-bold text-slate-900">사업 선택</h2>
        {loadingBusinesses ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {businesses.map((b) => (
              <Card
                key={b.id}
                onClick={() => selectBusiness(b)}
                className={`cursor-pointer p-5 transition-shadow hover:shadow-md ${
                  selectedBusiness?.id === b.id ? "ring-2 ring-brand-400" : ""
                }`}
              >
                <p className="font-bold text-slate-900">{b.name}</p>
                {b.description && <p className="mt-1 text-sm text-slate-500">{b.description}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>

      {selectedBusiness && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
            {selectedBusiness.name}
            <Badge tone="brand">서식 목록</Badge>
          </h2>
          {loadingTemplates ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-400">등록된 서식이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card key={t.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon name="documents" className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      {t.form_number && <p className="text-xs text-slate-400">{t.form_number}</p>}
                    </div>
                  </div>
                  <Button className="px-4 py-2 text-sm" onClick={() => selectTemplate(t)}>
                    <Icon name="sparkle" className="h-4 w-4" />
                    AI로 채우기
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
