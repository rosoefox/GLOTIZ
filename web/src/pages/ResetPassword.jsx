import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, TextField } from "../components/ui";
import { brand, resetPassword as r } from "../data/mockData";

export default function ResetPassword() {
  const [form, setForm] = useState({ id: "", newPassword: "", newPasswordConfirm: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.newPassword !== form.newPasswordConfirm) {
      setError(r.mismatchError);
      return;
    }
    setError("");
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
              <h2 className="mb-1.5 text-lg font-bold text-slate-900">{r.successTitle}</h2>
              <p className="mb-6 text-sm text-slate-500">{r.successMessage}</p>
              <Link to="/login">
                <Button className="w-full py-3">{r.backToLoginLabel}</Button>
              </Link>
            </div>
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
                <TextField
                  label={r.fields.newPasswordLabel}
                  required
                  type="password"
                  placeholder={r.fields.newPasswordPlaceholder}
                  value={form.newPassword}
                  onChange={update("newPassword")}
                />
                <TextField
                  label={r.fields.newPasswordConfirmLabel}
                  required
                  type="password"
                  placeholder={r.fields.newPasswordConfirmPlaceholder}
                  value={form.newPasswordConfirm}
                  onChange={update("newPasswordConfirm")}
                />
                {error && <p className="text-xs font-medium text-red-500">{error}</p>}
                <Button type="submit" className="w-full py-3">
                  {r.submitLabel}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
