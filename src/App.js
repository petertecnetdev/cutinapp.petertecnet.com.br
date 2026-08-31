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
const UserListPage = lazy(() => import("./pages/admin/user/UserListPage"));
const UserCreatePage = lazy(() => import("./pages/admin/user/UserCreatePage"));
const ProfileCreatePage = lazy(() => import("./pages/admin/profile/ProfileCreatePage"));
const ProfileListPage = lazy(() => import("./pages/admin/profile/ProfileListPage"));
const ProfileUpdatePage = lazy(() => import("./pages/admin/profile/ProfileUpdatePage"));
const ProductionListAdminPage = lazy(() => import("./pages/admin/production/ProductionListAdminPage"));
const ProductionUpdatePage = lazy(() => import("./pages/production/ProductionUpdatePage"));
const ProductionListCorpPage = lazy(() => import("./pages/corp/production/ProductionListCorpPage"));
const EventListCorpPage = lazy(() => import("./pages/corp/event/EventListCorpPage"));
const ProductionCreatePage = lazy(() => import("./pages/production/ProductionCreatePage"));
const ProductionPage = lazy(() => import("./pages/production/ProductionPage"));
const ProductionViewPage = lazy(() => import("./pages/production/ProductionViewPage"));
const EventUpdatePage = lazy(() => import("./pages/event/EventUpdatePage"));
const EventPage = lazy(() => import("./pages/event/EventPage"));
const EventCreatePage = lazy(() => import("./pages/event/EventCreatePage"));
const EventViewPage = lazy(() => import("./pages/event/EventViewPage"));
const ItemCreatePage = lazy(() => import("./pages/item/ItemCreatePage"));
const ItemUpdatePage = lazy(() => import("./pages/item/ItemUpdatePage"));
const ItemListPage = lazy(() => import("./pages/item/ItemListPage"));
const ItemViewPage = lazy(() => import("./pages/item/ItemViewPage"));
const UserViewPage = lazy(() => import("./pages/user/UserViewPage"));
const UserEditPage = lazy(() => import("./pages/user/UserEditPage"));

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
          <Route path="/user/list" element={protectedRoute(<UserListPage />)} />
          <Route path="/user/create" element={protectedRoute(<UserCreatePage />)} />
          <Route path="/user/:userName" element={protectedRoute(<UserViewPage />)} />
          <Route path="/profile/create" element={protectedRoute(<ProfileCreatePage />)} />
          <Route path="/profile/list" element={protectedRoute(<ProfileListPage />)} />
          <Route path="/profile/update/:id" element={protectedRoute(<ProfileUpdatePage />)} />
          <Route path="/production/admin/list" element={protectedRoute(<ProductionListAdminPage />)} />
          <Route path="/production/create" element={protectedRoute(<ProductionCreatePage />)} />
          <Route path="/productions" element={protectedRoute(<ProductionPage />)} />
          <Route path="/production/update/:id" element={protectedRoute(<ProductionUpdatePage />)} />
          <Route path="/production/:slug" element={protectedRoute(<ProductionViewPage />)} />
          <Route path="/production/corp/list" element={protectedRoute(<ProductionListCorpPage />)} />
          <Route path="/event" element={protectedRoute(<EventPage />)} />
          <Route path="/event/create" element={protectedRoute(<EventCreatePage />)} />
          <Route path="/event/update/:id" element={protectedRoute(<EventUpdatePage />)} />
          <Route path="/event/corp/list" element={protectedRoute(<EventListCorpPage />)} />
          <Route path="/event/:slug" element={protectedRoute(<EventViewPage />)} />
          <Route path="/event/:eventId/items" element={protectedRoute(<ItemListPage />)} />
          <Route path="/item" element={protectedRoute(<ItemListPage />)} />
          <Route path="/item/create" element={protectedRoute(<ItemCreatePage />)} />
          <Route path="/item/update/:id" element={protectedRoute(<ItemUpdatePage />)} />
          <Route path="/item/:id" element={protectedRoute(<ItemViewPage />)} />
          <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
        </Routes>
        <PeterTecnetSignature />
      </Suspense>
    </Router>
  );
}

export default App;
