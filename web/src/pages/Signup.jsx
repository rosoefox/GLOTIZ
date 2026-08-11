import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, TextField } from "../components/ui";
import { brand, login, signup as s } from "../data/mockData";
import { CATEGORIES, COUNTRIES, pickDefaults } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const navigate = useNavigate();
  const { signup, setLastQuery, setLastFilters } = useAuth();
  const [accountType, setAccountType] = useState("user");
  const [form, setForm] = useState({
    loginId: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
    company: "",
    categoryId: CATEGORIES[0].id,
    country: COUNTRIES[0],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.passwordConfirm) {
      setError(s.mismatchError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { session } = await signup({
        email: form.email,
        password: form.password,
        loginId: form.loginId,
        name: form.name,
        phone: form.phone,
        company: form.company,
        categoryId: form.categoryId,
        country: form.country,
        accountType,
      });

      if (!session) {
        // 이메일 확인이 켜져 있는 프로젝트는 가입 직후 세션이 없다.
        setNeedsConfirmation(true);
        setSubmitting(false);
        return;
      }

      if (accountType === "admin") {
        navigate("/admin");
        return;
      }

      const category = CATEGORIES.find((c) => c.id === form.categoryId);
      setLastQuery(category?.label || "");
      setLastFilters({
        categoryId: form.categoryId,
        countryIds: [form.country],
        quarterIds: pickDefaults(category?.label || "").quarterIds,
      });
      navigate("/gov-support");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">이메일을 확인해주세요</h2>
          <p className="mt-2 text-sm text-slate-500">
            {form.email}로 인증 메일을 보냈습니다. 메일함에서 링크를 클릭한 뒤 로그인해주세요.
          </p>
          <Link to="/login">
            <Button className="mt-6 w-full py-3">로그인으로 이동</Button>
          </Link>
        </div>
      </div>
    );
  }

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
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{login.accountTypeLabel}</span>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                {login.accountTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAccountType(t.id)}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                      accountType === t.id
                        ? "bg-white text-brand-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <TextField
              label={s.fields.loginIdLabel}
              required
              placeholder={s.fields.loginIdPlaceholder}
              value={form.loginId}
              onChange={update("loginId")}
            />
            <TextField
              label={s.fields.nameLabel}
              required
              placeholder={s.fields.namePlaceholder}
              value={form.name}
              onChange={update("name")}
            />
            <TextField
              label={s.fields.idLabel}
              required
              type="email"
              placeholder={s.fields.idPlaceholder}
              value={form.email}
              onChange={update("email")}
            />
            <TextField
              label={s.fields.phoneLabel}
              required
              type="tel"
              placeholder={s.fields.phonePlaceholder}
              value={form.phone}
              onChange={update("phone")}
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

            <Button type="submit" className="w-full py-3" disabled={submitting}>
              {submitting ? "가입 처리 중..." : s.submitLabel}
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
