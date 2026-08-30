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
import "./CutinLayout.css";

const normalizeText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const collectNames = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectNames);
  if (typeof value === "string") return [normalizeText(value)];
  if (typeof value === "object") {
    return [value.name, value.slug, value.role, value.profile, value.permission, value.code]
      .filter(Boolean)
      .map(normalizeText);
  }
  return [];
};

const getRoleNames = (user) => {
  const raw = [
    user?.profile,
    user?.profiles,
    user?.role,
    user?.roles,
    user?.type,
    user?.user_type,
    user?._auth?.role,
    user?._auth?.roles,
  ];
  return [...new Set(raw.flatMap(collectNames))];
};

const getPermissions = (user) => {
  const raw = [
    user?.permissions,
    user?.profile?.permissions,
    user?.profiles?.flatMap?.((profile) => profile?.permissions || []) || [],
    user?.role?.permissions,
    user?.roles?.flatMap?.((role) => role?.permissions || []) || [],
  ];
  return new Set(raw.flatMap(collectNames));
};

const includesAny = (values, candidates) => candidates.some((candidate) => values.some((value) => value.includes(candidate)));

const buildAccess = (user) => {
  const roles = getRoleNames(user);
  const permissions = getPermissions(user);
  const hasPermission = (...names) => names.some((name) => permissions.has(normalizeText(name)));

  const isAdmin = includesAny(roles, ["administrador", "admin", "superadmin"])
    || hasPermission("user_management", "role_management", "permission_management");
  const isProducer = isAdmin || includesAny(roles, ["produtor", "producer", "organizador", "organizer"])
    || hasPermission("production_create", "production_configure", "production_update", "event_create", "event_config", "event_edit");
  const isPromoter = isAdmin || includesAny(roles, ["promoter", "divulgador", "afiliado"])
    || hasPermission("ticket_sale_manage_own");
  const isArtist = isAdmin || includesAny(roles, ["artista", "artist", "banda", "dj", "musico"]);
  const isSupplier = isAdmin || includesAny(roles, ["fornecedor", "supplier", "prestador"]);
  const isParticipant = includesAny(roles, ["participante", "participant", "cliente", "customer", "usuario", "user"])
    || (!isProducer && !isPromoter && !isArtist && !isSupplier && !isAdmin);
  const canCheckin = isAdmin || hasPermission("item_scan", "item_check", "ticket_view", "production_scan", "production_validate");
  const canManageTeam = isAdmin || isProducer || hasPermission("user_list", "user_create", "user_management");
  const canManageSales = isAdmin || isProducer || hasPermission("ticket_sale_view", "ticket_sale_report", "ticket_sale_export");

  return {
    roles,
    isAdmin,
    isProducer,
    isPromoter,
    isArtist,
    isSupplier,
    isParticipant,
    canCheckin,
    canManageTeam,
    canManageSales,
  };
};

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

  const access = useMemo(() => buildAccess(user), [user]);
  const fullName = useMemo(() => {
    if (!user) return "Minha conta";
    return `${user.first_name || ""} ${user.last_name || ""}`.trim()
      || user.name
      || user.user_name
      || user.username
      || user.email
      || "Minha conta";
  }, [user]);

  const primaryRole = useMemo(() => {
    if (access.isAdmin) return "Administrador";
    if (access.isProducer) return "Produtor";
    if (access.isPromoter) return "Promoter";
    if (access.isArtist) return "Artista";
    if (access.isSupplier) return "Fornecedor";
    return "Participante";
  }, [access]);

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

  const MenuItem = ({ icon: Icon, label, path }) => (
    <button type="button" className="cutin-userMenu__item" onClick={() => go(path)}>
      <span className="cutin-userMenu__itemIcon"><Icon /></span>
      <span>{label}</span>
      <FaChevronRight className="cutin-userMenu__arrow" />
    </button>
  );

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
                    <MenuItem icon={FaTicket} label="Meus ingressos" path="/meus-ingressos" />
                    <MenuItem icon={FaUser} label="Dados da conta" path="/minha-conta" />
                  </div>

                  {access.isProducer && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Área do produtor</span>
                      <MenuItem icon={FaChartLine} label="Painel do produtor" path="/produtor" />
                      {access.canManageTeam && <MenuItem icon={FaPeopleGroup} label="Equipe" path="/equipe" />}
                      {access.canCheckin && <MenuItem icon={FaClipboardCheck} label="Operação e check-in" path="/checkin" />}
                    </div>
                  )}

                  {access.isPromoter && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Área do promoter</span>
                      <MenuItem icon={FaBullhorn} label="Minhas campanhas" path="/promoter" />
                    </div>
                  )}

                  {(access.isArtist || access.isSupplier) && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Minha atuação</span>
                      <MenuItem icon={FaCalendarDays} label="Eventos" path="/eventos" />
                      <MenuItem icon={FaStore} label="Produtos e oportunidades" path="/marketplace" />
                    </div>
                  )}

                  {access.isAdmin && (
                    <div className="cutin-userMenu__group cutin-userMenu__group--border">
                      <span className="cutin-userMenu__title">Administração</span>
                      <MenuItem icon={FaUsersGear} label="Gestão administrativa" path="/produtor" />
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
