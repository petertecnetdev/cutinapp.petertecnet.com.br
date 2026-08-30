import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FaBullhorn,
  FaCalendarDays,
  FaChartLine,
  FaChevronRight,
  FaClipboardCheck,
  FaPeopleGroup,
  FaStore,
  FaTicket,
  FaUser,
  FaUsersGear,
} from "react-icons/fa6";
import authService from "../services/AuthService";
import { storageUrl } from "../config";
import { getAccessProfile, getPrimaryRoleLabel } from "../utils/accessControl";
import "./CutinLayout.css";

const avatarUrl = (user) => {
  const raw = user?.images?.avatar || user?.images?.profile || user?.avatar || user?.photo || "";
  if (!raw) return "/images/logo.png";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${storageUrl}${String(raw).replace(/^\/+/, "")}`;
};

export default function CutinLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const authenticated = Boolean(authService.getToken());
  const [user, setUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(authenticated);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    if (!authenticated) {
      setUser(null);
      setLoadingUser(false);
      return undefined;
    }

    setLoadingUser(true);
    authService.me()
      .then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoadingUser(false); });

    return () => { active = false; };
  }, [authenticated]);

  useEffect(() => {
    const closeOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setUserMenuOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, []);

  useEffect(() => setUserMenuOpen(false), [location.pathname]);

  const access = useMemo(() => getAccessProfile(user), [user]);
  const fullName = useMemo(() => {
    if (!user) return "Minha conta";
    return `${user.first_name || ""} ${user.last_name || ""}`.trim()
      || user.name
      || user.user_name
      || user.username
      || user.email
      || "Minha conta";
  }, [user]);
  const primaryRole = useMemo(() => getPrimaryRoleLabel(access), [access]);

  const mainLinks = useMemo(() => {
    const links = [
      { to: "/eventos", label: "Eventos", icon: FaCalendarDays, show: true },
      { to: "/marketplace", label: "Produtos", icon: FaStore, show: true },
      { to: "/meus-ingressos", label: "Ingressos", icon: FaTicket, show: authenticated },
      { to: "/promoter", label: "Promoter", icon: FaBullhorn, show: authenticated && access.isPromoter },
      { to: "/produtor", label: "Produção", icon: FaChartLine, show: authenticated && access.isProducer },
      { to: "/checkin", label: "Check-in", icon: FaClipboardCheck, show: authenticated && access.canCheckin },
    ];
    return links.filter((link) => link.show);
  }, [authenticated, access]);

  const go = (path) => {
    setUserMenuOpen(false);
    navigate(path);
  };

  const renderMenuItem = (Icon, label, path) => (
    <button type="button" className="cutin-userMenu__item" onClick={() => go(path)}>
      <span className="cutin-userMenu__itemIcon"><Icon /></span>
      <span>{label}</span>
      <FaChevronRight className="cutin-userMenu__arrow" />
    </button>
  );

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authService.logout();
    } finally {
      setUserMenuOpen(false);
      setLoggingOut(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="cutin-shell">
      <header className="cutin-nav">
        <div className="cutin-nav__inner">
          <Link to="/" className="cutin-brand" aria-label="Cutinapp início">
            <span className="cutin-mark" aria-hidden="true">C</span>
            <span className="cutin-brand__copy">
              <strong>Cutinapp</strong>
              <small>by Peter Tecnet</small>
            </span>
          </Link>

          <nav className="cutin-nav__links" aria-label="Navegação principal">
            {mainLinks.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")} title={label}>
                <Icon /> <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {!authenticated ? (
            <Link className="cutin-login" to="/login">Entrar</Link>
          ) : (
            <div className="cutin-user" ref={menuRef}>
              <button
                type="button"
                className="cutin-user__button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                disabled={loadingUser}
              >
                <img src={avatarUrl(user)} alt="" className="cutin-user__avatar" onError={(event) => { event.currentTarget.src = "/images/logo.png"; }} />
                <span className="cutin-user__copy">
                  <strong>{loadingUser ? "Carregando..." : fullName}</strong>
                  <small>{loadingUser ? "Conta Cutinapp" : primaryRole}</small>
                </span>
              </button>

              {userMenuOpen && !loadingUser && (
                <div className="cutin-userMenu" role="menu">
                  <div className="cutin-userMenu__header">
                    <img src={avatarUrl(user)} alt="" onError={(event) => { event.currentTarget.src = "/images/logo.png"; }} />
                    <div>
                      <strong>{fullName}</strong>
                      <span>{user?.email || primaryRole}</span>
                      <small>{primaryRole}</small>
                    </div>
                  </div>

                  <div className="cutin-userMenu__group">
                    <span className="cutin-userMenu__title">Minha conta</span>
                    {renderMenuItem(FaTicket, "Meus ingressos", "/meus-ingressos")}
                    {renderMenuItem(FaUser, "Dados da conta", "/minha-conta")}
                  </div>

                  {access.isProducer && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Área do produtor</span>
                      {renderMenuItem(FaChartLine, "Painel do produtor", "/produtor")}
                      {access.canManageTeam && renderMenuItem(FaPeopleGroup, "Equipe", "/equipe")}
                      {access.canCheckin && renderMenuItem(FaClipboardCheck, "Operação e check-in", "/checkin")}
                    </div>
                  )}

                  {access.isPromoter && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Área do promoter</span>
                      {renderMenuItem(FaBullhorn, "Minhas campanhas", "/promoter")}
                    </div>
                  )}

                  {(access.isArtist || access.isSupplier) && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Minha atuação</span>
                      {renderMenuItem(FaCalendarDays, "Eventos", "/eventos")}
                      {renderMenuItem(FaStore, "Produtos e oportunidades", "/marketplace")}
                    </div>
                  )}

                  {access.isAdmin && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Administração</span>
                      {renderMenuItem(FaUsersGear, "Gestão administrativa", "/produtor")}
                    </div>
                  )}

                  <div className="cutin-userMenu__group cutin-userMenu__group--border">
                    <button type="button" className="cutin-userMenu__item cutin-userMenu__logout" onClick={logout} disabled={loggingOut}>
                      <span className="cutin-userMenu__itemIcon">↪</span>
                      <span>{loggingOut ? "Saindo..." : "Sair"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="cutin-main">{children}</main>

      <footer className="cutin-footer">
        <div className="cutin-footer__inner">
          <div className="cutin-footer__brand">
            <strong>Cutinapp</strong>
            <span>Eventos, experiências e negócios em um só lugar.</span>
          </div>
          <a className="peter-signature" href="https://petertecnet.com.br" target="_blank" rel="noreferrer" aria-label="Peter Tecnet — empresa desenvolvedora da Cutinapp">
            <img src="https://petertecnet.com.br/petertecnetlogo.png" alt="Peter Tecnet" loading="lazy" />
            <span><small>Desenvolvido por</small><strong>Peter Tecnet</strong></span>
          </a>
        </div>
      </footer>
    </div>
  );
}

CutinLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
