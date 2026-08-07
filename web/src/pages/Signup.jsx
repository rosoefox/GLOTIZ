import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, TextField } from "../components/ui";
import { brand, signup as s } from "../data/mockData";
import { CATEGORIES, COUNTRIES, pickDefaults } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const navigate = useNavigate();
  const { login: signIn, setLastQuery, setLastFilters } = useAuth();
  const [form, setForm] = useState({
    id: "",
    password: "",
    passwordConfirm: "",
    company: "",
    categoryId: CATEGORIES[0].id,
    country: COUNTRIES[0],
  });
  const [error, setError] = useState("");

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.password !== form.passwordConfirm) {
      setError(s.mismatchError);
      return;
    }
    setError("");
    const category = CATEGORIES.find((c) => c.id === form.categoryId);
    signIn({ remember: true, accountType: "user" });
    setLastQuery(category?.label || "");
    setLastFilters({
      categoryId: form.categoryId,
      countryIds: [form.country],
      quarterIds: pickDefaults(category?.label || "").quarterIds,
    });
    navigate("/gov-support");
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
          <p className="mt-2 text-sm text-slate-500">{s.subtitle}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-slate-900">{s.title}</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <TextField
              label={s.fields.idLabel}
              required
              placeholder={s.fields.idPlaceholder}
              value={form.id}
              onChange={update("id")}
            />
            <TextField
              label={s.fields.passwordLabel}
              required
              type="password"
              placeholder={s.fields.passwordPlaceholder}
              value={form.password}
              onChange={update("password")}
            />
            <TextField
              label={s.fields.passwordConfirmLabel}
              required
              type="password"
              placeholder={s.fields.passwordConfirmPlaceholder}
              value={form.passwordConfirm}
              onChange={update("passwordConfirm")}
            />
            <TextField
              label={s.fields.companyLabel}
              required
              placeholder={s.fields.companyPlaceholder}
              value={form.company}
              onChange={update("company")}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{s.fields.categoryLabel}</span>
              <select
                value={form.categoryId}
                onChange={update("categoryId")}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{s.fields.countryLabel}</span>
              <select
                value={form.country}
                onChange={update("country")}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="text-xs font-medium text-red-500">{error}</p>}

            <Button type="submit" className="w-full py-3">
              {s.submitLabel}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {s.loginPrompt.text}{" "}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              {s.loginPrompt.cta}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
