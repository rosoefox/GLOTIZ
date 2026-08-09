import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { supabase } from "../lib/supabase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function getOrCreateUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user.id;
}

function toOptionList(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) =>
    typeof opt === "string"
      ? { value: opt, label: opt }
      : { value: opt.value ?? opt.label, label: opt.label ?? opt.value }
  );
}

function FieldInput({ field, value, onChange }) {
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";

  if (field.field_type === "textarea") {
    return (
      <textarea
        rows={3}
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.field_type === "select") {
    const options = toOptionList(field.options);
    return (
      <select
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      >
        <option value="">선택하세요</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const type = field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text";
  return (
    <input
      type={type}
      className={inputClass}
      value={value ?? ""}
      onChange={(e) => onChange(field.id, e.target.value)}
    />
  );
}

export default function AiDocumentFill() {
  const location = useLocation();
  const navigate = useNavigate();
  const { templateId, templateName, businessName } = location.state ?? {};

  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generatedPath, setGeneratedPath] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  useEffect(() => {
    if (!templateId) return;
    async function loadFields() {
      setLoadingFields(true);
      const { data, error } = await supabase
        .from("template_fields")
        .select("*")
        .eq("template_id", templateId);
      if (error) setError(error.message);
      else setFields(data);
      setLoadingFields(false);
    }
    loadFields();
  }, [templateId]);

  const updateValue = (fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let userId;
    try {
      userId = await getOrCreateUserId();
    } catch (authError) {
      setError(authError.message);
      setSaving(false);
      return;
    }

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({ template_id: templateId, user_id: userId, status: "filled" })
      .select()
      .single();

    if (submissionError) {
      setError(submissionError.message);
      setSaving(false);
      return;
    }

    const rows = fields.map((field) => ({
      submission_id: submission.id,
      field_id: field.id,
      value: values[field.id] ?? "",
      source: "user_input",
    }));

    const { error: valuesError } = await supabase.from("submission_values").insert(rows);

    if (valuesError) {
      setError(valuesError.message);
      setSaving(false);
      return;
    }

    setSubmissionId(submission.id);
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "AI 문서 생성에 실패했습니다.");
      setGeneratedPath(data.file_path);

      const { data: signed, error: signError } = await supabase.storage
        .from("generated")
        .createSignedUrl(data.file_path, 3600);
      if (signError) throw signError;
      setDownloadUrl(signed.signedUrl);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (!templateId) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <p className="text-sm text-slate-500">선택된 서식이 없습니다.</p>
        <Button className="mt-4" onClick={() => navigate("/ai-docs")}>
          <Icon name="arrowLeft" className="h-4 w-4" />
          사업/서식 선택으로 돌아가기
        </Button>
      </div>
    );
  }

  if (submissionId) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <Card className="p-8 text-center">
          <Icon name="checkCircle" className="mx-auto h-10 w-10 text-emerald-500" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">입력 정보가 저장되었습니다</h1>
          <p className="mt-1 text-sm text-slate-500">제출 ID: {submissionId}</p>

          {generateError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {generateError}
            </div>
          )}

          {generatedPath ? (
            <div className="mt-4">
              <p className="mb-3 text-sm text-emerald-700">AI 문서 생성이 완료되었습니다.</p>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Icon name="download" className="h-4 w-4" />
                  PDF 다운로드
                </a>
              ) : (
                <p className="text-sm text-slate-400">다운로드 링크를 만드는 중...</p>
              )}
            </div>
          ) : (
            <Button className="mt-6" onClick={handleGenerate} disabled={generating}>
              <Icon name="sparkle" className="h-4 w-4" />
              {generating ? "AI 문서 생성 중..." : "AI로 문서 생성하기"}
            </Button>
          )}

          <Button variant="secondary" className="mt-3" onClick={() => navigate("/ai-docs")}>
            사업/서식 목록으로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{templateName}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{businessName}</p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Card className="p-8">
        {loadingFields ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 입력 필드가 없습니다.</p>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            {fields.map((field) => (
              <label key={field.id} className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {field.field_label}
                </span>
                <FieldInput field={field} value={values[field.id]} onChange={updateValue} />
              </label>
            ))}

            <Button type="submit" className="w-full justify-center" disabled={saving}>
              {saving ? "저장 중..." : "저장하기"}
              <Icon name="arrowRight" className="h-4 w-4" />
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
