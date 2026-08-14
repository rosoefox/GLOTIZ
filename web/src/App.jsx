import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ChatbotProvider } from "./context/ChatbotContext";
import { MarketingImagesProvider } from "./context/MarketingImagesContext";
import { ExportItemsProvider } from "./context/ExportItemsContext";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import GovSupport from "./pages/GovSupport";
import GovSupportDetail from "./pages/GovSupportDetail";
import MyExportItems from "./pages/MyExportItems";
import MyPage from "./pages/MyPage";
import MyApplicationStatus from "./pages/MyApplicationStatus";
import DocumentChecklist from "./pages/DocumentChecklist";
import DocumentFill from "./pages/DocumentFill";
import TranslationEditor from "./pages/TranslationEditor";
import MarketingMaterialCreator from "./pages/MarketingMaterialCreator";
import HelpAndFaq from "./pages/HelpAndFaq";
import ShopeeListing from "./pages/ShopeeListing";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MarketingImagesProvider>
          <ExportItemsProvider>
            <ChatbotProvider>
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
            </ChatbotProvider>
          </ExportItemsProvider>
        </MarketingImagesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
