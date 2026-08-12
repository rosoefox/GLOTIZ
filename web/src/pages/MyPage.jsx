import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { myPage as mp } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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
  const [myDocs, setMyDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [loadingAdditionalDocs, setLoadingAdditionalDocs] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [additionalDocsError, setAdditionalDocsError] = useState("");

  useEffect(() => {
    if (!authUser) return;
    async function loadDocs() {
      setLoadingDocs(true);
      const { data: submissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      const latestByTemplate = {};
      (submissions || []).forEach((s) => {
        if (!latestByTemplate[s.template_id]) latestByTemplate[s.template_id] = s;
      });
      const latest = Object.values(latestByTemplate);

      const templateIds = latest.map((s) => s.template_id);
      const { data: templates } = templateIds.length
        ? await supabase.from("templates").select("id,name,business_id").in("id", templateIds)
        : { data: [] };
      const templateById = Object.fromEntries((templates || []).map((t) => [t.id, t]));

      const businessIds = [...new Set((templates || []).map((t) => t.business_id))];
      const { data: businesses } = businessIds.length
        ? await supabase.from("businesses").select("id,name").in("id", businessIds)
        : { data: [] };
      const businessNameById = Object.fromEntries((businesses || []).map((b) => [b.id, b.name]));

      setMyDocs(
        latest.map((s) => {
          const template = templateById[s.template_id];
          return {
            templateId: s.template_id,
            templateName: template?.name ?? "서류",
            businessName: template ? businessNameById[template.business_id] || "" : "",
            statusKey: s.review_status === "approved" ? "approved" : s.review_status === "needs_revision" ? "needsRevision" : "reviewing",
            reviewNote: s.review_note,
          };
        })
      );
      setLoadingDocs(false);
    }
    loadDocs();
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setNotifications(data || []));
  }, [authUser?.id]);

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const loadAdditionalDocs = async () => {
    if (!session) return;
    setLoadingAdditionalDocs(true);
    try {
      const res = await fetch(`${BACKEND_URL}/account/documents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "서류 목록을 불러오지 못했습니다.");
      setAdditionalDocs(data.documents || []);
    } catch (err) {
      setAdditionalDocsError(err.message);
    } finally {
      setLoadingAdditionalDocs(false);
    }
  };

  useEffect(() => {
    loadAdditionalDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleUploadAdditionalDoc = async (file) => {
    if (!file) return;
    setUploadingDoc(true);
    setAdditionalDocsError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BACKEND_URL}/account/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "업로드에 실패했습니다.");
      await loadAdditionalDocs();
    } catch (err) {
      setAdditionalDocsError(err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteAdditionalDoc = async (path) => {
    try {
      const res = await fetch(`${BACKEND_URL}/account/documents?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "삭제에 실패했습니다.");
      }
      setAdditionalDocs((prev) => prev.filter((d) => d.path !== path));
    } catch (err) {
      setAdditionalDocsError(err.message);
    }
  };

  const startEditing = () => {
    setForm((f) => ({ ...f, loginId, name, phone, company }));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ login_id: form.loginId, name: form.name, phone: form.phone, company: form.company })
      .eq("id", authUser.id);
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "탈퇴 처리에 실패했습니다.");
      }
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

      {notifications.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Icon name="bell" className="h-4 w-4 text-brand-600" />
            {mp.alarmTitle}
            {notifications.some((n) => !n.is_read) && (
              <Badge tone="danger">{notifications.filter((n) => !n.is_read).length}</Badge>
            )}
          </h2>
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markAsRead(n.id)}
                className={`block w-full rounded-xl border px-4 py-3 text-left text-sm ${
                  n.is_read ? "border-slate-100 bg-slate-50 text-slate-500" : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p>{n.message}</p>
                <p className="mt-1 text-xs opacity-70">{new Date(n.created_at).toLocaleString("ko-KR")}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

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
                <Icon name="check" className="h-4 w-4" />
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{mp.additionalDocsTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{mp.additionalDocsSubtitle}</p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            {uploadingDoc ? <Icon name="history" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="upload" className="h-3.5 w-3.5" />}
            {mp.additionalDocsUploadLabel}
            <input
              type="file"
              accept=".pdf,.docx,.hwp,.jpg,.jpeg,.png"
              className="hidden"
              disabled={uploadingDoc}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                handleUploadAdditionalDoc(file);
              }}
            />
          </label>
        </div>

        {additionalDocsError && <p className="mb-3 text-xs font-medium text-red-500">{additionalDocsError}</p>}

        {loadingAdditionalDocs ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : additionalDocs.length === 0 ? (
          <p className="text-sm text-slate-400">{mp.additionalDocsEmptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {additionalDocs.map((d) => (
              <div
                key={d.path}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-sm"
              >
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 font-medium text-slate-800 hover:text-brand-700"
                >
                  <Icon name="documents" className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{d.name}</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteAdditionalDoc(d.path)}
                  aria-label="삭제"
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-900">{mp.docStatusSectionTitle}</h2>
        {loadingDocs ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : myDocs.length === 0 ? (
          <p className="text-sm text-slate-400">{mp.docStatusEmptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {myDocs.map((d) => (
              <div
                key={d.templateId}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{d.templateName}</p>
                  {d.businessName && <p className="text-xs text-slate-400">{d.businessName}</p>}
                </div>
                <Badge tone={d.statusKey === "approved" ? "success" : d.statusKey === "needsRevision" ? "warning" : "neutral"}>
                  {mp.reviewStatusLabels[d.statusKey]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 border-red-100 bg-red-50/40 p-6">
        <h3 className="text-sm font-bold text-red-600">{mp.dangerZone.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-red-500/80">{mp.dangerZone.description}</p>
        <Button
          variant="secondary"
          className="mt-4 border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          onClick={handleWithdraw}
          disabled={withdrawing}
        >
          {withdrawing ? "탈퇴 처리 중..." : mp.dangerZone.buttonLabel}
        </Button>
      </Card>
    </div>
  );
}
