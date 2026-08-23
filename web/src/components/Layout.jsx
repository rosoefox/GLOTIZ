import { Outlet } from "react-router-dom";
import Header from "./Header";
import FloatingChatbot from "./FloatingChatbot";

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <FloatingChatbot />
    </div>
  );
}
