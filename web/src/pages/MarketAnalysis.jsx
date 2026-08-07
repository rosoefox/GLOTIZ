import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import SearchBar from "../components/SearchBar";
import { Badge, Card, Button } from "../components/ui";
import { marketAnalysis as ma } from "../data/mockData";
import { CATEGORIES, COUNTRIES, QUARTERS, buildAnalysis, pickDefaults } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

function OptionRow({ label, checked, onChange }) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
        checked ? "border-brand-300 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

function downloadReport(analysis) {
  const lines = [
    "시장 분석 보고서",
    `검색 상품: ${analysis.query}`,
    "",
    `핵심 요약: ${analysis.headline}`,
    "",
    "[분석 조건]",
    `카테고리: ${analysis.category.label} (${analysis.category.hsCode})`,
    `대상 국가: ${analysis.countryLabel}`,
    `분석 분기: ${analysis.quarterLabel}`,
    "",
    "[월별 수출 규모 추이]",
    ...analysis.chart.data.map((d) => `${d.month}: ${d.value}${d.highlighted ? " (성수기)" : ""}`),
    "",
    "[핵심 시장 동인]",
    ...analysis.keyMarketDrivers.map((item, i) => `${i + 1}. ${item.title} - ${item.description}`),
  ];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `시장분석_보고서_${analysis.query}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MarketAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, setLastQuery } = useAuth();

  const [query, setQuery] = useState(location.state?.query || ma.defaultQuery);
  const [isImageSearch, setIsImageSearch] = useState(!!location.state?.imageSearch);
  const [filters, setFilters] = useState(() => pickDefaults(query));
  const [resetKey, setResetKey] = useState(0);

  const analysis = useMemo(() => buildAnalysis(query, filters), [query, filters]);
  const maxVal = Math.max(...analysis.chart.data.map((d) => d.value));

  useEffect(() => {
    setLastQuery(query);
  }, [query, setLastQuery]);

  const handleSearch = (q) => {
    const nextQuery = q || ma.defaultQuery;
    setIsImageSearch(false);
    setQuery(nextQuery);
    setFilters(pickDefaults(nextQuery));
  };

  const handleNewAnalysis = () => setResetKey((k) => k + 1);

  const selectCategory = (id) => setFilters((prev) => ({ ...prev, categoryId: id }));

  const toggleCountry = (id) => {
    setFilters((prev) => {
      if (id === "all") return { ...prev, countryIds: ["all"] };
      let next = prev.countryIds.filter((c) => c !== "all");
      next = next.includes(id) ? next.filter((c) => c !== id) : [...next, id];
      return { ...prev, countryIds: next.length ? next : ["all"] };
    });
  };

  const toggleQuarter = (id) => {
    setFilters((prev) => {
      if (prev.quarterIds.includes(id)) {
        if (prev.quarterIds.length === 1) return prev;
        return { ...prev, quarterIds: prev.quarterIds.filter((q) => q !== id) };
      }
      return { ...prev, quarterIds: [...prev.quarterIds, id] };
    });
  };

  const handleCheckGovSupport = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/gov-support" } });
      return;
    }
    navigate("/gov-support");
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <SearchBar
        key={resetKey}
        size="compact"
        heading={ma.searchBar.heading}
        placeholder={ma.searchBar.placeholder}
        defaultValue={resetKey === 0 ? query : ""}
        autoFocus={resetKey > 0}
        onSearch={handleSearch}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{ma.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="text-slate-700">&ldquo;{query}&rdquo;</span> 검색 결과
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadReport(analysis)}>
            <Icon name="download" className="h-4 w-4" />
            {ma.downloadReportLabel}
          </Button>
          <Button onClick={handleNewAnalysis}>
            <Icon name="history" className="h-4 w-4" />
            {ma.newAnalysisLabel}
          </Button>
        </div>
      </div>

      {isImageSearch && (
        <Card className="mb-6 flex items-center gap-3 border-sky-100 bg-sky-50/60 p-4">
          <Icon name="camera" className="h-4 w-4 shrink-0 text-sky-600" />
          <p className="text-sm text-sky-700">{ma.imageSearchNotice}</p>
        </Card>
      )}

      <Card className="mb-6 flex gap-4 border-teal-100 bg-teal-50/60 p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
          <Icon name="sparkle" className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="success">{ma.aiExecutiveSummary.badge}</Badge>
            <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {ma.aiExecutiveSummary.live}
            </span>
          </div>
          <p className="mb-2 text-xl font-bold leading-snug text-slate-900">{analysis.headline}</p>
          <p className="text-sm leading-relaxed text-slate-600">{analysis.body}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-teal-700">
            <span className="flex items-center gap-1">
              <Icon name="checkCircle" className="h-3.5 w-3.5" /> {ma.aiExecutiveSummary.confidence}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="history" className="h-3.5 w-3.5" /> {ma.aiExecutiveSummary.updated}
            </span>
          </div>
        </div>
      </Card>

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/60 p-5">
        <p className="text-sm text-brand-800">{ma.checkGovSupportDesc}</p>
        <Button onClick={handleCheckGovSupport}>
          {ma.checkGovSupportLabel}
          <Icon name="arrowRight" className="h-4 w-4" />
        </Button>
      </Card>

      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{ma.filtersTitle}</h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Icon name="analysis" className="h-4 w-4" /> {ma.categoryLabel}
            </p>
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <OptionRow
                  key={c.id}
                  label={`${c.label} (${c.hsCode})`}
                  checked={filters.categoryId === c.id}
                  onChange={() => selectCategory(c.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Icon name="globe" className="h-4 w-4" /> {ma.countryLabel}
            </p>
            <div className="space-y-2">
              <OptionRow
                label={ma.allCountriesLabel}
                checked={filters.countryIds.includes("all")}
                onChange={() => toggleCountry("all")}
              />
              {COUNTRIES.map((c) => (
                <OptionRow key={c} label={c} checked={filters.countryIds.includes(c)} onChange={() => toggleCountry(c)} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Icon name="analysis" className="h-4 w-4" /> {ma.quarterLabel}
            </p>
            <div className="space-y-2">
              {QUARTERS.map((q) => (
                <OptionRow
                  key={q.id}
                  label={q.label}
                  checked={filters.quarterIds.includes(q.id)}
                  onChange={() => toggleQuarter(q.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h3 className="text-lg font-bold text-slate-900">
          {analysis.chart.title} {ma.chartTitleSuffix}
        </h3>
        <p className="mb-6 text-sm text-slate-500">{analysis.chart.subtitle}</p>
        <div className="flex h-56 items-end gap-2">
          {analysis.chart.data.map((d) => (
            <div key={d.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div
                className={`w-full rounded-t-md ${d.highlighted ? "bg-brand-500" : "bg-slate-200"}`}
                style={{ height: `${(d.value / maxVal) * 100}%` }}
              />
              <span className={`text-[11px] ${d.highlighted ? "font-bold text-slate-900" : "text-slate-400"}`}>
                {d.month}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
        <Icon name="growth" className="h-5 w-5 text-brand-600" />
        {ma.keyMarketDriversTitle}
      </h3>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {analysis.keyMarketDrivers.map((item) => (
          <Card key={item.title} className="p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon name={item.icon} className="h-5 w-5" />
            </div>
            <p className="mb-1.5 text-base font-bold text-slate-900">{item.title}</p>
            <p className="text-sm leading-relaxed text-slate-500">{item.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
