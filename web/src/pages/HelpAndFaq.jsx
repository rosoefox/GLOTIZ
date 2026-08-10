import { useState } from "react";
import Icon from "../components/Icon";
import { Card, Button } from "../components/ui";
import { helpAndFaq as hf } from "../data/mockData";
<<<<<<< HEAD
=======
import { useChatbot } from "../context/ChatbotContext";
>>>>>>> origin/main

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
<<<<<<< HEAD
=======
  const { openChatbot } = useChatbot();

>>>>>>> origin/main
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
            <p className="mt-1 max-w-md text-sm text-slate-500">{hf.chatBanner.description}</p>
          </div>
        </div>
<<<<<<< HEAD
        <Button className="whitespace-nowrap">
=======
        <Button className="whitespace-nowrap" onClick={() => openChatbot({ expanded: true })}>
>>>>>>> origin/main
          {hf.chatBanner.ctaLabel}
          <Icon name="arrowRight" className="h-4 w-4" />
        </Button>
      </Card>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {hf.categories.map((c) => (
          <button
            key={c.id}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 hover:border-brand-300 hover:bg-brand-50"
          >
            <Icon name={c.icon} className="h-6 w-6 text-brand-600" />
            <span className="text-sm font-medium text-slate-700">{c.label}</span>
          </button>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">{hf.faqSectionTitle}</h2>
        <div>
          {hf.faqs.map((f) => (
            <FaqItem key={f.question} {...f} />
          ))}
        </div>
      </Card>
    </div>
  );
}
