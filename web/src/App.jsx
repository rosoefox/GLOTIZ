import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ChatbotProvider } from "./context/ChatbotContext";
<<<<<<< HEAD
import RequireAuth from "./components/RequireAuth";
=======
import { MarketingImagesProvider } from "./context/MarketingImagesContext";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import MarketAnalysis from "./pages/MarketAnalysis";
import GovSupport from "./pages/GovSupport";
import MyExportItems from "./pages/MyExportItems";
import MyPage from "./pages/MyPage";
import DocumentChecklist from "./pages/DocumentChecklist";
import ExportDocumentForm from "./pages/ExportDocumentForm";
import DocumentPreview from "./pages/DocumentPreview";
import TranslationEditor from "./pages/TranslationEditor";
import MarketingMaterialCreator from "./pages/MarketingMaterialCreator";
import HelpAndFaq from "./pages/HelpAndFaq";
<<<<<<< HEAD
import AiDocuments from "./pages/AiDocuments";
import AiDocumentFill from "./pages/AiDocumentFill";
=======
import ShopeeListing from "./pages/ShopeeListing";
import AdminPage from "./pages/AdminPage";
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
<<<<<<< HEAD
        <ChatbotProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Dashboard />} />

            <Route element={<Layout />}>
              <Route path="/analysis" element={<MarketAnalysis />} />
              <Route path="/gov-support" element={<GovSupport />} />
              <Route path="/help" element={<HelpAndFaq />} />

              <Route path="/my-items" element={<RequireAuth><MyExportItems /></RequireAuth>} />
              <Route path="/mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
              <Route path="/docs" element={<RequireAuth><DocumentChecklist /></RequireAuth>} />
              <Route path="/docs/new" element={<RequireAuth><ExportDocumentForm /></RequireAuth>} />
              <Route path="/docs/preview" element={<RequireAuth><DocumentPreview /></RequireAuth>} />
              <Route path="/docs/translate" element={<RequireAuth><TranslationEditor /></RequireAuth>} />
              <Route path="/marketing" element={<RequireAuth><MarketingMaterialCreator /></RequireAuth>} />
              <Route path="/ai-docs" element={<RequireAuth><AiDocuments /></RequireAuth>} />
              <Route path="/ai-docs/fill" element={<RequireAuth><AiDocumentFill /></RequireAuth>} />
            </Route>
          </Routes>
        </ChatbotProvider>
=======
        <MarketingImagesProvider>
          <ChatbotProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

              <Route element={<Layout />}>
                <Route path="/analysis" element={<MarketAnalysis />} />
                <Route path="/gov-support" element={<GovSupport />} />
                <Route path="/help" element={<HelpAndFaq />} />

                <Route path="/my-items" element={<RequireAuth><MyExportItems /></RequireAuth>} />
                <Route path="/mypage" element={<RequireAuth><MyPage /></RequireAuth>} />
                <Route path="/docs" element={<RequireAuth><DocumentChecklist /></RequireAuth>} />
                <Route path="/docs/new" element={<RequireAuth><ExportDocumentForm /></RequireAuth>} />
                <Route path="/docs/preview" element={<RequireAuth><DocumentPreview /></RequireAuth>} />
                <Route path="/docs/translate" element={<RequireAuth><TranslationEditor /></RequireAuth>} />
                <Route path="/marketing" element={<RequireAuth><MarketingMaterialCreator /></RequireAuth>} />
                <Route path="/shopee" element={<RequireAuth><ShopeeListing /></RequireAuth>} />
              </Route>
            </Routes>
          </ChatbotProvider>
        </MarketingImagesProvider>
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
      </AuthProvider>
    </BrowserRouter>
  );
}
