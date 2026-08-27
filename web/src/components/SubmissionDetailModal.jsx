import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

// 제출된 서류(submission)의 필드/값을 읽기 전용으로 보여준다.
// 관리자 페이지와 "나의 지원사업 현황" 양쪽에서 재사용한다.
export default function SubmissionDetailModal({ submissionId, templateId, templateName, onClose }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ fields: fieldRows }, { values: valueRows }] = await Promise.all([
        api.get(`/template_fields?template_id=${templateId}`),
        api.get(`/submission_values?submission_id=${submissionId}`, session?.access_token),
      ]);
      if (cancelled) return;
      setFields(fieldRows || []);
      setValues(Object.fromEntries((valueRows || []).map((v) => [v.field_id, v.value])));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [submissionId, templateId, session?.access_token]);

  return (
    <Modal title={templateName} onClose={onClose} width="max-w-lg">
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 입력 필드가 없습니다.</p>
      ) : (
        <dl className="divide-y divide-slate-100 rounded-none border border-slate-200">
          {fields.map((field) => (
            <div key={field.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="shrink-0 text-slate-500">{field.field_label}</dt>
              <dd className="text-right font-medium text-slate-900">{values[field.id] || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}
