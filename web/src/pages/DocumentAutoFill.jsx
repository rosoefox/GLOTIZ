import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { supabase } from "../lib/supabase";
import { user } from "../data/mockData";
<<<<<<< HEAD
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

=======

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

>>>>>>> origin/main
function toOptionList(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) =>
    typeof opt === "string"
      ? { value: opt, label: opt }
      : { value: opt.value ?? opt.label, label: opt.label ?? opt.value }
  );
}

// 실제 사업자 프로필 테이블이 없어, 마이페이지의 기본 정보(user)로 유추 가능한
// 항목만 채우고 나머지(매출/제품 정보 등)는 비워둔다.
function guessMyInfoValue(field) {
  const key = field.field_key;
  if (/^(company_name_kr|company_name)$/.test(key)) return user.company;
  if (/^(ceo_name|rep_name)$/.test(key)) return user.name;
  if (/^contact_name_kr$/.test(key)) return user.name;
  if (/^rep_email$/.test(key) || key === "contact_email") return user.email;
  if (/^(rep_phone|rep_company_phone|phone_number|contact_phone)$/.test(key)) return user.phone;
  if (key === "contact_position") return user.role;
  return null;
}

function FieldInput({ field, value, onChange }) {
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";

  if (field.field_type === "textarea" || field.field_type === "long_text") {
    return (
      <textarea
        rows={3}
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.field_type === "select" || field.field_type === "checkbox") {
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

// 서류 작성 → 저장(미리보기) → AI 생성(다운로드) 3단계 흐름.
// GovSupport → 필수 수출 서류 페이지의 "서류 작성하기" 모달 안에서 렌더링된다.
export function DocumentAutoFillContent({ templateId, templateName, businessName, onDone }) {
<<<<<<< HEAD
  const { user: authUser } = useAuth();
=======
>>>>>>> origin/main
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

  const clearValues = () => setValues({});

  const loadMyInfo = () => {
    setValues((prev) => {
      const next = { ...prev };
      fields.forEach((field) => {
        const guess = guessMyInfoValue(field);
        if (guess) next[field.id] = guess;
      });
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
<<<<<<< HEAD
    if (!authUser) {
      setError("로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({ template_id: templateId, user_id: authUser.id, status: "filled" })
=======
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
>>>>>>> origin/main
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

  // 다운로드 단계: AI 생성까지 끝난 상태
  if (submissionId && generatedPath) {
    return (
      <Card className="p-8 text-center">
        <Icon name="download" className="mx-auto h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 text-lg font-bold text-slate-900">다운로드 준비 완료</h3>
        <p className="mt-1 text-sm text-slate-500">AI 문서 생성이 완료되었습니다.</p>

        {downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Icon name="download" className="h-4 w-4" />
            PDF 다운로드
          </a>
        ) : (
          <p className="mt-5 text-sm text-slate-400">다운로드 링크를 만드는 중...</p>
        )}

        <Button variant="secondary" className="mt-3" onClick={onDone}>
          필수 서류 목록으로 돌아가기
        </Button>
      </Card>
    );
  }

  // 미리보기 단계: 저장은 됐지만 아직 AI 생성 전
  if (submissionId) {
    return (
      <Card className="p-8">
        <div className="mb-5 text-center">
          <Icon name="eye" className="mx-auto h-8 w-8 text-brand-500" />
          <h3 className="mt-2 text-lg font-bold text-slate-900">미리보기</h3>
          <p className="mt-1 text-sm text-slate-500">입력하신 내용을 확인한 뒤 AI로 서류를 생성하세요.</p>
        </div>

        {generateError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {generateError}
          </div>
        )}

        <dl className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {fields.map((field) => (
            <div key={field.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-slate-500">{field.field_label}</dt>
              <dd className="font-medium text-slate-900">{values[field.id] || "—"}</dd>
            </div>
          ))}
        </dl>

        <Button className="w-full justify-center" onClick={handleGenerate} disabled={generating}>
          <Icon name="sparkle" className="h-4 w-4" />
          {generating ? "AI 문서 생성 중..." : "AI로 서류 생성하기"}
        </Button>
      </Card>
    );
  }

  // 작성 단계
  return (
    <div>
      <h3 className="text-lg font-bold text-slate-900">{templateName}</h3>
      <p className="mt-1 mb-5 text-sm text-slate-500">{businessName}</p>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={clearValues}>
          직접 작성하기
        </Button>
        <Button type="button" variant="outlineBrand" className="px-3 py-2 text-xs" onClick={loadMyInfo}>
          <Icon name="user" className="h-3.5 w-3.5" />
          내 기본정보 불러오기
        </Button>
      </div>

      <Card className="p-6">
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
