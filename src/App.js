import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProcessingIndicatorComponent from "./components/ProcessingIndicatorComponent";
import authService from "./services/AuthService";

const loadNamed = (factory, name) => lazy(() => factory().then((module) => ({ default: module[name] })));

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const EmailVerifyPage = lazy(() => import("./pages/auth/EmailVerifyPage"));
const LogoutPage = lazy(() => import("./pages/auth/LogoutPage"));
const PasswordEmailPage = lazy(() => import("./pages/auth/PasswordEmailPage"));
const PasswordPage = lazy(() => import("./pages/auth/PasswordPage"));

const CutinHomePage = lazy(() => import("./pages/CutinHomePage"));
const EventsHubPage = loadNamed(() => import("./pages/CutinWorkspacePages"), "EventsHubPage");
const ProducerDashboardPage = loadNamed(() => import("./pages/CutinWorkspacePages"), "ProducerDashboardPage");
const TicketsPage = loadNamed(() => import("./pages/CutinWorkspacePages"), "TicketsPage");
const MarketplacePage = loadNamed(() => import("./pages/CutinWorkspacePages"), "MarketplacePage");
const TeamPage = loadNamed(() => import("./pages/CutinWorkspacePages"), "TeamPage");
const PublicEventPage = loadNamed(() => import("./pages/CutinOperationsPages"), "PublicEventPage");
const EventManagePage = loadNamed(() => import("./pages/CutinOperationsPages"), "EventManagePage");
const CheckinPage = loadNamed(() => import("./pages/CutinOperationsPages"), "CheckinPage");
const CutinTicketLotsPage = lazy(() => import("./pages/CutinTicketLotsPage"));
const CutinProductsPage = lazy(() => import("./pages/CutinProductsPage"));
const CutinPromoterPage = lazy(() => import("./pages/CutinPromoterPage"));
const CutinCommissionsPage = lazy(() => import("./pages/CutinCommissionsPage"));

const ProductionCreatePage = lazy(() => import("./pages/production/ProductionCreatePage"));
const ProductionUpdatePage = lazy(() => import("./pages/production/ProductionUpdatePage"));
const ProductionPage = lazy(() => import("./pages/production/ProductionPage"));
const ProductionViewPage = lazy(() => import("./pages/production/ProductionViewPage"));
const EventUpdatePage = lazy(() => import("./pages/event/EventUpdatePage"));
const EventPage = lazy(() => import("./pages/event/EventPage"));
const EventCreatePage = lazy(() => import("./pages/event/EventCreatePage"));
const ItemCreatePage = lazy(() => import("./pages/item/ItemCreatePage"));
const ItemUpdatePage = lazy(() => import("./pages/item/ItemUpdatePage"));
const ItemListPage = lazy(() => import("./pages/item/ItemListPage"));
const ItemViewPage = lazy(() => import("./pages/item/ItemViewPage"));
const UserEditPage = lazy(() => import("./pages/user/UserEditPage"));

const RouteFallback = () => (
  <ProcessingIndicatorComponent
    messages={["Carregando página...", "Preparando sua experiência..."]}
    blocking={false}
  />
);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authService.getToken()) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    authService.me()
      .then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  if (loading) {
    return <ProcessingIndicatorComponent messages={["Carregando sua experiência...", "Conectando à Cutinapp..."]} />;
  }

  const protectedRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    if (!user.email_verified_at) return <Navigate to="/email-verify" replace />;
    return element;
  };

  const guestRoute = (element) => user ? <Navigate to="/produtor" replace /> : element;
  const verifyRoute = (element) => !user ? <Navigate to="/login" replace /> : user.email_verified_at ? <Navigate to="/produtor" replace /> : element;

  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<CutinHomePage />} />
          <Route path="/eventos" element={<EventsHubPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/evento/:id" element={<PublicEventPage />} />

          <Route path="/login" element={guestRoute(<LoginPage />)} />
          <Route path="/register" element={guestRoute(<RegisterPage />)} />
          <Route path="/password-email" element={guestRoute(<PasswordEmailPage />)} />
          <Route path="/email-verify" element={verifyRoute(<EmailVerifyPage />)} />
          <Route path="/password" element={protectedRoute(<PasswordPage />)} />
          <Route path="/logout" element={<LogoutPage />} />

          <Route path="/produtor" element={protectedRoute(<ProducerDashboardPage />)} />
          <Route path="/promoter" element={protectedRoute(<CutinPromoterPage />)} />
          <Route path="/meus-ingressos" element={protectedRoute(<TicketsPage />)} />
          <Route path="/equipe" element={protectedRoute(<TeamPage />)} />
          <Route path="/checkin" element={protectedRoute(<CheckinPage />)} />
          <Route path="/gerenciar/evento/:id" element={protectedRoute(<EventManagePage />)} />
          <Route path="/gerenciar/evento/:id/ingressos" element={protectedRoute(<CutinTicketLotsPage />)} />
          <Route path="/gerenciar/evento/:eventId/comissoes" element={protectedRoute(<CutinCommissionsPage />)} />
          <Route path="/minha-conta" element={protectedRoute(<UserEditPage />)} />

          <Route path="/production/create" element={protectedRoute(<ProductionCreatePage />)} />
          <Route path="/productions" element={protectedRoute(<ProductionPage />)} />
          <Route path="/production/update/:id" element={protectedRoute(<ProductionUpdatePage />)} />
          <Route path="/production/:slug" element={protectedRoute(<ProductionViewPage />)} />

          <Route path="/event" element={protectedRoute(<EventPage />)} />
          <Route path="/event/create" element={protectedRoute(<EventCreatePage />)} />
          <Route path="/event/update/:id" element={protectedRoute(<EventUpdatePage />)} />
          <Route path="/event/:eventId/items" element={protectedRoute(<CutinProductsPage />)} />

          <Route path="/item" element={protectedRoute(<ItemListPage />)} />
          <Route path="/item/create" element={protectedRoute(<ItemCreatePage />)} />
          <Route path="/item/update/:id" element={protectedRoute(<ItemUpdatePage />)} />
          <Route path="/item/:id" element={protectedRoute(<ItemViewPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
