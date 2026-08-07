import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
