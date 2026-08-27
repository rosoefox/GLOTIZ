import { forwardRef } from "react";
import Icon from "./Icon";

// 서류 작성류(폼) 화면 전반에서 공유하는 인풋 스타일 — 필(pill) 형태 대신 슬림한 사각 테두리로 통일한다.
export const CONTROL_CLASS =
  "w-full rounded-none border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-50";

// 아직 안 채운 필수 입력창을 은은한 브랜드 컬러 글로우로 표시한다. CONTROL_CLASS에 그냥
// border-brand-* 클래스를 덧붙이면 border-slate-300과 같은 우선순위(단일 클래스 선택자)라
// Tailwind가 스타일시트에 적어둔 순서에 따라 승패가 갈려 안 보일 수 있다 — border-slate-300을
// 아예 다른 색으로 치환해서 항상 하나의 border-color 클래스만 남도록 한다.
export function emptyFieldClass(isEmpty) {
  if (!isEmpty) return CONTROL_CLASS;
  return `${CONTROL_CLASS.replace("border-slate-300", "border-brand-300").replace("bg-white", "bg-brand-50/40")} ring-4 ring-brand-100/60`;
}

export function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    brand: "bg-brand-50 text-brand-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-600",
    success: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

// 카드 디자인 시스템 (shadcn/ui 구조 참고) — 모서리는 단정하게, 그림자는 최소한으로,
// 여백은 하위 컴포넌트(CardHeader/CardContent/CardFooter)가 각자 p-6으로 맞춘다.
// Card 자체엔 여백을 주지 않으므로, 기존처럼 <Card className="p-6"> 형태로 바로 써도 된다.
export const Card = forwardRef(function Card({ children, className = "", interactive = false, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={`rounded-none border border-slate-200 bg-white shadow-sm ${
        interactive ? "cursor-pointer transition-colors duration-150 hover:border-slate-400" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export function CardHeader({ children, className = "" }) {
  return <div className={`flex flex-col gap-1 p-6 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }) {
  return <h3 className={`text-lg font-semibold text-slate-900 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = "" }) {
  return <p className={`text-sm text-slate-500 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = "" }) {
  return <div className={`p-6 pt-0 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }) {
  return <div className={`flex items-center gap-2 p-6 pt-0 ${className}`}>{children}</div>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    ghost: "text-brand-700 hover:bg-brand-50",
    outlineBrand: "border border-brand-300 text-brand-700 bg-brand-50/60 hover:bg-brand-50",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-none px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextField({ label, required, className = "", inputClassName = "", ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      <input className={`${CONTROL_CLASS} h-10 ${inputClassName}`} {...props} />
    </label>
  );
}

// 여러 섹션(카드)으로 나뉜 폼의 상단에 두는 단계 표시줄. 각 단계는 스크롤 위치나 명시적
// currentIndex로 활성화되며, 지나간 단계는 체크로 바뀐다.
export function StepIndicator({ steps, activeIndex }) {
  return (
    <ol className="flex items-center">
      {steps.map((label, i) => (
        <li key={label} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < activeIndex
                  ? "bg-brand-600 text-white"
                  : i === activeIndex
                    ? "border-2 border-brand-600 text-brand-600"
                    : "border border-slate-300 text-slate-400"
              }`}
            >
              {i < activeIndex ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <span
              className={`hidden text-xs font-semibold sm:inline ${
                i <= activeIndex ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 h-px flex-1 ${i < activeIndex ? "bg-brand-600" : "bg-slate-200"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}

// 각 섹션 카드 헤더에 붙이는 "Step N" 라벨 + 섹션 제목.
export function SectionCardHeader({ step, title }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
      {step != null && <span className="text-xs font-bold uppercase tracking-wide text-brand-600">Step {step}</span>}
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
    </div>
  );
}

// 폼 필드 라벨 (TextField가 아닌 커스텀 인풋에 쓸 때).
export function FieldLabel({ children, required }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children} {required && <span className="text-red-500">*</span>}
    </span>
  );
}

export function SectionTitle({ icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
      {icon}
      {children}
    </h2>
  );
}
