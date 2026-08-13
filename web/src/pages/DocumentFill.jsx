import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";
import { draftKey, readDraft } from "../lib/draft";

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
  const [aiFilling, setAiFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

      if (latest) {
        const { data: valueRows } = await supabase
          .from("submission_values")
          .select("field_id, value")
          .eq("submission_id", latest.id);
        if (cancelled) return;
        setValues(Object.fromEntries((valueRows || []).map((v) => [v.field_id, v.value])));
        setIsEditing(true);
      } else {
        const draft = readDraft(authUser.id, templateId);
        if (draft) setValues(draft);
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

      try {
        await fetch(`${BACKEND_URL}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submission_id: submission.id }),
        });
      } catch {
        // 문서 생성 실패해도 제출(submission/값)은 이미 저장됐으니 관리자가 확인할 수 있다.
      }

      navigate("/docs", { state: { businessId, businessName } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <button
        type="button"
        onClick={() => navigate("/docs", { state: { businessId, businessName } })}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> 목록으로
      </button>

      <h1 className="text-2xl font-bold text-slate-900">{templateName || "서류 작성하기"}</h1>
      {businessName && <p className="mt-1 text-sm text-slate-500">{businessName}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outlineBrand" className="px-3 py-2 text-xs" onClick={handleTransferInfo} disabled={transferring}>
          <Icon name="user" className="h-3.5 w-3.5" />
          {transferring ? "불러오는 중..." : "정보 이전"}
        </Button>
        <Button type="button" variant="outlineBrand" className="px-3 py-2 text-xs" onClick={handleAiFill} disabled={aiFilling}>
          <Icon name="sparkle" className="h-3.5 w-3.5" />
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
          {categorizedFields.map((group) => (
            <Card key={group.name} className="p-6">
              <h2 className="mb-4 text-sm font-bold text-slate-900">{group.name}</h2>
              <div className="space-y-5">
                {group.fields.map((field) => (
                  <label key={field.id} className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.field_label}</span>
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
          className="flex-1 justify-center py-3"
          onClick={handleTempSave}
          disabled={submitting || loading}
        >
          임시저장
        </Button>
        <Button
          type="button"
          className="flex-1 justify-center py-3"
          onClick={handleSubmitDocument}
          disabled={submitting || loading}
        >
          {submitting ? "제출하는 중..." : isEditing ? "수정 제출하기" : "서류 제출하기"}
        </Button>
      </div>
    </div>
  );
}
