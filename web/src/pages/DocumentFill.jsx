import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";
import { draftKey, readDraft } from "../lib/draft";
import { documentPreview } from "../data/mockData";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// 필드를 화면에서 한눈에 보기 좋게 카테고리별로 묶는다. 서식마다 field_key가 달라 정확한
// 분류는 불가능하니, 흔한 패턴으로 "기본 정보/연락처 정보"를 먼저 추리고 나머지는
// "사업 내용"으로 모은다.
function categorize(field) {
  const key = field.field_key.toLowerCase();
  if (/company|ceo|rep_name|business_name|corp|representative/.test(key)) return "기본 정보";
  if (/email|phone|contact/.test(key)) return "연락처 정보";
  return "사업 내용";
}

const CATEGORY_ORDER = ["기본 정보", "연락처 정보", "사업 내용"];

function toOptionList(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) =>
    typeof opt === "string"
      ? { value: opt, label: opt }
      : { value: opt.value ?? opt.label, label: opt.label ?? opt.value }
  );
}

function guessFromProfile(fieldKey, profile, authUser) {
  if (/^(company_name_kr|company_name|business_name)$/.test(fieldKey)) return profile?.company;
  if (/^(ceo_name|rep_name)$/.test(fieldKey)) return profile?.name;
  if (/^contact_name_kr$/.test(fieldKey)) return profile?.name;
  if (/^rep_email$/.test(fieldKey) || fieldKey === "contact_email") return authUser?.email;
  if (/^(rep_phone|rep_company_phone|phone_number|contact_phone)$/.test(fieldKey)) return profile?.phone;
  return null;
}

function isMultilineField(field) {
  return field.field_type === "textarea" || field.field_type === "long_text";
}

function FieldInput({ field, value, onChange }) {
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";

  if (isMultilineField(field)) {
    return (
      <textarea
        rows={4}
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.field_type === "select" || field.field_type === "checkbox") {
    const options = toOptionList(field.options);
    return (
      <select className={inputClass} value={value ?? ""} onChange={(e) => onChange(field.id, e.target.value)}>
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

export default function DocumentFill() {
  const { templateId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, profile, session } = useAuth();

  const businessId = location.state?.businessId ?? null;
  const businessName = location.state?.businessName ?? null;
  const templateName = location.state?.templateName ?? "";

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  const [transferring, setTransferring] = useState(false);
  const [extractingUploads, setExtractingUploads] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [generatedDocUrl, setGeneratedDocUrl] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  const allFilled = fields.length > 0 && fields.every((f) => (values[f.id] ?? "").toString().trim() !== "");

  useEffect(() => {
    if (!templateId || !authUser?.id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: fieldRows } = await supabase
        .from("template_fields")
        .select("*")
        .eq("template_id", templateId);
      if (cancelled) return;
      setFields(fieldRows || []);

      const { data: subs } = await supabase
        .from("submissions")
        .select("id")
        .eq("template_id", templateId)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = subs?.[0];

      if (latest) setIsEditing(true);

      // 임시저장(draft)이 있으면 항상 그 내용을 최우선으로 보여준다 — 제출 이후에도
      // "임시저장"으로 남겨둔 최신 수정 내용이 있으면 그게 화면에 보여야 하기 때문.
      // draft는 실제 제출 시에만 지워지므로, 없으면 최근 제출값으로, 그것도 없으면 빈 값으로 시작한다.
      const draft = readDraft(authUser.id, templateId);
      if (draft) {
        setValues(draft);
      } else if (latest) {
        const { data: valueRows } = await supabase
          .from("submission_values")
          .select("field_id, value")
          .eq("submission_id", latest.id);
        if (cancelled) return;
        setValues(Object.fromEntries((valueRows || []).map((v) => [v.field_id, v.value])));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [templateId, authUser?.id]);

  const categorizedFields = useMemo(() => {
    const groups = {};
    fields.forEach((f) => {
      const cat = categorize(f);
      (groups[cat] ??= []).push(f);
    });
    return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({ name: c, fields: groups[c] }));
  }, [fields]);

  const updateValue = (fieldId, value) => setValues((prev) => ({ ...prev, [fieldId]: value }));

  // 마이페이지 정보 + 예전에 제출했던 다른 서류들의 같은 field_key 값을 끌어와 빈 칸을 채운다.
  const handleTransferInfo = async () => {
    if (!authUser?.id) return;
    setTransferring(true);
    setError(null);
    try {
      const next = { ...values };
      fields.forEach((f) => {
        if (next[f.id]) return;
        const guess = guessFromProfile(f.field_key, profile, authUser);
        if (guess) next[f.id] = guess;
      });

      const { data: mySubs } = await supabase
        .from("submissions")
        .select("id, created_at")
        .eq("user_id", authUser.id)
        .neq("template_id", templateId)
        .order("created_at", { ascending: false });
      const submissionIds = (mySubs || []).map((s) => s.id);

      if (submissionIds.length) {
        const orderRank = Object.fromEntries(submissionIds.map((id, idx) => [id, idx]));
        const { data: valueRows } = await supabase
          .from("submission_values")
          .select("submission_id, field_id, value")
          .in("submission_id", submissionIds);
        const fieldIds = [...new Set((valueRows || []).map((v) => v.field_id))];
        const { data: otherFields } = fieldIds.length
          ? await supabase.from("template_fields").select("id, field_key").in("id", fieldIds)
          : { data: [] };
        const keyByFieldId = Object.fromEntries((otherFields || []).map((f) => [f.id, f.field_key]));

        const valueByKey = {};
        (valueRows || [])
          .filter((v) => v.value)
          .sort((a, b) => (orderRank[a.submission_id] ?? 0) - (orderRank[b.submission_id] ?? 0))
          .forEach((v) => {
            const key = keyByFieldId[v.field_id];
            if (key && !(key in valueByKey)) valueByKey[key] = v.value;
          });

        fields.forEach((f) => {
          if (next[f.id]) return;
          if (valueByKey[f.field_key]) next[f.id] = valueByKey[f.field_key];
        });
      }

      setValues(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setTransferring(false);
    }
  };

  // 예전에 이 포털에 업로드했던 서류(사업자등록증 등) 파일을 AI가 직접 읽어서 아직 안 채운
  // 칸만 채운다 — "정보 이전"과 달리 다른 제출값이 아니라 실제 파일 내용을 읽는다.
  const handleExtractFromUploads = async () => {
    if (!session) return;
    setExtractingUploads(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/templates/${templateId}/extract-from-uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "업로드한 서류에서 정보를 불러오지 못했습니다."));
      const data = await res.json();
      const fieldIdByKey = Object.fromEntries(fields.map((f) => [f.field_key, f.id]));
      setValues((prev) => {
        const next = { ...prev };
        (data.fields || []).forEach((item) => {
          if (!item.value) return;
          const fieldId = fieldIdByKey[item.field_key];
          if (fieldId && !next[fieldId]) next[fieldId] = item.value;
        });
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setExtractingUploads(false);
    }
  };

  const handleAiFill = async () => {
    setAiFilling(true);
    setError(null);
    try {
      const currentValues = {};
      fields.forEach((f) => {
        if (values[f.id]) currentValues[f.field_key] = values[f.id];
      });
      const res = await fetch(`${BACKEND_URL}/templates/${templateId}/ai-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ values: currentValues }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "AI 채우기에 실패했습니다."));
      const data = await res.json();
      const fieldIdByKey = Object.fromEntries(fields.map((f) => [f.field_key, f.id]));
      setValues((prev) => {
        const next = { ...prev };
        (data.fields || []).forEach((item) => {
          const fieldId = fieldIdByKey[item.field_key];
          if (fieldId) next[fieldId] = item.value;
        });
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setAiFilling(false);
    }
  };

  const handleTempSave = () => {
    if (!authUser?.id) return;
    localStorage.setItem(draftKey(authUser.id, templateId), JSON.stringify(values));
    navigate("/docs", { state: { businessId, businessName } });
  };

  const handleSubmitDocument = async () => {
    if (!authUser) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (!allFilled) {
      setError("모든 항목을 입력해야 제출할 수 있습니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: submission, error: subErr } = await supabase
        .from("submissions")
        .insert({ template_id: templateId, user_id: authUser.id, status: "filled" })
        .select()
        .single();
      if (subErr) throw subErr;

      const rows = fields.map((f) => ({
        submission_id: submission.id,
        field_id: f.id,
        value: values[f.id] ?? "",
        source: "user_input",
      }));
      const { error: valuesErr } = await supabase.from("submission_values").insert(rows);
      if (valuesErr) throw valuesErr;

      localStorage.removeItem(draftKey(authUser.id, templateId));

      try {
        await fetch(`${BACKEND_URL}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submission.id }),
        });
      } catch {
        // AI 검토 실패는 화면에 에러로 띄우지 않는다 - 미검토 상태로 남아도 제출 자체는 유효하다.
      }

      setShowComplete(true);
      setGeneratingDoc(true);
      setGeneratedDocUrl(null);
      setGenerateError(null);
      try {
        const genRes = await fetch(`${BACKEND_URL}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submission.id }),
        });
        if (!genRes.ok) throw new Error(await readErrorMessage(genRes, "완성된 서류를 만드는 데 실패했습니다."));
        const genData = await genRes.json();
        const { data: signedData, error: signedErr } = await supabase.storage
          .from("generated")
          .createSignedUrl(genData.file_path, 3600);
        if (signedErr || !signedData) throw new Error("완성된 서류 다운로드 링크를 만드는 데 실패했습니다.");
        setGeneratedDocUrl(signedData.signedUrl);
        // 준비되는 즉시 바로 다운로드까지 시도한다 — 브라우저가 막으면 모달의 버튼으로 받으면 된다.
        const a = document.createElement("a");
        a.href = signedData.signedUrl;
        a.download = `${templateName || "제출서류"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        // 문서 생성이 실패해도 제출(submission/값)은 이미 저장됐으니 관리자가 확인/재생성할 수 있다 —
        // 다만 사용자에게도 실패 사실은 알려준다.
        setGenerateError(err.message);
      } finally {
        setGeneratingDoc(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> 목록으로
      </button>

      <h1 className="text-3xl font-extrabold text-slate-900">{templateName || "서류 작성하기"}</h1>
      {businessName && <p className="mt-1.5 text-base text-slate-500">{businessName}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outlineBrand" className="px-4 py-2.5 text-sm" onClick={handleTransferInfo} disabled={transferring}>
          <Icon name="user" className="h-4 w-4" />
          {transferring ? "불러오는 중..." : "정보 이전"}
        </Button>
        <Button
          type="button"
          variant="outlineBrand"
          className="px-4 py-2.5 text-sm"
          onClick={handleExtractFromUploads}
          disabled={extractingUploads}
        >
          <Icon name="upload" className="h-4 w-4" />
          {extractingUploads ? "서류 읽는 중..." : "업로드한 서류에서 불러오기"}
        </Button>
        <Button type="button" variant="outlineBrand" className="px-4 py-2.5 text-sm" onClick={handleAiFill} disabled={aiFilling}>
          <Icon name="sparkle" className="h-4 w-4" />
          {aiFilling ? "AI가 채우는 중..." : "AI 채우기"}
        </Button>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">불러오는 중...</p>
      ) : fields.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">등록된 입력 필드가 없습니다.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {categorizedFields.map((group, groupIdx) => (
            <Card key={group.name} className="p-6 sm:p-7">
              <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {groupIdx + 1}
                </span>
                {group.name}
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <label key={field.id} className={`block ${isMultilineField(field) ? "sm:col-span-2" : ""}`}>
                    <span className="mb-2 block text-base font-semibold text-slate-800">{field.field_label}</span>
                    <FieldInput field={field} value={values[field.id]} onChange={updateValue} />
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 justify-center py-3.5 text-base"
          onClick={handleTempSave}
          disabled={submitting || loading}
        >
          임시저장
        </Button>
        <Button
          type="button"
          className="flex-1 justify-center py-3.5 text-base"
          onClick={handleSubmitDocument}
          disabled={submitting || loading || !allFilled}
        >
          {submitting ? "제출하는 중..." : isEditing ? "수정 제출하기" : "서류 제출하기"}
        </Button>
      </div>
      {!loading && fields.length > 0 && !allFilled && (
        <p className="mt-2 text-right text-xs font-medium text-amber-600">
          모든 항목을 입력해야 제출할 수 있습니다.
        </p>
      )}

      {showComplete && (
        <Modal title={documentPreview.submitted.title} onClose={() => navigate("/docs", { state: { businessId, businessName } })} width="max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              {generatingDoc ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              ) : (
                <Icon name="checkCircle" className="h-6 w-6" />
              )}
            </div>
            <p className="text-sm text-slate-600">
              {generatingDoc ? "완성된 서류 PDF를 만들고 있어요" : documentPreview.submitted.message}
            </p>

            {generatingDoc && (
              <p className="mt-3 text-xs font-medium text-slate-400">잠시만 기다려주세요. 완료되면 자동으로 다운로드돼요.</p>
            )}
            {!generatingDoc && generatedDocUrl && (
              <a
                href={generatedDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
              >
                <Icon name="download" className="h-4 w-4" />
                완성된 서류 PDF 다운로드
              </a>
            )}
            {!generatingDoc && generateError && (
              <p className="mt-3 text-xs font-medium text-red-500">
                완성된 서류 생성에 실패했습니다. 잠시 후 목록에서 다시 시도해주세요.
              </p>
            )}

            <Button
              type="button"
              className="mt-3 w-full justify-center"
              onClick={() => navigate("/docs", { state: { businessId, businessName } })}
            >
              {documentPreview.submitted.backLabel}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
