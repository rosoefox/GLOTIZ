import { createContext, useContext, useState } from "react";

const ChatbotContext = createContext(null);

export function ChatbotProvider({ children }) {
  const [open, setOpen] = useState(false);
<<<<<<< HEAD

  const openChatbot = () => setOpen(true);
  const closeChatbot = () => setOpen(false);

  return (
    <ChatbotContext.Provider value={{ open, setOpen, openChatbot, closeChatbot }}>
=======
  const [expanded, setExpanded] = useState(false);

  const openChatbot = ({ expanded: exp = false } = {}) => {
    setExpanded(exp);
    setOpen(true);
  };
  const closeChatbot = () => setOpen(false);

  return (
    <ChatbotContext.Provider value={{ open, setOpen, expanded, openChatbot, closeChatbot }}>
>>>>>>> origin/main
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}
