import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button } from "../components/ui";
import { govSupport as gs } from "../data/mockData";
import { buildAnalysis, pickDefaults, projectMatchesAnalysis } from "../data/mockAnalysis";
import { useAuth } from "../context/AuthContext";

export default function GovSupport() {
  const { isLoggedIn, lastQuery } = useAuth();
  const navigate = useNavigate();
  const [showLoginNotice, setShowLoginNotice] = useState(false);

  const analysis = useMemo(() => {
    if (!isLoggedIn || !lastQuery) return null;
    return buildAnalysis(lastQuery, pickDefaults(lastQuery));
  }, [isLoggedIn, lastQuery]);

  const handlePersonalizedClick = () => {
    if (!isLoggedIn) {
      setShowLoginNotice(true);
      return;
    }
    setShowLoginNotice(false);
  };

  const handleCardClick = (project) => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/gov-support" } });
      return;
    }
    navigate("/docs", { state: { program: project.title } });
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{gs.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{gs.subtitle}</p>
        </div>
        <div>
          <Button onClick={handlePersonalizedClick}>
            <Icon name="sparkle" className="h-4 w-4" />
            {gs.ctaButton}
          </Button>
          {showLoginNotice && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
              로그인이 필요한 기능입니다.
              <button
                onClick={() => navigate("/login")}
                className="whitespace-nowrap font-semibold underline"
              >
                로그인하기
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder={gs.searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Button variant="secondary">
          <Icon name="settings" className="h-4 w-4" />
          {gs.filterButton}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {gs.projects.map((p) => {
          const eligible = analysis ? projectMatchesAnalysis(p, analysis) : null;
          return (
            <Card
              key={p.id}
              onClick={() => handleCardClick(p)}
              className={`cursor-pointer overflow-hidden transition-shadow hover:shadow-md ${p.highMatch ? "border-amber-200" : ""}`}
            >
              <div className={`h-1 w-full ${p.highMatch ? "bg-amber-400" : "bg-transparent"}`} />
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <Badge tone={p.highMatch ? "warning" : "neutral"}>
                    {p.highMatch && <Icon name="sparkle" className="h-3 w-3" />}
                    {p.category}
                  </Badge>
                  <div className="flex items-center gap-2">
                    {eligible === true && (
                      <Badge tone="success">
                        <Icon name="checkCircle" className="h-3 w-3" /> 가능
                      </Badge>
                    )}
                    {eligible === false && <Badge tone="neutral">미해당</Badge>}
                    <span className={`flex items-center gap-1 text-xs font-semibold ${p.urgent ? "text-red-500" : "text-slate-400"}`}>
                      <Icon name="analysis" className="h-3.5 w-3.5" />
                      {p.dday}
                    </span>
                  </div>
                </div>

                <h3 className="mb-4 min-h-[3rem] text-base font-bold leading-snug text-slate-900">
                  {p.title}
                </h3>

                <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{gs.cardLabels.budget}</span>
                    <span className="font-semibold text-brand-700">{p.budgetLimit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{gs.cardLabels.deadline}</span>
                    <span className={`font-semibold ${p.urgent ? "text-red-500" : "text-slate-700"}`}>
                      {p.deadline}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400">출처: {p.source}</p>
                <p className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600">
                  {isLoggedIn ? "필수 서류 확인하기" : "로그인하고 서류 확인하기"}
                  <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
