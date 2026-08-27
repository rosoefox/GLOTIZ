import { createContext, useContext, useEffect, useState } from "react";

// 상단 네비게이션 색상을 현재 페이지/섹션의 배경에 맞춘다. Header는 Dashboard(홈)에서는
// 자체 렌더링, 나머지 페이지에서는 Layout이 렌더링하는 등 렌더 위치가 갈라져 있어서 prop으로
// 내려주기 번거롭다 — Context로 어디서든 "지금 이 색으로 보여줘"라고 알릴 수 있게 한다.
const NavThemeContext = createContext({ variant: "light", setVariant: () => {} });

export function NavThemeProvider({ children }) {
  const [variant, setVariant] = useState("light");
  return <NavThemeContext.Provider value={{ variant, setVariant }}>{children}</NavThemeContext.Provider>;
}

export function useNavTheme() {
  return useContext(NavThemeContext);
}

// 페이지 전체가 배경색 하나로 고정된 경우 쓰는 헬퍼 — 마운트 중엔 지정한 색, 다른 페이지로
// 넘어가면(언마운트) 기본값(light)으로 되돌린다.
export function useNavVariant(variant) {
  const { setVariant } = useNavTheme();
  useEffect(() => {
    setVariant(variant);
    return () => setVariant("light");
  }, [variant, setVariant]);
}
