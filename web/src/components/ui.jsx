import { forwardRef } from "react";

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

export const Card = forwardRef(function Card({ children, className = "", ...props }, ref) {
  return (
    <div ref={ref} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
});

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    ghost: "text-brand-700 hover:bg-brand-50",
    outlineBrand: "border border-brand-300 text-brand-700 bg-brand-50/60 hover:bg-brand-50",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextField({ label, required, className = "", ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      <input
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        {...props}
      />
    </label>
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
