import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import EmailVerifyPage from "./pages/auth/EmailVerifyPage";
import LogoutPage from "./pages/auth/LogoutPage";
import PasswordEmailPage from "./pages/auth/PasswordEmailPage";
import PasswordPage from "./pages/auth/PasswordPage";
import LoadingComponent from "./components/LoadingComponent";
import authService from "./services/AuthService";

import CutinHomePage from "./pages/CutinHomePage";
import { EventsHubPage, ProducerDashboardPage, TicketsPage, MarketplacePage, TeamPage } from "./pages/CutinWorkspacePages";
import { PublicEventPage, EventManagePage, CheckinPage } from "./pages/CutinOperationsPages";
import CutinTicketLotsPage from "./pages/CutinTicketLotsPage";
import CutinProductsPage from "./pages/CutinProductsPage";
import CutinPromoterPage from "./pages/CutinPromoterPage";

import ProductionCreatePage from "./pages/production/ProductionCreatePage";
import ProductionUpdatePage from "./pages/production/ProductionUpdatePage";
import ProductionPage from "./pages/production/ProductionPage";
import ProductionViewPage from "./pages/production/ProductionViewPage";
import EventUpdatePage from "./pages/event/EventUpdatePage";
import EventPage from "./pages/event/EventPage";
import EventCreatePage from "./pages/event/EventCreatePage";
import ItemCreatePage from "./pages/item/ItemCreatePage";
import ItemUpdatePage from "./pages/item/ItemUpdatePage";
import ItemListPage from "./pages/item/ItemListPage";
import ItemViewPage from "./pages/item/ItemViewPage";
import UserEditPage from "./pages/user/UserEditPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingComponent />;

  const protectedRoute = (element) => {
    if (!user) return <Navigate to="/login" replace />;
    if (!user.email_verified_at) return <Navigate to="/email-verify" replace />;
    return element;
  };
  const guestRoute = (element) => user ? <Navigate to="/produtor" replace /> : element;
  const verifyRoute = (element) => !user ? <Navigate to="/login" replace /> : user.email_verified_at ? <Navigate to="/produtor" replace /> : element;

  return <Router><Routes>
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
  </Routes></Router>;
}
