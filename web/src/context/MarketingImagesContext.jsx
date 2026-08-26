import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const MarketingImagesContext = createContext(null);
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function slotLabel(slot) {
  return slot
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function MarketingImagesProvider({ children }) {
  const [images, setImages] = useState([]);
  const { user, session } = useAuth();

  // 로그인 계정이 바뀌면(로그아웃 포함) 이전 사용자가 올리거나 생성한 사진이 이 브라우저 탭에
  // 그대로 남아 다음 사용자에게 보이지 않도록 목록을 비운다 — 이 컨텍스트는 페이지 이동으로
  // 언마운트되지 않고 앱 최상단에서 계속 살아있기 때문에, 계정 전환만으로는 자동으로 비워지지 않는다.
  // 그 자리를 그 사용자가 예전에 만든 이미지(서버·GCS에 남아있는 것)로 다시 채워서, 새로고침하거나
  // 나중에 다시 로그인해도 이전에 만든 이미지를 계속 볼 수 있게 한다.
  useEffect(() => {
    setImages([]);
    if (!user?.id || !session?.access_token) return;
    let cancelled = false;
    fetch(`${BACKEND_URL}/marketing/images`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : { generations: [] }))
      .then(({ generations }) => {
        if (cancelled) return;
        const restored = (generations || []).flatMap((gen) =>
          (gen.images || []).map((img) => ({
            id: img.path,
            url: img.url,
            name: slotLabel(img.slot),
          }))
        );
        if (restored.length) setImages(restored);
      })
      .catch(() => {
        // 목록을 못 불러와도 새 이미지 생성/추가는 계속 정상 동작해야 하므로 조용히 무시한다.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  const addImage = (url, name) => {
    setImages((prev) => [{ id: `img-${Date.now()}`, url, name }, ...prev]);
  };

  return (
    <MarketingImagesContext.Provider value={{ images, addImage }}>
      {children}
    </MarketingImagesContext.Provider>
  );
}

export function useMarketingImages() {
  const ctx = useContext(MarketingImagesContext);
  if (!ctx) throw new Error("useMarketingImages must be used within MarketingImagesProvider");
  return ctx;
}
