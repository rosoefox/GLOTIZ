import { useRef, useState } from "react";
import Icon from "./Icon";

export default function SearchBar({
  heading,
  subtitle,
  placeholder,
  defaultValue = "",
  onSearch,
  onImageSearch,
  size = "large",
  autoFocus = false,
}) {
  const [value, setValue] = useState(defaultValue);
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch?.(value.trim());
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onImageSearch?.(file);
  };

  if (size === "compact") {
    return (
      <form onSubmit={handleSubmit} className="mb-6">
        {heading && <h2 className="mb-3 text-lg font-bold text-slate-900">{heading}</h2>}
        <div className="relative max-w-xl">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col items-center">
<<<<<<< HEAD
      <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-brand-800 md:text-6xl">{heading}</h1>
      {subtitle && <p className="mb-12 text-center text-base font-medium text-brand-600">{subtitle}</p>}
=======
      <h1 className="mb-2 text-center text-5xl font-extrabold tracking-tight text-brand-800 md:text-6xl">{heading}</h1>
      {subtitle && <p className="mb-8 text-center text-base font-medium text-brand-600">{subtitle}</p>}
>>>>>>> origin/main
      <div className="relative w-full max-w-2xl">
        <Icon
          name="search"
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-full border border-brand-200 bg-white py-4 pl-14 pr-14 text-base shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-500 hover:text-brand-700"
          aria-label="이미지로 검색"
        >
          <Icon name="camera" className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </form>
  );
}
