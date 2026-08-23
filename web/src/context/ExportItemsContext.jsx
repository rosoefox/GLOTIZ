import { createContext, useContext, useState } from "react";
import { myExportItems as mi } from "../data/mockData";

const ExportItemsContext = createContext(null);

export function ExportItemsProvider({ children }) {
  const [items, setItems] = useState(mi.items);

  const addItem = (values) => {
    const newItem = {
      id: `item-${Date.now()}`,
      name: values.name || "새 품목",
      category: "기타",
      destination: values.destination,
      status: "inProgress",
      basicInfoDone: true,
      govPrograms: values.govPrograms,
      updatedAt: new Date().toLocaleDateString("ko-KR"),
    };
    setItems((prev) => [newItem, ...prev]);
    return newItem;
  };

  const updateItem = (id, values) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, ...values, basicInfoDone: true, updatedAt: new Date().toLocaleDateString("ko-KR") }
          : it
      )
    );
  };

  return (
    <ExportItemsContext.Provider value={{ items, addItem, updateItem }}>
      {children}
    </ExportItemsContext.Provider>
  );
}

export function useExportItems() {
  const ctx = useContext(ExportItemsContext);
  if (!ctx) throw new Error("useExportItems must be used within ExportItemsProvider");
  return ctx;
}
