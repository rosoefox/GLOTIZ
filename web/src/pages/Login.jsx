import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Button } from "../components/ui";
import { brand, login } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [accountType, setAccountType] = useState("user");
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login: signIn, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { accountType: actualAccountType } = await signIn({ email, password });
      if (accountType === "admin" && actualAccountType !== "admin") {
        await logout();
        setError("관리자 권한이 없습니다.");
        return;
      }
      navigate(actualAccountType === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialLogin = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* 왼쪽 브랜드 패널 — 넓은 화면에서만 표시 */}
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-brand-400/20 blur-3xl" />

        <Link to="/" className="relative z-10 flex items-center gap-2.5 text-white">
          <img src={brand.logo} alt={brand.name} className="h-9 w-9 rounded-xl object-contain" />
          <span className="text-lg font-bold tracking-tight">{brand.name}</span>
        </Link>

        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold leading-snug text-white">
            AI가 함께하는
            <br />
            전북 기업의 해외 진출
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-100/80">
            수출지원사업 매칭부터 수출 서류 자동완성까지 —
            {brand.name}와 함께 다음 수출을 준비하세요.
          </p>
        </div>

        <p className="relative z-10 text-xs text-brand-100/60">
          &copy; {new Date().getFullYear()} {brand.name}. {login.tagline}.
        </p>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-8 flex w-full max-w-sm items-center justify-between lg:hidden">
          <Link to="/" className="flex items-center gap-2 text-brand-700">
            <img src={brand.logo} alt={brand.name} className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-base font-bold">{brand.name}</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <Icon name="arrowLeft" className="h-3.5 w-3.5" />
            {login.backLabel}
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <Link
            to="/"
            className="mb-6 hidden items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 lg:flex"
          >
            <Icon name="arrowLeft" className="h-3.5 w-3.5" />
            {login.backLabel}
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">다시 만나서 반가워요</h1>
          <p className="mt-1.5 text-sm text-slate-500">계정 정보를 입력하고 계속 진행해주세요.</p>

          <div className="mt-7 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {login.accountTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAccountType(t.id)}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                  accountType === t.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">이메일</span>
              <div className="relative">
                <Icon
                  name="user"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder={login.fields.idPlaceholder}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">비밀번호</span>
              <div className="relative">
                <Icon
                  name="lock"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder={login.fields.passwordPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} className="h-4 w-4" />
                </button>
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

            {error && (
              <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">{error}</p>
            )}

            <Button type="submit" className="w-full justify-center rounded-xl py-3" disabled={submitting}>
              {submitting ? "로그인 중..." : login.submitLabel}
            </Button>

            <div className="relative py-1 text-center text-xs text-slate-400">
              <span className="relative bg-white px-3">{login.dividerLabel}</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSocialLogin(login.socialLoginUrls.google)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Icon name="globe" className="h-3.5 w-3.5" />
                Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin(login.socialLoginUrls.enterprise)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Icon name="building" className="h-3.5 w-3.5" />
                기업/기관 SSO
              </button>
            </div>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            {login.signupPrompt.text}{" "}
            <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
              {login.signupPrompt.cta}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
