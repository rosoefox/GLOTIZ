import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, CONTROL_CLASS, StepIndicator, SectionCardHeader } from "../components/ui";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";
import { draftKey, readDraft } from "../lib/draft";
import { documentPreview } from "../data/mockData";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const aiReviewDraftKey = (userId, templateId) => `${draftKey(userId, templateId)}:ai-review`;
const VIETNAM_EXPO_BUSINESS_ID = "5090843f-cf8e-4945-a51d-69e1aa8e61e6";
const VIETNAM_APPLICATION_DEMO_VALUES = {
  company_name_kr: "글로티즈",
  ceo_name: "김글로",
  company_type: "법인",
  company_phone: "+82 - 63 - 000 - 0000",
  signature_company_name: "해피 코스메틱",
  signature_ceo_name: "김행복",
  company_intro_kr:
    "해피 코스메틱은 전북특별자치도에 소재한 가상의 화장품 제조·수출기업으로, 자연 유래 성분과 사용 편의성을 강조한 데일리 스킨케어 제품을 기획하는 MVP 테스트 기업입니다.",
  contact_name_kr: "김글로",
  contact_department: "해외사업팀",
  contact_email: "glotiz@gmail.com",
  contact_mobile: "+82 - 63 - 000 - 0000",
  business_reg_number: "418-81-00000",
  main_product: "해피 비타 카밍 선크림 SPF50+ PA++++",
  product_category: "소비재",
  headquarters_address: "전북특별자치도 전주시 덕진구 혁신로 123 (가상주소)",
  participation_field: "K-뷰티",
  main_export_product: "선크림·기초화장품",
  hs_code: "3304.99",
  primary_business_code: "20421",
  primary_ksic_code: "C20421",
  secondary_business_code: "46441",
  secondary_ksic_code: "G46441",
};
const VIETNAM_APPLICATION_AI_VALUES = {
  company_intro_kr: {
    value:
      "해피 코스메틱은 전북특별자치도에 소재한 가상의 화장품 제조·수출기업으로, 자연 유래 성분과 사용 편의성을 강조한 데일리 스킨케어 제품을 기획하는 MVP 테스트 기업입니다. 대표 제품인 ‘해피 비타 카밍 선크림 SPF50+ PA++++’은 민감한 피부도 편안하게 사용할 수 있는 산뜻한 사용감과 백탁 부담 완화를 핵심 가치로 제안합니다. 베트남을 중심으로 한 동남아 시장의 K-뷰티 수요를 공략하고, 온라인 마켓플레이스와 현지 유통 파트너를 통해 판매 채널을 확대하고자 합니다. 이번 전시회 참가를 통해 현지 바이어를 발굴하고 제품 반응을 검증하여 장기적인 수출 기반을 구축할 계획입니다.",
    note: "신청서 작성에 필요한 분량을 보완하기 위해 AI가 내용을 추가했습니다. 실제 사업 내용과 일치하는지 확인해주세요.",
  },
  company_name_en: {
    value: "GLOTIZ",
    note: "국문 기업명을 바탕으로 영문 표기를 추정했습니다.",
  },
  founded_date: {
    value: "2021-03-15",
    note: "정확한 설립일은 사업자등록증 등 증빙서류로 확인해야 합니다.",
  },
  website: {
    value: "https://www.glotiz.kr",
    note: "공식 홈페이지 주소인지 확인해야 합니다.",
  },
  contact_name_en: {
    value: "Geullo Kim",
    note: "국문 담당자 성명을 바탕으로 영문 표기를 추정했습니다.",
  },
  contact_position: {
    value: "팀장",
    note: "담당자의 실제 직위를 확인해야 합니다.",
  },
  company_intro_en: {
    value:
      "Happy Cosmetic is a virtual cosmetics manufacturer and exporter based in Jeonbuk Special Self-Governing Province, developing daily skincare products that emphasize naturally derived ingredients and ease of use as an MVP test company. Its flagship product, Happy Vita Calming Sunscreen SPF50+ PA++++, offers a lightweight feel suitable for sensitive skin while helping reduce concerns about white cast. The company aims to capture growing K-beauty demand in Vietnam and other Southeast Asian markets by expanding sales through online marketplaces and local distribution partners. Through participation in this exhibition, it plans to identify local buyers, validate market response, and establish a sustainable foundation for long-term exports.",
    note: "AI가 보완한 국문 기업 소개를 기준으로 번역했습니다. 표현과 사실관계를 확인해주세요.",
  },
};

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

function isFieldFilled(field, values) {
  return (values[field.id] ?? "").toString().trim() !== "";
}

// AI가 추정해 자동으로 채운 값은 사용자가 직접 확인하기 전까지 빈칸 강조와 같은 방식(은은한
// 브랜드 글로우)의 빨간 버전으로 표시한다 — ui.jsx의 emptyFieldClass와 같은 패턴이다.
function needsReviewClass(needsReview) {
  if (!needsReview) return CONTROL_CLASS;
  return `${CONTROL_CLASS.replace("border-slate-300", "border-red-300").replace("bg-white", "bg-red-50/40")} ring-4 ring-red-100/60`;
}

function FieldInput({ field, value, onChange, needsReview = false }) {
  const controlClass = needsReviewClass(needsReview);
  if (isMultilineField(field)) {
    return (
      <textarea
        rows={4}
        className={`${controlClass} py-2.5`}
        value={value ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.field_type === "select" || field.field_type === "checkbox") {
    const options = toOptionList(field.options);
    return (
      <select className={`${controlClass} h-10`} value={value ?? ""} onChange={(e) => onChange(field.id, e.target.value)}>
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
      className={`${controlClass} h-10`}
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
  const [aiReviewByField, setAiReviewByField] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [isVietnamDemoApplication, setIsVietnamDemoApplication] = useState(false);

  const [transferring, setTransferring] = useState(false);
  const [extractingUploads, setExtractingUploads] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [oneTouchFilling, setOneTouchFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [generatedDocUrl, setGeneratedDocUrl] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  const allFilled = fields.length > 0 && fields.every((f) => isFieldFilled(f, values));

  useEffect(() => {
    if (!templateId || !authUser?.id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: fieldRows }, { data: templateRow }] = await Promise.all([
        supabase.from("template_fields").select("*").eq("template_id", templateId),
        supabase.from("templates").select("business_id,name").eq("id", templateId).maybeSingle(),
      ]);
      if (cancelled) return;
      setFields(fieldRows || []);
      const isVietnamApplication =
        templateRow?.business_id === VIETNAM_EXPO_BUSINESS_ID && templateRow?.name?.trim() === "참가 신청서";
      setIsVietnamDemoApplication(isVietnamApplication);

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
        try {
          setAiReviewByField(JSON.parse(localStorage.getItem(aiReviewDraftKey(authUser.id, templateId))) || {});
        } catch {
          setAiReviewByField({});
        }
      } else if (latest) {
        const { data: valueRows } = await supabase
          .from("submission_values")
          .select("field_id, value, needs_review, confidence_note")
          .eq("submission_id", latest.id);
        if (cancelled) return;
        setValues(Object.fromEntries((valueRows || []).map((v) => [v.field_id, v.value])));
        setAiReviewByField(
          Object.fromEntries(
            (valueRows || [])
              .filter((v) => v.needs_review)
              .map((v) => [v.field_id, v.confidence_note || "AI가 추정한 값입니다. 정확한 내용을 확인해주세요."])
          )
        );
      } else {
        setValues({});
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

  const stepLabels = useMemo(() => [...categorizedFields.map((g) => g.name), "최종 검토"], [categorizedFields]);

  // 지금 화면에 걸쳐 있는 섹션을 감지해 상단 단계 표시줄의 현재 단계를 따라가게 한다.
  // 각 섹션 카드와, 맨 아래 제출 영역 바로 앞의 감지용 지점(sentinel)까지 함께 관찰한다.
  const [activeStep, setActiveStep] = useState(0);
  const sectionRefs = useRef([]);
  sectionRefs.current = [];
  const registerSection = (el) => {
    if (el && !sectionRefs.current.includes(el)) sectionRefs.current.push(el);
  };

  useEffect(() => {
    const els = sectionRefs.current;
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveStep(Number(topMost.target.dataset.stepIndex));
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categorizedFields.length]);

  // 필드를 직접 고치면 AI 추정값 표시(빨간 강조 + 안내문)를 지워서 "확인 완료"로 취급한다.
  const updateValue = (fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setAiReviewByField((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

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
      if (isVietnamDemoApplication) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const today = new Date();
        const currentDate = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");
        const demoValues = { ...VIETNAM_APPLICATION_DEMO_VALUES, application_date: currentDate };
        const demoValuesById = Object.fromEntries(
          fields
            .filter((field) => demoValues[field.field_key] !== undefined)
            .map((field) => [field.id, demoValues[field.field_key]])
        );
        setValues((prev) => ({ ...prev, ...demoValuesById }));
        setAiReviewByField((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([fieldId]) => !(fieldId in demoValuesById)))
        );
        return;
      }
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
      if (isVietnamDemoApplication) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const nextValues = {};
        const nextReviewByField = {};
        fields.forEach((field) => {
          const demo = VIETNAM_APPLICATION_AI_VALUES[field.field_key];
          const isIntroField = field.field_key === "company_intro_kr" || field.field_key === "company_intro_en";
          if (!demo || (values[field.id] && !isIntroField)) return;
          nextValues[field.id] = demo.value;
          nextReviewByField[field.id] = demo.note;
        });
        setValues((prev) => ({ ...prev, ...nextValues }));
        setAiReviewByField((prev) => ({ ...prev, ...nextReviewByField }));
        return;
      }
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
      const nextValues = {};
      const nextReviewByField = {};
      (data.fields || []).forEach((item) => {
        const fieldId = fieldIdByKey[item.field_key];
        if (!fieldId || values[fieldId] || !item.value) return;
        nextValues[fieldId] = item.value;
        nextReviewByField[fieldId] =
          item.confidence_note || "AI가 채운 값입니다. 실제 정보와 일치하는지 확인해주세요.";
      });
      setValues((prev) => ({ ...prev, ...nextValues }));
      setAiReviewByField((prev) => ({ ...prev, ...nextReviewByField }));
    } catch (err) {
      setError(err.message);
    } finally {
      setAiFilling(false);
    }
  };

  // 데모용: "정보 이전"과 "AI 채우기"가 각각 채우던 값을 한 번에 채운다.
  // AI 추정값(빨간 테두리)은 그대로 needs-review 상태로 남긴다.
  const handleOneTouchFill = async () => {
    setOneTouchFilling(true);
    setError(null);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const today = new Date();
      const currentDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
      const demoValues = { ...VIETNAM_APPLICATION_DEMO_VALUES, application_date: currentDate };
      const demoValuesById = Object.fromEntries(
        fields
          .filter((field) => demoValues[field.field_key] !== undefined)
          .map((field) => [field.id, demoValues[field.field_key]])
      );

      const nextValues = { ...demoValuesById };
      const nextReviewByField = {};
      fields.forEach((field) => {
        const aiDemo = VIETNAM_APPLICATION_AI_VALUES[field.field_key];
        if (!aiDemo) return;
        const isIntroField = field.field_key === "company_intro_kr" || field.field_key === "company_intro_en";
        if (nextValues[field.id] && !isIntroField) return;
        nextValues[field.id] = aiDemo.value;
        nextReviewByField[field.id] = aiDemo.note;
      });

      setValues((prev) => ({ ...prev, ...nextValues }));
      setAiReviewByField((prev) => {
        const cleared = Object.fromEntries(
          Object.entries(prev).filter(([fieldId]) => !(fieldId in demoValuesById))
        );
        return { ...cleared, ...nextReviewByField };
      });
    } finally {
      setOneTouchFilling(false);
    }
  };

  const handleTempSave = () => {
    if (!authUser?.id) return;
    localStorage.setItem(draftKey(authUser.id, templateId), JSON.stringify(values));
    localStorage.setItem(aiReviewDraftKey(authUser.id, templateId), JSON.stringify(aiReviewByField));
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
        source: aiReviewByField[f.id] ? "ai_generated" : "user_input",
        needs_review: Boolean(aiReviewByField[f.id]),
        confidence_note: aiReviewByField[f.id] || null,
      }));
      const { error: valuesErr } = await supabase.from("submission_values").insert(rows);
      if (valuesErr) throw valuesErr;

      localStorage.removeItem(draftKey(authUser.id, templateId));
      localStorage.removeItem(aiReviewDraftKey(authUser.id, templateId));

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

  const filledCount = fields.filter((f) => isFieldFilled(f, values)).length;
  const progressPercent = fields.length ? Math.round((filledCount / fields.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="w-5 h-5" /> 목록으로
      </button>

      <h1 className="text-2xl font-bold text-slate-900">{templateName || "서류 작성하기"}</h1>
      {businessName && <p className="mt-1 text-sm text-slate-500">{businessName}</p>}

      {!loading && fields.length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-4">
          <StepIndicator steps={stepLabels} activeIndex={activeStep} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outlineBrand" className="px-3.5 py-2 text-xs" onClick={handleTransferInfo} disabled={transferring}>
          <Icon name="user" className="w-3.5 h-3.5" />
          {transferring ? "불러오는 중..." : "정보 이전"}
        </Button>
        <Button
          type="button"
          variant="outlineBrand"
          className="px-3.5 py-2 text-xs"
          onClick={handleExtractFromUploads}
          disabled={extractingUploads}
        >
          <Icon name="upload" className="w-3.5 h-3.5" />
          {extractingUploads ? "서류 읽는 중..." : "업로드한 서류에서 불러오기"}
        </Button>
        <Button type="button" variant="outlineBrand" className="px-3.5 py-2 text-xs" onClick={handleAiFill} disabled={aiFilling}>
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          {aiFilling ? "AI가 채우는 중..." : "AI 채우기"}
        </Button>
        {isVietnamDemoApplication && (
          <Button type="button" className="px-4 py-2.5 text-sm" onClick={handleOneTouchFill} disabled={oneTouchFilling}>
            <Icon name="sparkle" className="h-4 w-4" />
            {oneTouchFilling ? "전체 입력 중..." : "전체 한 번에 채우기"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">불러오는 중...</p>
      ) : fields.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">등록된 입력 필드가 없습니다.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            {categorizedFields.map((group, groupIdx) => (
              <div
                key={group.name}
                ref={registerSection}
                data-step-index={groupIdx}
                className="rounded-lg border border-slate-200 bg-white"
              >
                <SectionCardHeader step={groupIdx + 1} title={group.name} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <label key={field.id} className={`block ${isMultilineField(field) ? "sm:col-span-2" : ""}`}>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {field.field_label}
                      </span>
                      <FieldInput
                        field={field}
                        value={values[field.id]}
                        onChange={updateValue}
                        needsReview={Boolean(aiReviewByField[field.id])}
                      />
                      {aiReviewByField[field.id] && (
                        <span className="mt-1.5 block text-xs font-medium text-red-500">
                          AI 추정값 · {aiReviewByField[field.id]}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {/* 마지막 섹션을 지나 여기까지 스크롤하면 상단 단계 표시줄이 "최종 검토"로 넘어간다. */}
            <div ref={registerSection} data-step-index={categorizedFields.length} className="h-px" />
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">작성 현황</p>
              <p className="mt-1.5 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900">{filledCount}</span>
                <span className="text-sm font-medium text-slate-400">/ {fields.length}건 입력</span>
              </p>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                {categorizedFields.map((group, idx) => {
                  const groupFilledCount = group.fields.filter((f) => isFieldFilled(f, values)).length;
                  const groupDone = groupFilledCount === group.fields.length;
                  return (
                    <div key={group.name} className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className={`flex min-w-0 items-center gap-2 ${
                          activeStep === idx ? "font-semibold text-slate-900" : "text-slate-500"
                        }`}
                      >
                        <Icon
                          name={groupDone ? "checkCircle" : "documents"}
                          className={`w-4 h-4 shrink-0 ${groupDone ? "text-emerald-500" : "text-slate-300"}`}
                        />
                        <span className="truncate">{group.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {groupFilledCount}/{group.fields.length}
                      </span>
                    </div>
                  );
                })}
              </div>

              {(templateName || businessName) && (
                <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                  {templateName && <p className="font-semibold text-slate-700">{templateName}</p>}
                  {businessName && <p className="mt-0.5">{businessName}</p>}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <div className="sticky bottom-0 z-10 mt-8 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!loading && fields.length > 0 && !allFilled && (
            <p className="mr-auto text-xs font-medium text-amber-600">모든 항목을 입력해야 제출할 수 있습니다.</p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="px-5 py-2.5 text-sm"
            onClick={handleTempSave}
            disabled={submitting || loading}
          >
            임시 저장
          </Button>
          <Button
            type="button"
            className="px-5 py-2.5 text-sm"
            onClick={handleSubmitDocument}
            disabled={submitting || loading || !allFilled}
          >
            {submitting ? "제출하는 중..." : isEditing ? "수정 제출하기" : "작성 완료"}
          </Button>
        </div>
      </div>

      {showComplete && (
        <Modal title={documentPreview.submitted.title} onClose={() => navigate("/docs", { state: { businessId, businessName } })} width="max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center">
              {generatingDoc ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
              ) : (
                <Icon name="checkCircle" className="w-5 h-5 text-slate-500" />
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
                <Icon name="download" className="w-5 h-5" />
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
