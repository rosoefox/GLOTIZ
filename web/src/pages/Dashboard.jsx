import { Link, useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import FloatingChatbot from "../components/FloatingChatbot";
import { dashboard } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();

  const handleSearch = (query) => {
    if (!query) return;
    navigate("/analysis", { state: { query } });
  };

  const handleImageSearch = (file) => {
    navigate("/analysis", { state: { query: file.name.replace(/\.[^/.]+$/, ""), imageSearch: true } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex justify-end p-6">
        {isLoggedIn ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user.name[0]}
            </div>
            <span className="text-sm font-semibold text-slate-800">{user.name}님</span>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            로그인
          </Link>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-32">
        <SearchBar
          heading={dashboard.greetingTitle}
          subtitle={dashboard.greetingSubtitle}
          placeholder={dashboard.searchPlaceholder}
          onSearch={handleSearch}
          onImageSearch={handleImageSearch}
        />

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {[...dashboard.recentSearches, ...dashboard.popularKeywords].map((item) => (
            <button
              key={item.label}
              onClick={() => handleSearch(item.query)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <FloatingChatbot />
    </div>
  );
}
