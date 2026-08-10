import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Button } from "../components/ui";
import { brand, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [remember, setRemember] = useState(false);
  const [accountType, setAccountType] = useState("user");
  const { login: signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const goAfterLogin = () =>
    navigate(location.state?.from || (accountType === "admin" ? "/admin" : "/gov-support"));

  const handleLogin = (e) => {
    e.preventDefault();
    signIn({ remember, accountType });
    goAfterLogin();
  };

  const handleSocialLogin = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    signIn({ remember, accountType });
    goAfterLogin();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50 px-4">
      <Link
        to="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white/60 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="h-4 w-4" />
        {login.backLabel}
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-brand-700">{brand.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{login.tagline}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <form className="space-y-5" onSubmit={handleLogin}>
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

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">아이디</span>
              <div className="relative">
                <Icon name="user" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder={login.fields.idPlaceholder}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">비밀번호</span>
              <div className="relative">
                <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder={login.fields.passwordPlaceholder}
                />
              </div>
            </label>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {login.options[0]}
              </label>
              <Link to="/reset-password" className="font-medium text-brand-600 hover:underline">
                {login.options[1]}
              </Link>
            </div>

            <Button type="submit" className="w-full py-3">
              {login.submitLabel}
            </Button>

            <div className="relative py-2 text-center text-xs text-slate-400">
              <span className="relative bg-white px-3">{login.dividerLabel}</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full py-2.5"
              onClick={() => handleSocialLogin(login.socialLoginUrls.google)}
            >
              <Icon name="globe" className="h-4 w-4" />
              {login.socialLogins[0]}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full py-2.5"
              onClick={() => handleSocialLogin(login.socialLoginUrls.enterprise)}
            >
              <Icon name="building" className="h-4 w-4" />
              {login.socialLogins[1]}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {login.signupPrompt.text}{" "}
            <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
              {login.signupPrompt.cta}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/" className="hover:underline">
            ← 대시보드로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
