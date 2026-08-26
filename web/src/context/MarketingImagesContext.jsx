import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const MarketingImagesContext = createContext(null);
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const RECENT_LIMIT = 9;

function slotLabel(slot) {
  return slot
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

// 새로 생성한 이미지를 목록 맨 앞에 추가한 뒤, 북마크되지 않은 것들 중 최근 9개를 넘는 건
// 잘라낸다 - 서버가 /marketing/images에서 돌려주는 "최근 9장 + 북마크" 구성과 항상 같은 모양을
// 유지해야, 새로고침 전후로 목록이 갑자기 늘었다 줄었다 하지 않는다.
function trimToRecentPlusBookmarked(list) {
  let recentCount = 0;
  const kept = [];
  for (const img of list) {
    if (img.bookmarked) {
      kept.push(img);
      continue;
    }
    if (recentCount >= RECENT_LIMIT) continue;
    recentCount += 1;
    kept.push(img);
  }
  return kept;
}

export function MarketingImagesProvider({ children }) {
  const [images, setImages] = useState([]);
  const { user, session } = useAuth();

  // 로그인 계정이 바뀌면(로그아웃 포함) 이전 사용자가 올리거나 생성한 사진이 이 브라우저 탭에
  // 그대로 남아 다음 사용자에게 보이지 않도록 목록을 비운다 — 이 컨텍스트는 페이지 이동으로
  // 언마운트되지 않고 앱 최상단에서 계속 살아있기 때문에, 계정 전환만으로는 자동으로 비워지지 않는다.
  // 그 자리를 그 사용자가 예전에 만든 이미지(서버·GCS에 남아있는 것)로 다시 채워서, 새로고침하거나
  // 나중에 다시 로그인해도 이전에 만든 이미지를 계속 볼 수 있게 한다. 서버가 이미 "최근 9장 +
  // 북마크"만 추려서 돌려주므로(AI 생성 서버에 과부하를 주지 않기 위함) 여기서는 그대로 쓴다.
  useEffect(() => {
    setImages([]);
    if (!user?.id || !session?.access_token) return;
    let cancelled = false;
    fetch(`${BACKEND_URL}/marketing/images`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then(({ images: rows }) => {
        if (cancelled) return;
        const restored = (rows || []).map((img) => ({
          id: img.path,
          url: img.url,
          name: slotLabel(img.slot),
          path: img.path,
          bookmarked: Boolean(img.bookmarked),
        }));
        if (restored.length) setImages(restored);
      })
      .catch(() => {
        // 목록을 못 불러와도 새 이미지 생성/추가는 계속 정상 동작해야 하므로 조용히 무시한다.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  const addImage = (url, name, path = null) => {
    setImages((prev) => trimToRecentPlusBookmarked([{ id: path || `img-${Date.now()}`, url, name, path, bookmarked: false }, ...prev]));
  };

  // 북마크는 낙관적으로 먼저 바꾸고, 실패하면 조용히 되돌린다 — 별도 DB 테이블 없이 GCS 오브젝트
  // 메타데이터로 저장하는 방식이라 서버 응답을 기다리지 않아도 실패 확률이 낮다.
  const toggleBookmark = async (image) => {
    if (!image.path || !session?.access_token) return;
    const nextBookmarked = !image.bookmarked;
    setImages((prev) =>
      trimToRecentPlusBookmarked(
        prev.map((img) => (img.id === image.id ? { ...img, bookmarked: nextBookmarked } : img))
      )
    );
    try {
      const res = await fetch(`${BACKEND_URL}/marketing/images/bookmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ path: image.path, bookmarked: nextBookmarked }),
      });
      if (!res.ok) throw new Error("bookmark request failed");
    } catch {
      setImages((prev) =>
        trimToRecentPlusBookmarked(
          prev.map((img) => (img.id === image.id ? { ...img, bookmarked: !nextBookmarked } : img))
        )
      );
    }
  };

  const bookmarkedImages = images.filter((img) => img.bookmarked);
  const recentImages = images.filter((img) => !img.bookmarked);

  return (
    <MarketingImagesContext.Provider
      value={{ images, bookmarkedImages, recentImages, addImage, toggleBookmark }}
    >
      {children}
    </MarketingImagesContext.Provider>
  );
}

export function useMarketingImages() {
  const ctx = useContext(MarketingImagesContext);
  if (!ctx) throw new Error("useMarketingImages must be used within MarketingImagesProvider");
  return ctx;
}
