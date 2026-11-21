import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { InsureMateProvider } from './context/InsureMateContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { FindInsurancePage } from './pages/FindInsurancePage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { PolicyDetailsPage } from './pages/PolicyDetailsPage';
import { ComparePage } from './pages/ComparePage';
import { SavedPlansPage } from './pages/SavedPlansPage';
import { ProfilePage } from './pages/ProfilePage';
import { AboutPage } from './pages/AboutPage';

export default function App() {
  return (
    <BrowserRouter>
      <InsureMateProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/find" element={<FindInsurancePage />} />
            <Route path="/recommendations" element={<RecommendationsPage />} />
            <Route path="/recommendations/:sessionId" element={<RecommendationsPage />} />
            <Route path="/policies/:id" element={<PolicyDetailsPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/saved" element={<SavedPlansPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </InsureMateProvider>
    </BrowserRouter>
  );
}
