import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { helpAndFaq as hf } from "../data/mockData";
import { useChatbot } from "../context/ChatbotContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-slate-800">{question}</span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-slate-500">{answer}</p>}
    </div>
  );
}

export default function HelpAndFaq() {
  const { openChatbot } = useChatbot();
  const [faqs, setFaqs] = useState(hf.faqs);
  const [loadingFaqs, setLoadingFaqs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/faq/suggest`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && Array.isArray(data.faqs) && data.faqs.length) setFaqs(data.faqs);
      })
      .catch(() => {
        // AI 추천 실패 시 mockData의 고정 FAQ를 그대로 보여준다.
      })
      .finally(() => {
        if (!cancelled) setLoadingFaqs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900">{hf.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{hf.subtitle}</p>
      </div>

      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 border-brand-100 bg-gradient-to-r from-brand-50 to-white p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Icon name="chatbot" className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{hf.chatBanner.title}</h2>
            <p className="mt-1 whitespace-nowrap text-sm text-slate-500">{hf.chatBanner.description}</p>
          </div>
        </div>
        <Button className="whitespace-nowrap" onClick={openChatbot}>
          {hf.chatBanner.ctaLabel}
          <Icon name="arrowRight" className="h-4 w-4" />
        </Button>
      </Card>

      <Card className="p-6">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">{hf.faqSectionTitle}</h2>
          {loadingFaqs ? (
            <span className="text-xs font-medium text-slate-400">AI가 질문을 고르는 중...</span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              <Icon name="sparkle" className="h-3 w-3" />
              AI 추천
            </span>
          )}
        </div>
        <div>
          {faqs.map((f) => (
            <FaqItem key={f.question} {...f} />
          ))}
        </div>
      </Card>
    </div>
  );
}
