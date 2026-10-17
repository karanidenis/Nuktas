import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth, getStoredToken } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AsrIntakePage } from "./pages/AsrIntakePage";
import { AsrConversationPage } from "./pages/AsrConversationPage";
import { TriageReviewPage } from "./pages/TriageReviewPage";

function AppRoutes() {
  const { user, token, loading, error, login, logout, clearSession, fetchMe } = useAuth();
  const navigate = useNavigate();

  // Restore session from stored token on mount
  useEffect(() => {
    const stored = getStoredToken();
    if (stored && !user) {
      fetchMe(stored)
        .then((u) => {
          navigate(`/dashboard/${u.clinic_id}`, { replace: true });
        })
        .catch(() => {
          clearSession();
        });
    }
  }, [clearSession, fetchMe, navigate, user]);

  const handleLogin = async (email: string, password: string) => {
    const data = await login(email, password);
    navigate(`/dashboard/${data.user.clinic_id}`, { replace: true });
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={
          token ? (
            <Navigate to={user ? `/dashboard/${user.clinic_id}` : "/login"} replace />
          ) : (
            <LoginPage onLogin={handleLogin} loading={loading} error={error} />
          )
        }
      />
      <Route
        path="/dashboard/:clinic_id"
        element={<DashboardPage token={token} user={user} onLogout={handleLogout} />}
      />
      <Route
        path="/asr-intake/:clinic_id"
        element={<AsrIntakePage token={token} user={user} />}
      />
      <Route
        path="/asr-conversation/:clinic_id"
        element={<AsrConversationPage token={token} user={user} />}
      />
      <Route
        path="/triage/review/:clinic_id"
        element={<TriageReviewPage token={token} user={user} onLogout={handleLogout} />}
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
