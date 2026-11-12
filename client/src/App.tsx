import { lazy, Suspense, useEffect } from "react";
import { Box, Spinner, Text, VStack } from "@chakra-ui/react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth, getStoredToken } from "./hooks/useAuth";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const AsrIntakePage = lazy(() => import("./pages/AsrIntakePage").then((module) => ({ default: module.AsrIntakePage })));
const AsrConversationPage = lazy(() => import("./pages/AsrConversationPage").then((module) => ({ default: module.AsrConversationPage })));
const TriageReviewPage = lazy(() => import("./pages/TriageReviewPage").then((module) => ({ default: module.TriageReviewPage })));
const ActivityPage = lazy(() => import("./pages/ActivityPage").then((module) => ({ default: module.ActivityPage })));

function RouteFallback() {
  return <Box minH="100vh" bg="neo.bg" display="grid" placeItems="center"><VStack spacing={3}><Spinner color="blue.600" thickness="3px" /><Text fontSize="sm" fontWeight="700" color="gray.600">Opening clinical workspace…</Text></VStack></Box>;
}

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
    <Suspense fallback={<RouteFallback />}>
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
      <Route path="/activity/:clinic_id" element={<ActivityPage token={token} user={user} onLogout={handleLogout} />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
