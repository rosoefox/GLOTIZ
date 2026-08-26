import { createContext, useContext, useState } from "react";

// AI 이미지 생성은 몇십 초씩 걸리는데, 예전엔 이 상태(generating/결과)가 MarketingMaterialCreator
// 페이지 컴포넌트 안의 useState였다 — 생성 중에 다른 페이지로 이동하면 그 컴포넌트가 언마운트되고,
// 이미 날아간 fetch 요청이 나중에 응답을 받아도 이제 존재하지 않는 컴포넌트의 setState를 부르는
// 셈이라 결과가 조용히 유실됐다(React가 언마운트된 컴포넌트의 상태 갱신을 그냥 무시한다). 이
// 상태를 앱 최상단에서 페이지 이동으로 언마운트되지 않는 이 컨텍스트로 옮겨서, 생성 도중 다른
// 페이지에 갔다 와도 진행 상황과 결과를 그대로 이어볼 수 있게 한다.
const MarketingGenerationContext = createContext(null);

export function MarketingGenerationProvider({ children }) {
  const [stage, setStage] = useState("setup");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedResult, setGeneratedResult] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);

  return (
    <MarketingGenerationContext.Provider
      value={{
        stage,
        setStage,
        generating,
        setGenerating,
        generateError,
        setGenerateError,
        generatedResult,
        setGeneratedResult,
        versionHistory,
        setVersionHistory,
      }}
    >
      {children}
    </MarketingGenerationContext.Provider>
  );
}

export function useMarketingGeneration() {
  const ctx = useContext(MarketingGenerationContext);
  if (!ctx) throw new Error("useMarketingGeneration must be used within MarketingGenerationProvider");
  return ctx;
}
