import React, { lazy, Suspense, useContext } from "react";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import PeterTecnetSignature from "./components/PeterTecnetSignature";
import ProcessingIndicatorComponent from "./components/ProcessingIndicatorComponent";

const HomePage = lazy(() => import("./pages/HomePage"));
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
const ProductionViewPage = lazy(() => import("./pages/production/ProductionViewPage"));
const ProductionUpdatePage = lazy(() => import("./pages/production/ProductionUpdatePage"));
const EventPage = lazy(() => import("./pages/event/EventPage"));
const EventCreatePage = lazy(() => import("./pages/event/EventCreatePage"));
const EventManagePage = lazy(() => import("./pages/event/EventManagePage"));
const EventUpdatePage = lazy(() => import("./pages/event/EventUpdatePage"));
const EventViewPage = lazy(() => import("./pages/event/EventViewPage"));
const TicketCreatePage = lazy(() => import("./pages/ticket/TicketCreatePage"));
const CourtesyManagePage = lazy(() => import("./pages/ticket/CourtesyManagePage"));
const MyPassesPage = lazy(() => import("./pages/ticket/MyPassesPage"));
const PassDetailPage = lazy(() => import("./pages/ticket/PassDetailPage"));
const ParticipantsPage = lazy(() => import("./pages/ticket/ParticipantsPage"));
const CheckinPage = lazy(() => import("./pages/ticket/CheckinPage"));

function AppRoutes() {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) return <ProcessingIndicatorComponent label="Preparando Cutinapp" />;

  const protectedRoute = (element) => {
    if (!user) {
      const from = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to="/login" state={{ from }} replace />;
    }
    if (!user.email_verified_at) return <Navigate to="/email-verify" replace />;
    return element;
  };

  const verifyRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    return !user.email_verified_at ? element : <Navigate to="/dashboard" replace />;
  };

  const guestRoute = (element) => user ? <Navigate to="/dashboard" replace /> : element;

  const shellOwnsSignature =
    location.pathname === "/" ||
    ["/login", "/register", "/password-email", "/email-verify"].includes(location.pathname);

  return (
    <Suspense fallback={<ProcessingIndicatorComponent label="Carregando página" />}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <HomePage />} />
        <Route path="/login" element={guestRoute(<LoginPage />)} />
        <Route path="/register" element={guestRoute(<RegisterPage />)} />
        <Route path="/password-email" element={guestRoute(<PasswordEmailPage />)} />
        <Route path="/email-verify" element={verifyRoute(<EmailVerifyPage />)} />
        <Route path="/password" element={protectedRoute(<PasswordPage />)} />
        <Route path="/logout" element={<LogoutPage />} />

        <Route path="/dashboard" element={protectedRoute(<DashboardPage />)} />
        <Route path="/user/edit" element={protectedRoute(<UserEditPage />)} />

        <Route path="/production/create" element={protectedRoute(<ProductionCreatePage />)} />
        <Route path="/production/mine" element={protectedRoute(<ProductionMinePage />)} />
        <Route path="/production/:id" element={protectedRoute(<ProductionViewPage />)} />
        <Route path="/production/edit/:id" element={protectedRoute(<ProductionUpdatePage />)} />

        <Route path="/event" element={<EventPage />} />
        <Route path="/event/create" element={protectedRoute(<EventCreatePage />)} />
        <Route path="/event/manage" element={protectedRoute(<EventManagePage />)} />
        <Route path="/event/edit/:id" element={protectedRoute(<EventUpdatePage />)} />
        <Route path="/event/:eventId/courtesies" element={protectedRoute(<CourtesyManagePage />)} />
        <Route path="/event/:eventId/participants" element={protectedRoute(<ParticipantsPage />)} />
        <Route path="/event/:slug" element={<EventViewPage />} />

        <Route path="/ticket/create" element={protectedRoute(<TicketCreatePage />)} />
        <Route path="/passes" element={protectedRoute(<MyPassesPage />)} />
        <Route path="/passes/:id" element={protectedRoute(<PassDetailPage />)} />
        <Route path="/checkin" element={protectedRoute(<CheckinPage />)} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/"} replace />} />
      </Routes>
      {!shellOwnsSignature && <PeterTecnetSignature />}
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
