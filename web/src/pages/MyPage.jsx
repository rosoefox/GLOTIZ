import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Card, Button, TextField } from "../components/ui";
import { myPage as mp } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { readErrorMessage } from "../lib/apiError";

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
  const [needsRevisionCount, setNeedsRevisionCount] = useState(0);

  useEffect(() => {
    if (!authUser) return;
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.id)
      .eq("review_status", "needs_revision")
      .then(({ count }) => setNeedsRevisionCount(count || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

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

      {needsRevisionCount > 0 && (
        <Link
          to="/my-applications"
          className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100"
        >
          <Icon name="bell" className="h-4 w-4 shrink-0" />
          {mp.needsRevisionAlert.replace("{count}", needsRevisionCount)}
        </Link>
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
