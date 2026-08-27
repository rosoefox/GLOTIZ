import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { NavThemeProvider } from "./context/NavThemeContext";
import { ChatbotProvider } from "./context/ChatbotContext";
import { MarketingImagesProvider } from "./context/MarketingImagesContext";
import { MarketingGenerationProvider } from "./context/MarketingGenerationContext";
import { ExportItemsProvider } from "./context/ExportItemsContext";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
import Layout from "./components/Layout";
import NotificationAlert from "./components/NotificationAlert";
import Dashboard from "./pages/Dashboard";

// 홈(Dashboard)만 즉시 로드하고 나머지 페이지는 실제로 그 경로에 들어갈 때만 그 페이지의
// JS를 내려받는다(코드 스플리팅) — 특히 AdminPage/MarketingMaterialCreator/DocumentFill처럼
// 코드량이 큰 페이지들이 첫 진입(홈 화면) 번들에 다 같이 묶여 있었던 게 초기 로딩을 무겁게
// 만들던 원인이었다. 각 페이지는 처음 들어갈 때만 한 번 내려받고, 그 뒤로는 브라우저 캐시로 뜬다.
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const GovSupport = lazy(() => import("./pages/GovSupport"));
const GovSupportDetail = lazy(() => import("./pages/GovSupportDetail"));
const MyExportItems = lazy(() => import("./pages/MyExportItems"));
const MyPage = lazy(() => import("./pages/MyPage"));
const MyApplicationStatus = lazy(() => import("./pages/MyApplicationStatus"));
const DocumentChecklist = lazy(() => import("./pages/DocumentChecklist"));
const DocumentFill = lazy(() => import("./pages/DocumentFill"));
const TranslationEditor = lazy(() => import("./pages/TranslationEditor"));
const MarketingMaterialCreator = lazy(() => import("./pages/MarketingMaterialCreator"));
const HelpAndFaq = lazy(() => import("./pages/HelpAndFaq"));
const ShopeeListing = lazy(() => import("./pages/ShopeeListing"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-slate-400">불러오는 중...</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavThemeProvider>
          <MarketingImagesProvider>
            <MarketingGenerationProvider>
              <ExportItemsProvider>
                <ChatbotProvider>
                  <NotificationAlert />
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

                      <Route element={<Layout />}>
                        <Route path="/gov-support" element={<GovSupport />} />
                        <Route path="/gov-support/:businessId" element={<GovSupportDetail />} />
                        <Route path="/help" element={<HelpAndFaq />} />

                        <Route path="/my-items" element={<RequireAuth><MyExportItems /></RequireAuth>} />
                        <Route path="/mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
                        <Route path="/my-applications" element={<RequireAuth><MyApplicationStatus /></RequireAuth>} />
                        <Route path="/docs" element={<DocumentChecklist />} />
                        <Route path="/docs/fill/:templateId" element={<RequireAuth><DocumentFill /></RequireAuth>} />
                        <Route path="/docs/translate" element={<RequireAuth><TranslationEditor /></RequireAuth>} />
                        <Route path="/marketing" element={<RequireAuth><MarketingMaterialCreator /></RequireAuth>} />
                        <Route path="/shopee" element={<RequireAuth><ShopeeListing /></RequireAuth>} />
                      </Route>
                    </Routes>
                  </Suspense>
                </ChatbotProvider>
              </ExportItemsProvider>
            </MarketingGenerationProvider>
          </MarketingImagesProvider>
        </NavThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
