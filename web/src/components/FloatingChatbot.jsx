import { useState } from "react";
import Icon from "./Icon";
import { helpAndFaq } from "../data/mockData";

function findAnswer(question) {
  const trimmed = question.trim();
  if (!trimmed) return null;
  const exact = helpAndFaq.faqs.find((f) => f.question === trimmed);
  if (exact) return exact.answer;
  const loose = helpAndFaq.faqs.find((f) => f.question.includes(trimmed) || trimmed.includes(f.question.slice(0, 6)));
  return loose ? loose.answer : helpAndFaq.floatingChatbot.fallbackAnswer;
}

export default function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const { floatingChatbot: fc, faqs } = helpAndFaq;

  const ask = (question) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", message: trimmed },
      { role: "ai", message: findAnswer(trimmed) },
    ]);
    setInput("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {open && (
        <div className="mb-3 flex h-[420px] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Icon name="chatbot" className="h-5 w-5" />
              <span className="text-sm font-semibold">{fc.title}</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="닫기">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              {fc.greeting}
            </div>

            {messages.length === 0 && (
              <div className="space-y-1.5">
                <p className="px-1 text-xs font-medium text-slate-400">{fc.suggestionsLabel}</p>
                {faqs.map((f) => (
                  <button
                    key={f.question}
                    onClick={() => ask(f.question)}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 shadow-sm hover:border-brand-300 hover:bg-brand-50"
                  >
                    {f.question}
                  </button>
                ))}
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
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={fc.inputPlaceholder}
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
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
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
        )}
      </button>
    </div>
  );
}
