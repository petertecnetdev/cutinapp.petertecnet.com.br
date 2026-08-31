import React, { lazy, Suspense, useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import ProcessingIndicatorComponent from "./components/ProcessingIndicatorComponent";
import PeterTecnetSignature from "./components/PeterTecnetSignature";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const EmailVerifyPage = lazy(() => import("./pages/auth/EmailVerifyPage"));
const LogoutPage = lazy(() => import("./pages/auth/LogoutPage"));
const PasswordEmailPage = lazy(() => import("./pages/auth/PasswordEmailPage"));
const PasswordPage = lazy(() => import("./pages/auth/PasswordPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const UserEditPage = lazy(() => import("./pages/user/UserEditPage"));
const ProductionCreatePage = lazy(() => import("./pages/production/ProductionCreatePage"));
const ProductionMinePage = lazy(() => import("./pages/production/ProductionMinePage"));
const EventPage = lazy(() => import("./pages/event/EventPage"));
const EventCreatePage = lazy(() => import("./pages/event/EventCreatePage"));
const EventManagePage = lazy(() => import("./pages/event/EventManagePage"));
const EventViewPage = lazy(() => import("./pages/event/EventViewPage"));
const TicketCreatePage = lazy(() => import("./pages/ticket/TicketCreatePage"));
const MyPassesPage = lazy(() => import("./pages/ticket/MyPassesPage"));
const CheckinPage = lazy(() => import("./pages/ticket/CheckinPage"));

function App() {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <ProcessingIndicatorComponent label="Preparando Cutinapp" />;

  const protectedRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    if (!user.email_verified_at) return <Navigate to="/email-verify" replace />;
    return element;
  };

  const emailVerifiedRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    return !user.email_verified_at ? element : <Navigate to="/dashboard" replace />;
  };

  const restrictedRoute = (element) =>
    user ? <Navigate to="/dashboard" replace /> : element;

  return (
    <Router>
      <Suspense fallback={<ProcessingIndicatorComponent label="Carregando página" />}>
        <Routes>
          <Route path="/register" element={restrictedRoute(<RegisterPage />)} />
          <Route path="/login" element={restrictedRoute(<LoginPage />)} />
          <Route path="/password-email" element={restrictedRoute(<PasswordEmailPage />)} />
          <Route path="/email-verify" element={emailVerifiedRoute(<EmailVerifyPage />)} />
          <Route path="/password" element={protectedRoute(<PasswordPage />)} />
          <Route path="/logout" element={<LogoutPage />} />

          <Route path="/dashboard" element={protectedRoute(<DashboardPage />)} />
          <Route path="/user/edit" element={protectedRoute(<UserEditPage />)} />

          <Route path="/production/create" element={protectedRoute(<ProductionCreatePage />)} />
          <Route path="/production/mine" element={protectedRoute(<ProductionMinePage />)} />

          <Route path="/event" element={protectedRoute(<EventPage />)} />
          <Route path="/event/create" element={protectedRoute(<EventCreatePage />)} />
          <Route path="/event/manage" element={protectedRoute(<EventManagePage />)} />
          <Route path="/event/:slug" element={protectedRoute(<EventViewPage />)} />

          <Route path="/ticket/create" element={protectedRoute(<TicketCreatePage />)} />
          <Route path="/passes" element={protectedRoute(<MyPassesPage />)} />
          <Route path="/checkin" element={protectedRoute(<CheckinPage />)} />

          <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
        </Routes>
        <PeterTecnetSignature />
      </Suspense>
    </Router>
  );
}

export default App;
