import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import SearchBar from "../components/SearchBar";
import { Badge, Card, Button } from "../components/ui";
import { marketAnalysis as ma } from "../data/mockData";
import { CATEGORIES, COUNTRIES, QUARTERS, resolveFilters, pickDefaults } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const STORAGE_KEY = "jbxport.marketAnalysis";

function readPersistedSearch() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (typeof parsed?.query !== "string" || !parsed?.filters) return null;
    return parsed;
  } catch {
    return null;
  }
}

function searchKey(query, filters) {
  return JSON.stringify({ query, filters });
}

function OptionRow({ label, checked, onChange, disabled }) {
  if (disabled) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
          checked ? "border-brand-300 bg-brand-50 text-brand-800 font-semibold" : "border-slate-200 text-slate-400"
        }`}
      >
        {checked ? <Icon name="check" className="h-4 w-4 text-brand-600" /> : <span className="h-4 w-4" />}
        {label}
      </div>
    );
  }
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
    `카테고리: ${analysis.category.label}`,
    `상품 HS코드: ${analysis.productHsCode}`,
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
  const { setLastQuery, setLastFilters } = useAuth();

  // 새로 검색(location.state.query)한 게 아니면, 지난번 검색 결과를 그대로 복원한다 —
  // 페이지를 벗어났다 다시 들어와도(사이드바 클릭 등) 검색 버튼을 누르기 전까진 재조회하지 않는다.
  const initial = useRef(null);
  if (initial.current === null) {
    const persisted = location.state?.query ? null : readPersistedSearch();
    const initQuery = location.state?.query || persisted?.query || "";
    const initFilters = location.state?.query ? pickDefaults(location.state.query) : persisted?.filters || pickDefaults("");
    const initAnalysis = persisted && persisted.query === initQuery ? persisted.analysis || null : null;
    initial.current = { query: initQuery, filters: initFilters, analysis: initAnalysis };
  }

  const [query, setQuery] = useState(initial.current.query);
  const [isImageSearch, setIsImageSearch] = useState(!!location.state?.imageSearch);
  const [filters, setFilters] = useState(initial.current.filters);
  const resolved = useMemo(() => resolveFilters(query, filters), [query, filters]);
  const [analysis, setAnalysis] = useState(initial.current.analysis);
  const [loading, setLoading] = useState(!initial.current.analysis);
  const [error, setError] = useState("");
  const fetchedKey = useRef(initial.current.analysis ? searchKey(initial.current.query, initial.current.filters) : null);
  const maxVal = analysis ? Math.max(1, ...analysis.chart.data.map((d) => d.value)) : 1;

  useEffect(() => {
    setLastQuery(query);
    setLastFilters(filters);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ query, filters, analysis }));
    } catch {
      // localStorage 사용 불가(프라이빗 모드 등) 시 그냥 세션 내 상태만 유지
    }
  }, [query, filters, analysis, setLastQuery, setLastFilters]);

  useEffect(() => {
    const key = searchKey(query, filters);
    if (fetchedKey.current === key) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${BACKEND_URL}/market-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        category_id: filters.categoryId,
        country_ids: filters.countryIds,
        quarter_ids: filters.quarterIds,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("market analysis request failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setAnalysis(data);
          fetchedKey.current = key;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnalysis(null);
          setError("실시간 시장 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, filters]);

  const handleSearch = (q) => {
    const nextQuery = (q || "").trim();
    if (!nextQuery) return;
    setIsImageSearch(false);
    setQuery(nextQuery);
    setFilters(pickDefaults(nextQuery));
  };

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
    navigate("/gov-support");
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <SearchBar
        size="compact"
        heading={ma.searchBar.heading}
        placeholder={ma.searchBar.placeholder}
        defaultValue={query}
        onSearch={handleSearch}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{ma.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="text-slate-700">&ldquo;{resolved.query}&rdquo;</span> 검색 결과
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!analysis} onClick={() => analysis && downloadReport(analysis)}>
            <Icon name="download" className="h-4 w-4" />
            {ma.downloadReportLabel}
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
          {loading && <p className="text-sm text-slate-500">관세청 수출입 데이터를 조회하고 AI 분석을 생성하는 중...</p>}
          {!loading && error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && analysis && (
            <>
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
            </>
          )}
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
            <p className="mb-3 text-xs text-slate-400">검색어에 따라 자동으로 정해지며 직접 바꿀 수 없습니다.</p>
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <OptionRow key={c.id} label={`${c.label} (${c.hsCode})`} checked={filters.categoryId === c.id} disabled />
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-sm">
              <p className="text-slate-500">{resolved.query} 상품 HS코드</p>
              <p className="font-semibold text-slate-800">
                {loading ? "조회 중..." : analysis ? analysis.productHsCode : "-"}
              </p>
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
          {analysis ? analysis.chart.title : "월별 수출 규모 추이"} {ma.chartTitleSuffix}
        </h3>
        <p className="mb-6 text-sm text-slate-500">
          {analysis ? analysis.chart.subtitle : `${resolved.countryLabel} · 관세청 수출입무역통계 기준`}
        </p>
        {loading && <p className="py-10 text-center text-sm text-slate-400">관세청 수출입 데이터를 불러오는 중...</p>}
        {!loading && analysis && (
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
        )}
        {!loading && !analysis && <p className="py-10 text-center text-sm text-red-400">{error}</p>}
        {!loading && analysis && !analysis.hasTradeData && (
          <p className="mt-3 text-xs text-slate-400">
            선택한 조건에 대한 관세청 수출 실적 데이터가 조회되지 않았습니다. 다른 카테고리·국가 조합으로 다시 검색해보세요.
          </p>
        )}
      </Card>

      {analysis && analysis.keyMarketDrivers?.length > 0 && (
        <>
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
        </>
      )}
    </div>
  );
}
