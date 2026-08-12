import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { Button } from "./ui";
import { govSupport as gs } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function LoginPopup({ onClose, onSuccess }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email, password });
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{gs.loginPopup.title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-slate-400 hover:text-slate-700">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">{gs.loginPopup.description}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password"
            required
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <Button type="submit" className="w-full justify-center py-2 text-sm" disabled={submitting}>
            {submitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          아직 계정이 없으신가요?{" "}
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="font-semibold text-brand-600 hover:underline"
          >
            회원가입
          </button>
        </p>
      </div>
    </div>
  );
}
