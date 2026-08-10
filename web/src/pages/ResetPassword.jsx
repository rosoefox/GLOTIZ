<<<<<<< HEAD
import { useEffect, useState } from "react";
=======
import { useState } from "react";
>>>>>>> origin/main
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, TextField } from "../components/ui";
import { brand, resetPassword as r } from "../data/mockData";
<<<<<<< HEAD
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const [mode, setMode] = useState("request"); // request | update
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: reqError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (reqError) {
      setError(reqError.message);
      return;
    }
    setDone(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
=======

export default function ResetPassword() {
  const [form, setForm] = useState({ id: "", newPassword: "", newPasswordConfirm: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.newPassword !== form.newPasswordConfirm) {
>>>>>>> origin/main
      setError(r.mismatchError);
      return;
    }
    setError("");
<<<<<<< HEAD
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
=======
>>>>>>> origin/main
    setDone(true);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50 px-4">
      <Link
        to="/login"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white/60 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" />
        뒤로가기
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-brand-700">{brand.name}</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {done ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <Icon name="checkCircle" className="h-7 w-7" />
              </div>
<<<<<<< HEAD
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">
                {mode === "update" ? r.successTitle : r.requestSuccessTitle}
              </h2>
              <p className="mb-6 text-sm text-slate-500">
                {mode === "update" ? r.successMessage : r.requestSuccessMessage}
              </p>
=======
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">{r.successTitle}</h2>
              <p className="mb-6 text-sm text-slate-500">{r.successMessage}</p>
>>>>>>> origin/main
              <Link to="/login">
                <Button className="w-full py-3">{r.backToLoginLabel}</Button>
              </Link>
            </div>
<<<<<<< HEAD
          ) : mode === "update" ? (
            <>
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">{r.updateTitle}</h2>
              <p className="mb-5 text-sm text-slate-500">{r.updateSubtitle}</p>
              <form className="space-y-4" onSubmit={handleUpdate}>
=======
          ) : (
            <>
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">{r.title}</h2>
              <p className="mb-5 text-sm text-slate-500">{r.subtitle}</p>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <TextField
                  label={r.fields.idLabel}
                  required
                  placeholder={r.fields.idPlaceholder}
                  value={form.id}
                  onChange={update("id")}
                />
>>>>>>> origin/main
                <TextField
                  label={r.fields.newPasswordLabel}
                  required
                  type="password"
                  placeholder={r.fields.newPasswordPlaceholder}
<<<<<<< HEAD
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
=======
                  value={form.newPassword}
                  onChange={update("newPassword")}
>>>>>>> origin/main
                />
                <TextField
                  label={r.fields.newPasswordConfirmLabel}
                  required
                  type="password"
                  placeholder={r.fields.newPasswordConfirmPlaceholder}
<<<<<<< HEAD
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                />
                {error && <p className="text-xs font-medium text-red-500">{error}</p>}
                <Button type="submit" className="w-full py-3" disabled={submitting}>
                  {submitting ? "변경 중..." : r.updateSubmitLabel}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">{r.title}</h2>
              <p className="mb-5 text-sm text-slate-500">{r.subtitle}</p>
              <form className="space-y-4" onSubmit={handleRequest}>
                <TextField
                  label={r.fields.idLabel}
                  required
                  type="email"
                  placeholder={r.fields.idPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && <p className="text-xs font-medium text-red-500">{error}</p>}
                <Button type="submit" className="w-full py-3" disabled={submitting}>
                  {submitting ? "전송 중..." : r.submitLabel}
=======
                  value={form.newPasswordConfirm}
                  onChange={update("newPasswordConfirm")}
                />
                {error && <p className="text-xs font-medium text-red-500">{error}</p>}
                <Button type="submit" className="w-full py-3">
                  {r.submitLabel}
>>>>>>> origin/main
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
