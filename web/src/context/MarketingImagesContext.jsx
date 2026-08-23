import { createContext, useContext, useState } from "react";

const MarketingImagesContext = createContext(null);

export function MarketingImagesProvider({ children }) {
  const [images, setImages] = useState([]);

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
