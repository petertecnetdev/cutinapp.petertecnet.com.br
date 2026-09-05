import React, { lazy, Suspense, useContext } from "react";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ConnectionStatus from "./components/ConnectionStatus";
import CutinappVisualEffects from "./components/CutinappVisualEffects";
import PeterTecnetSignature from "./components/PeterTecnetSignature";
import ProcessingIndicatorComponent from "./components/ProcessingIndicatorComponent";
import SeoManager from "./components/SeoManager";
import authService from "./services/AuthService";
import { hasContextRole } from "./utils/applicationRoles";

const HomePage = lazy(() => import("./pages/HomePage"));
const FeedPage = lazy(() => import("./pages/FeedPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ReportModerationPage = lazy(() => import("./pages/moderation/ReportModerationPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const EmailVerifyPage = lazy(() => import("./pages/auth/EmailVerifyPage"));
const LogoutPage = lazy(() => import("./pages/auth/LogoutPage"));
const PasswordEmailPage = lazy(() => import("./pages/auth/PasswordEmailPage"));
const PasswordPage = lazy(() => import("./pages/auth/PasswordPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AcquisitionDashboardPage = lazy(() => import("./pages/acquisition/AcquisitionDashboardPage"));
const AcquisitionActivationPage = lazy(() => import("./pages/acquisition/AcquisitionActivationPage"));
const UserEditPage = lazy(() => import("./pages/user/UserEditPage"));
const UserProfilePage = lazy(() => import("./pages/user/UserProfilePage"));
const ProductionCreatePage = lazy(() => import("./pages/production/ProductionCreatePage"));
const ProductionMinePage = lazy(() => import("./pages/production/ProductionMinePage"));
const ProductionViewPage = lazy(() => import("./pages/production/ProductionViewPage"));
const ProductionPublicPage = lazy(() => import("./pages/production/ProductionPublicPage"));
const ProductionUpdatePage = lazy(() => import("./pages/production/ProductionUpdatePage"));
const ProductionFinancePage = lazy(() => import("./pages/production/ProductionFinancePage"));
const ProducerContractsPage = lazy(() => import("./pages/production/ProducerContractsPage"));
const ArtistListPage = lazy(() => import("./pages/artist/ArtistListPage"));
const ArtistViewPage = lazy(() => import("./pages/artist/ArtistViewPage"));
const ArtistManagePage = lazy(() => import("./pages/artist/ArtistManagePage"));
const EventPage = lazy(() => import("./pages/event/EventPage"));
const EventCreatePage = lazy(() => import("./pages/event/EventCreatePage"));
const EventManagePage = lazy(() => import("./pages/event/EventManagePage"));
const EventUpdatePage = lazy(() => import("./pages/event/EventUpdatePage"));
const EventLineupPage = lazy(() => import("./pages/event/EventLineupPage"));
const EventArtistClaimsPage = lazy(() => import("./pages/event/EventArtistClaimsPage"));
const EventAnnouncementsManagePage = lazy(() => import("./pages/event/EventAnnouncementsManagePage"));
const EventViewPage = lazy(() => import("./pages/event/EventViewPage"));
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const PurchasesPage = lazy(() => import("./pages/commerce/PurchasesPage"));
const PurchaseDetailPage = lazy(() => import("./pages/commerce/PurchaseDetailPage"));
const ProducerSalesPage = lazy(() => import("./pages/commerce/ProducerSalesPage"));
const ProducerSaleDetailPage = lazy(() => import("./pages/commerce/ProducerSaleDetailPage"));
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

  const currentRoute = () => `${location.pathname}${location.search}${location.hash}`;
  const canUseDeferredVerificationSession = () =>
    authService.isEmailVerificationDeferredForCurrentSession();

  const protectedRoute = (element) => {
    if (!user) {
      const from = currentRoute();
      return <Navigate to="/login" state={{ from }} replace />;
    }
    if (!user.email_verified_at && !canUseDeferredVerificationSession()) {
      return <Navigate to="/email-verify" state={{ from: currentRoute() }} replace />;
    }
    return element;
  };

  const acquisitionRoute = (element) => {
    if (!user) {
      const from = currentRoute();
      return <Navigate to="/login" state={{ from }} replace />;
    }
    if (!user.email_verified_at && !canUseDeferredVerificationSession()) {
      return <Navigate to="/email-verify" state={{ from: currentRoute() }} replace />;
    }
    return hasContextRole(user, "acquisition_agent")
      ? element
      : <Navigate to="/dashboard" replace />;
  };

  const verifyRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    return !user.email_verified_at ? element : <Navigate to="/dashboard" replace />;
  };

  const guestRoute = (element) => user ? <Navigate to="/dashboard" replace /> : element;
  const shellOwnsSignature = location.pathname === "/" || ["/login", "/register", "/password-email", "/email-verify", "/agent/activate"].includes(location.pathname);
  const routeKey = `${location.pathname}${location.search}`;

  return (
    <>
      <ConnectionStatus />
      <CutinappVisualEffects />
      <AppErrorBoundary resetKey={routeKey}>
        <Suspense fallback={<ProcessingIndicatorComponent label="Carregando página" />}>
          <SeoManager />
          <Routes>
            <Route path="/" element={user ? <Navigate to="/feed" replace /> : <HomePage />} />
            <Route path="/login" element={guestRoute(<LoginPage />)} />
            <Route path="/register" element={guestRoute(<RegisterPage />)} />
            <Route path="/password-email" element={guestRoute(<PasswordEmailPage />)} />
            <Route path="/email-verify" element={verifyRoute(<EmailVerifyPage />)} />
            <Route path="/password" element={protectedRoute(<PasswordPage />)} />
            <Route path="/logout" element={<LogoutPage />} />
            <Route path="/agent/activate" element={<AcquisitionActivationPage />} />

            <Route path="/dashboard" element={protectedRoute(<DashboardPage />)} />
            <Route path="/agent" element={acquisitionRoute(<AcquisitionDashboardPage />)} />
            <Route path="/feed" element={protectedRoute(<FeedPage />)} />
            <Route path="/notifications" element={protectedRoute(<NotificationsPage />)} />
            <Route path="/moderation/reports" element={protectedRoute(<ReportModerationPage />)} />
            <Route path="/profile" element={protectedRoute(<UserProfilePage />)} />
            <Route path="/user/edit" element={protectedRoute(<UserEditPage />)} />
            <Route path="/purchases" element={protectedRoute(<PurchasesPage />)} />
            <Route path="/purchases/:publicId" element={protectedRoute(<PurchaseDetailPage />)} />

            <Route path="/artists" element={<ArtistListPage />} />
            <Route path="/artist/:slug" element={<ArtistViewPage />} />
            <Route path="/artist/manage" element={protectedRoute(<ArtistManagePage />)} />

            <Route path="/production/create" element={protectedRoute(<ProductionCreatePage />)} />
            <Route path="/production/mine" element={protectedRoute(<ProductionMinePage />)} />
            <Route path="/producer/contracts" element={protectedRoute(<ProducerContractsPage />)} />
            <Route path="/producer/finance" element={protectedRoute(<ProductionFinancePage />)} />
            <Route path="/producer/sales" element={protectedRoute(<ProducerSalesPage />)} />
            <Route path="/producer/sales/:productionId/:publicId" element={protectedRoute(<ProducerSaleDetailPage />)} />
            <Route path="/production/:slug/public" element={<ProductionPublicPage />} />
            <Route path="/production/:id" element={protectedRoute(<ProductionViewPage />)} />
            <Route path="/production/edit/:id" element={protectedRoute(<ProductionUpdatePage />)} />

            <Route path="/event" element={<EventPage />} />
            <Route path="/event/create" element={protectedRoute(<EventCreatePage />)} />
            <Route path="/event/manage" element={protectedRoute(<EventManagePage />)} />
            <Route path="/event/edit/:id" element={protectedRoute(<EventUpdatePage />)} />
            <Route path="/event/:eventId/lineup" element={protectedRoute(<EventLineupPage />)} />
            <Route path="/event/:eventId/artist-claims" element={protectedRoute(<EventArtistClaimsPage />)} />
            <Route path="/event/:eventId/announcements" element={protectedRoute(<EventAnnouncementsManagePage />)} />
            <Route path="/event/:eventId/courtesies" element={protectedRoute(<CourtesyManagePage />)} />
            <Route path="/event/:eventId/participants" element={protectedRoute(<ParticipantsPage />)} />
            <Route path="/event/:slug" element={<EventViewPage />} />
            <Route path="/checkout/:slug" element={protectedRoute(<CheckoutPage />)} />

            <Route path="/ticket/create" element={protectedRoute(<TicketCreatePage />)} />
            <Route path="/passes" element={protectedRoute(<MyPassesPage />)} />
            <Route path="/passes/:id" element={protectedRoute(<PassDetailPage />)} />
            <Route path="/checkin" element={protectedRoute(<CheckinPage />)} />
            <Route path="*" element={<Navigate to={user ? "/feed" : "/"} replace />} />
          </Routes>
          {!shellOwnsSignature && <PeterTecnetSignature />}
        </Suspense>
      </AppErrorBoundary>
    </>
  );
}

export default function App() {
  return <Router><AppRoutes /></Router>;
}
