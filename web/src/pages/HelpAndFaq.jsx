import { useState } from "react";
import Icon from "../components/Icon";
import { Card, CardHeader, CardTitle, CardContent, Button } from "../components/ui";
import { helpAndFaq as hf } from "../data/mockData";
import { useChatbot } from "../context/ChatbotContext";
import { useNavVariant } from "../context/NavThemeContext";

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
          className={`w-5 h-5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-slate-500">{answer}</p>}
    </div>
  );
}

export default function HelpAndFaq() {
  const { openChatbot } = useChatbot();
  useNavVariant("navy");

  return (
    <div className="flex flex-col">
      {/* 구분선 위쪽 배경 — 제목/부제만 남색 헤더로 묶는다. */}
      <div className="w-full border-b border-slate-200 bg-[#122955]">
        <div className="mx-auto max-w-4xl px-8 py-8 text-center">
          <h1 className="text-3xl font-bold" style={{ color: "#e6f5f0" }}>
            {hf.title}
          </h1>
          <p className="mt-2 text-sm text-slate-300">{hf.subtitle}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-8 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Icon name="chatbot" className="w-5 h-5 shrink-0 text-slate-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900">{hf.chatBanner.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{hf.chatBanner.description}</p>
            </div>
          </div>
          <Button className="whitespace-nowrap" onClick={openChatbot}>
            {hf.chatBanner.ctaLabel}
            <Icon name="arrowRight" className="w-5 h-5" />
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>{hf.faqSectionTitle}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hf.faqs.map((f) => (
              <FaqItem key={f.question} {...f} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
