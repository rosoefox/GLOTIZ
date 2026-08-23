import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, Button, TextField } from "../components/ui";
import { myPage as mp } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { readErrorMessage } from "../lib/apiError";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// 마이페이지에 고정으로 뜨는 서류 슬롯 하나 (사업자 등록증 / 상품 상세설명서).
// 슬롯당 파일 1개만 유지된다 - 다시 업로드하면 백엔드가 기존 파일을 지우고 교체한다.
function DocSlot({ docType, label, session }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/account/documents?doc_type=${docType}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "서류 조회에 실패했습니다."));
      const data = await res.json();
      setDoc(data.documents?.[0] || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, docType]);

  const handleUpload = async (file) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("doc_type", docType);
      form.append("file", file);
      const res = await fetch(`${BACKEND_URL}/account/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "파일 업로드에 실패했습니다."));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!doc || !window.confirm("이 서류를 삭제할까요?")) return;
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/account/documents?path=${encodeURIComponent(doc.path)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "삭제에 실패했습니다."));
      setDoc(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <Icon
          name={doc ? "checkCircle" : "documents"}
          className={`w-5 h-5 shrink-0 ${doc ? "text-emerald-600" : "text-slate-400"}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {loading ? (
            <p className="text-xs text-slate-400">불러오는 중...</p>
          ) : doc ? (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-brand-600 hover:underline"
            >
              {doc.name}
            </a>
          ) : (
            <p className="text-xs text-slate-400">업로드된 파일이 없습니다.</p>
          )}
          {error && <p className="mt-0.5 text-xs text-red-500">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 ${
            uploading ? "opacity-50" : ""
          }`}
        >
          <Icon name="upload" className="w-4 h-4" />
          {uploading ? "업로드 중..." : doc ? "다시 업로드" : "업로드"}
          <input
            type="file"
            accept=".pdf,.docx,.hwp,.jpg,.jpeg,.png"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = "";
              if (file) handleUpload(file);
            }}
          />
        </label>
        {doc && (
          <button
            type="button"
            onClick={handleDelete}
            aria-label={`${label} 삭제`}
            className="text-slate-300 hover:text-red-500"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MyPage() {
  const navigate = useNavigate();
  const { logout, user: authUser, profile, refreshProfile, session } = useAuth();
  const loginId = profile?.login_id ?? "";
  const name = profile?.name ?? "";
  const phone = profile?.phone ?? "";
  const company = profile?.company ?? "";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [form, setForm] = useState({
    loginId,
    name,
    email: authUser?.email ?? "",
    phone,
    company,
  });

  const startEditing = () => {
    setForm((f) => ({ ...f, loginId, name, phone, company }));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await api.patch(
      "/auth/me",
      { login_id: form.loginId, name: form.name, phone: form.phone, company: form.company },
      session.access_token
    );
    await refreshProfile();
    setSaving(false);
    setEditing(false);
  };

  const handleWithdraw = async () => {
    if (!window.confirm(mp.dangerZone.confirmMessage)) return;
    setWithdrawing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "탈퇴 처리에 실패했습니다."));
      await logout();
      navigate("/");
    } catch (err) {
      window.alert(err.message);
      setWithdrawing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{mp.title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{mp.subtitle}</p>

      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
              {(name || company) ? (name || company)[0] : ""}
            </div>
            <div>
              <p className="font-bold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">{company}</p>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" className="px-4 py-2 text-sm" onClick={startEditing}>
              {mp.editButtonLabel}
            </Button>
          )}
        </div>

        <hr className="mb-5 border-slate-100" />

        <h2 className="mb-4 text-sm font-bold text-slate-900">{mp.sectionTitle}</h2>

        {editing ? (
          <div className="space-y-4">
            <TextField
              label={mp.fields.loginId}
              value={form.loginId}
              onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value }))}
            />
            <TextField
              label={mp.fields.name}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label={mp.fields.email}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <TextField
              label={mp.fields.phone}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <TextField
              label={mp.fields.company}
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setEditing(false)}>
                {mp.cancelButtonLabel}
              </Button>
              <Button className="px-4 py-2 text-sm" onClick={handleSave} disabled={saving}>
                <Icon name="check" className="w-5 h-5" />
                {saving ? "저장 중..." : mp.saveButtonLabel}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.loginId}</dt>
              <dd className="font-medium text-slate-900">{form.loginId}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.name}</dt>
              <dd className="font-medium text-slate-900">{form.name}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.email}</dt>
              <dd className="font-medium text-slate-900">{form.email}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.phone}</dt>
              <dd className="font-medium text-slate-900">{form.phone}</dd>
            </div>
            <div className="flex justify-between pb-1">
              <dt className="text-slate-500">{mp.fields.company}</dt>
              <dd className="font-medium text-slate-900">{form.company}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="mb-1 text-sm font-bold text-slate-900">{mp.docsCardTitle}</h2>
        <p className="mb-2 text-xs text-slate-500">{mp.docsCardSubtitle}</p>
        <div className="divide-y divide-slate-100">
          <DocSlot docType="biz_reg" label="사업자 등록증" session={session} />
          <DocSlot docType="product_spec" label="상품 상세설명서" session={session} />
        </div>
      </Card>

      <Card className="mt-6 border-red-100 bg-red-50/40">
        <CardHeader>
          <CardTitle className="text-sm text-red-600">{mp.dangerZone.title}</CardTitle>
          <CardDescription className="text-xs text-red-500/80">{mp.dangerZone.description}</CardDescription>
        </CardHeader>
        <CardFooter className="pt-0">
          <Button
            variant="secondary"
            className="border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={handleWithdraw}
            disabled={withdrawing}
          >
            {withdrawing ? "탈퇴 처리 중..." : mp.dangerZone.buttonLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
