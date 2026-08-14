import { useMemo, useState } from "react";
import Icon from "./Icon";
import { helpAndFaq } from "../data/mockData";
import { useChatbot } from "../context/ChatbotContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function FloatingChatbot() {
  const { open, setOpen } = useChatbot();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastAsked, setLastAsked] = useState("");
  const { floatingChatbot: fc, faqs } = helpAndFaq;

  const relatedFaqs = useMemo(() => {
    const basis = (lastAsked || messages.filter((m) => m.role === "user").slice(-1)[0]?.message || "").toLowerCase();
    const tokens = basis
      .split(/[\s,.;!?/()]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    return [...faqs]
      .map((faq) => {
        const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
        const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
        return { ...faq, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [faqs, lastAsked, messages]);

  const ask = async (question) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setLastAsked(trimmed);
    setInput("");

    const exact = faqs.find((f) => f.question === trimmed);
    if (exact) {
      setMessages((prev) => [...prev, { role: "user", message: trimmed }, { role: "ai", message: exact.answer }]);
      return;
    }

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", message: trimmed }]);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      if (!res.ok) throw new Error("chat request failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "ai", message: data.answer || fc.fallbackAnswer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", message: fc.fallbackAnswer }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div
          className={`mb-3 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl transition-all duration-200 ${
            expanded ? "h-[80vh] w-[36rem] max-w-[90vw]" : "h-[420px] w-80"
          }`}
        >
          <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Icon name="chatbot" className="h-5 w-5" />
              <span className="text-sm font-semibold">{fc.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "화면 줄이기" : "화면 키우기"}
                className="text-white/80 hover:text-white"
              >
                <Icon name={expanded ? "collapse" : "expand"} className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} aria-label="닫기">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              {fc.greeting}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-400">{fc.suggestionsLabel}</p>
                <span className="text-[11px] text-slate-400">항상 표시</span>
              </div>
              <div className="space-y-1.5">
                {faqs.map((f) => (
                  <button
                    key={f.question}
                    onClick={() => ask(f.question)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-600 shadow-sm hover:border-brand-300 hover:bg-brand-50"
                  >
                    {f.question}
                  </button>
                ))}
              </div>
            </div>

            {lastAsked && relatedFaqs.length > 0 && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
                <div className="mb-2">
                  <p className="text-xs font-bold text-brand-700">관련 질문 추천</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-brand-700/70">
                    {relatedFaqs[0]?.answer || fc.fallbackAnswer}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {relatedFaqs.map((faq) => (
                    <button
                      key={faq.question}
                      onClick={() => ask(faq.question)}
                      className="block w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm hover:bg-brand-50"
                    >
                      {faq.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((turn, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  turn.role === "user"
                    ? "ml-auto rounded-tr-sm bg-brand-600 text-white"
                    : "rounded-tl-sm bg-white text-slate-700"
                }`}
              >
                {turn.message}
              </div>
            ))}

            {loading && (
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">
                답변을 생성하는 중...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={fc.inputPlaceholder}
              disabled={loading}
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              aria-label="질문 보내기"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-700"
        aria-label="AI 챗봇 열기"
      >
        <Icon name={open ? "x" : "chatbot"} className="h-6 w-6" />
      </button>
    </div>
  );
}
