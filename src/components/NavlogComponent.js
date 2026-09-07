import React, { useContext, useEffect, useMemo, useState } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";
import { isPeterTecnetRoot } from "../utils/applicationRoles";
import { safeNavigationTarget } from "../utils/safeUrl";
import { notificationTelemetryAttrs } from "../utils/notificationTelemetry";
import { trackTelemetry } from "../utils/telemetry";
import {
  NAV_MODE_STORAGE_KEY,
  PRODUCTION_STORAGE_KEY,
  contextualNavigation,
  navigationForMode,
  navigationModesFor,
} from "../navigation/navigationRegistry";
import NotificationPermissionControl from "./NotificationPermissionControl";

const notificationIcon = (type = "") => {
  if (type === "artist_lineup") return "fa-solid fa-music";
  if (type.includes("ticket")) return "fa-solid fa-ticket";
  if (type === "comment_like") return "fa-solid fa-heart";
  if (type === "event_comment" || type === "event_reply") return "fa-solid fa-comments";
  return "fa-regular fa-bell";
};

const notificationTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
  } catch (_) { return ""; }
};

const readStored = (key) => {
  try { return window.localStorage.getItem(key); } catch (_) { return null; }
};

const store = (key, value) => {
  try { window.localStorage.setItem(key, value); } catch (_) { /* storage is optional */ }
};

export default function NavlogComponent() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(() => (typeof window === "undefined" ? "participant" : readStored(NAV_MODE_STORAGE_KEY) || "participant"));
  const [productions, setProductions] = useState([]);
  const [selectedProduction, setSelectedProduction] = useState(() => (typeof window === "undefined" ? "" : readStored(PRODUCTION_STORAGE_KEY) || ""));
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationPreview, setNotificationPreview] = useState([]);
  const userId = user?.id;

  const modes = useMemo(() => navigationModesFor(user), [user]);
  const currentMode = modes.find((entry) => entry.id === mode) || modes[0];
  const nav = navigationForMode(currentMode?.id || "participant");
  const contextual = contextualNavigation(location.pathname, currentMode?.id);
  const peterAdmin = isPeterTecnetRoot(user);
  const isAdmin = user?.profile?.name === "Administrador" || user?.profile_name === "Administrador";
  const active = (to) => to === "/" ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(`${to}/`);
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!modes.some((entry) => entry.id === mode)) setMode(modes[0]?.id || "participant");
  }, [modes, mode]);

  useEffect(() => {
    store(NAV_MODE_STORAGE_KEY, currentMode?.id || "participant");
  }, [currentMode?.id]);

  useEffect(() => { setOpen(false); }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("cut-has-mobile-bottom-nav", Boolean(user));
    return () => document.body.classList.remove("cut-has-mobile-bottom-nav");
  }, [user]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    const onKeyDown = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !user || !["manager", "admin"].includes(currentMode?.id) || productions.length) return;
    let mounted = true;
    cutinappService.myProductions()
      .then((data) => mounted && setProductions(Array.isArray(data) ? data : []))
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [open, user, currentMode?.id, productions.length]);

  useEffect(() => {
    if (!userId) { setUnreadNotifications(0); setNotificationPreview([]); return undefined; }
    let mounted = true;
    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const response = await cutinappService.notifications({ per_page: 6 });
        if (!mounted) return;
        setUnreadNotifications(Number(response?.unread_count || 0));
        setNotificationPreview(response?.notifications?.data || []);
      } catch (_) { /* navigation remains usable */ }
    };
    const onVisible = () => document.visibilityState === "visible" && refresh();
    refresh();
    const disconnect = subscribeToUserNotifications(userId, (notification) => {
      if (!mounted) return;
      if (!notification?.read_at) setUnreadNotifications((current) => current + 1);
      setNotificationPreview((current) => [notification, ...current.filter((entry) => entry?.id !== notification?.id)].slice(0, 6));
      window.dispatchEvent(new CustomEvent("cutinapp:notification-received", { detail: notification }));
    });
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("cutinapp:notifications-updated", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      if (typeof disconnect === "function") disconnect();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cutinapp:notifications-updated", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const selectMode = (nextMode) => {
    setMode(nextMode);
    trackTelemetry("navigation_mode_changed", { from: currentMode?.id, to: nextMode, route: location.pathname });
  };

  const go = (target, source = "navbar") => {
    closeMenu();
    trackTelemetry("navigation_item_selected", { id: target.id, mode: currentMode?.id, route: target.to, source });
    navigate(target.to);
  };

  if (!user) {
    return (
      <Navbar expand="lg" sticky="top" className="cut-navbar cut-advanced-nav" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
        <Container className="cut-navbar__inner">
          <Navbar.Brand as={Link} to="/" className="cut-navbar__brand" onClick={closeMenu}><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>Rede social de eventos</small></div></Navbar.Brand>
          <Navbar.Toggle aria-controls="cut-navbar-public" aria-label={open ? "Fechar menu" : "Abrir menu"} />
          <Navbar.Collapse id="cut-navbar-public"><Nav className="ms-auto cut-navbar__links"><Nav.Link as={Link} to="/event">Eventos</Nav.Link><Nav.Link as={Link} to="/productions">Produções</Nav.Link><Nav.Link as={Link} to="/artists">Artistas</Nav.Link><Nav.Link as={Link} to="/login">Entrar</Nav.Link></Nav><span data-peter-ecosystem-slot className="cut-navbar__ecosystem-slot" aria-label="Navegação do ecossistema Peter Tecnet" /></Navbar.Collapse>
        </Container>
      </Navbar>
    );
  }

  const signOut = async () => {
    closeMenu();
    try { await logout(); } finally { navigate("/", { replace: true }); }
  };

  const openNotification = async (entry) => {
    if (!entry) return;
    if (!entry.read_at) {
      try {
        await cutinappService.markNotificationRead(entry.id);
        setUnreadNotifications((current) => Math.max(0, current - 1));
        setNotificationPreview((current) => current.map((item) => item.id === entry.id ? { ...item, read_at: new Date().toISOString() } : item));
        window.dispatchEvent(new CustomEvent("cutinapp:notifications-updated"));
      } catch (_) { /* continue */ }
    }
    const target = safeNavigationTarget(entry.reference_url);
    if (target?.type === "internal") return navigate(target.value);
    if (target?.type === "external") return window.location.assign(target.value);
    navigate("/notifications");
  };

  const selectedProductionObject = productions.find((entry) => String(entry.id) === String(selectedProduction));

  return (
    <>
      <Navbar expand="lg" sticky="top" className="cut-navbar cut-advanced-nav" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
        <Container className="cut-navbar__inner">
          <Navbar.Brand as={Link} to={nav.primary[0]?.to || "/feed"} className="cut-navbar__brand" onClick={closeMenu}><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>{currentMode?.label || "Participante"}</small></div></Navbar.Brand>
          <Navbar.Toggle aria-controls="cut-navbar" aria-label={open ? "Fechar menu" : "Abrir menu"} />
          <Navbar.Collapse id="cut-navbar">
            <div className="cut-navbar__drawer-heading cut-navbar__mode-live"><strong>{currentMode?.label}</strong><small>{currentMode?.description}</small></div>
            <NavDropdown className="cut-navbar__mode-chip" title={<span className="cut-navbar__mode-copy"><i className={currentMode?.icon} /><span>{currentMode?.label}</span><small>Trocar modo</small></span>} id="cut-mode-menu">
              <div className="cut-nav-mode-menu">{modes.map((entry) => <NavDropdown.Item key={entry.id} as="button" className={`cut-nav-mode-option ${entry.id === currentMode?.id ? "is-active" : ""}`} onClick={() => selectMode(entry.id)}><i className={entry.icon} /><span><strong>{entry.label}</strong><small>{entry.description}</small></span>{entry.id === currentMode?.id && <i className="fa-solid fa-check" />}</NavDropdown.Item>)}</div>
            </NavDropdown>

            <Nav className="cut-navbar__links mx-auto">
              {nav.primary.map((entry) => <Nav.Link key={entry.id} as={Link} to={entry.to} onClick={() => trackTelemetry("navigation_item_selected", { id: entry.id, mode: currentMode?.id, source: "primary" })} className={`cut-navbar__primary-link ${active(entry.to) ? "active" : ""}`}><i className={entry.icon} /><span>{entry.label}</span></Nav.Link>)}

              <NavDropdown title={<span><i className="fa-solid fa-ellipsis" /> Mais</span>} id="cut-more-menu">
                {contextual && <div className="cut-navbar__context-box"><div className="cut-navbar__context-title"><i className="fa-solid fa-location-crosshairs" />{contextual.label}</div>{contextual.items.map((entry) => <NavDropdown.Item key={entry.id} as={Link} to={entry.to}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}</div>}
                {nav.secondary.map((entry) => <NavDropdown.Item key={entry.id} as={Link} to={entry.to}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}
                {["manager", "admin"].includes(currentMode?.id) && <div className="cut-production-switcher"><label htmlFor="cut-production-context">Produção em foco</label><select id="cut-production-context" value={selectedProduction} onChange={(event) => { const id = event.target.value; setSelectedProduction(id); store(PRODUCTION_STORAGE_KEY, id); trackTelemetry("navigation_production_context_changed", { production_id: id || null }); if (id) navigate(`/production/${id}`); }}><option value="">Selecionar produção</option>{productions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || `Produção #${entry.id}`}</option>)}</select>{selectedProductionObject && <small className="d-block mt-1 opacity-75">Em foco: {selectedProductionObject.name}</small>}</div>}
              </NavDropdown>

              <NavDropdown className="cut-navbar__quick-toggle" title={<span><i className="fa-solid fa-plus" /> Ações</span>} id="cut-quick-menu"><div className="cut-navbar__quick-menu">{nav.quick.map((entry) => <NavDropdown.Item key={entry.id} as="button" onClick={() => go(entry, "quick_actions")}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}</div></NavDropdown>

              <NavDropdown align="end" title={<span className="cut-nav-notification-toggle" aria-label={unreadNotifications ? `${unreadNotifications} notificações não lidas` : "Notificações"}><i className={unreadNotifications > 0 ? "fa-solid fa-bell" : "fa-regular fa-bell"} />{unreadNotifications > 0 && <span className="cut-nav-notification__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</span>} id="cut-notifications-menu" className={`cut-nav-notification-menu ${active("/notifications") ? "active" : ""}`}>
                <div className="cut-notification-popover"><div className="cut-notification-popover__head"><strong>Notificações</strong>{unreadNotifications > 0 && <span>{unreadNotifications} nova{unreadNotifications === 1 ? "" : "s"}</span>}</div><NotificationPermissionControl compact /><div className="cut-notification-popover__list">{notificationPreview.length === 0 ? <div className="cut-notification-popover__empty"><i className="fa-regular fa-bell" /><span>Nenhuma novidade por aqui.</span></div> : notificationPreview.map((entry) => <button type="button" key={entry.id} {...notificationTelemetryAttrs(entry, "navbar_popover")} className={`cut-notification-popover__item ${entry.read_at ? "" : "is-unread"}`} onClick={() => openNotification(entry)}><span className="cut-notification-popover__icon"><i className={notificationIcon(entry.type)} /></span><span className="cut-notification-popover__copy"><strong>{entry.title || "Nova atividade"}</strong><small>{entry.message || "Há uma novidade para você na Cutinapp."}</small><time>{notificationTime(entry.created_at)}</time></span>{!entry.read_at && <span className="cut-notification-popover__dot" />}</button>)}</div><button type="button" className="cut-notification-popover__footer" onClick={() => navigate("/notifications")}>Ver todas as notificações</button></div>
              </NavDropdown>
            </Nav>

            <Nav className="cut-navbar__account"><NavDropdown align="end" title={<span className="cut-navbar__user"><span className="cut-navbar__avatar">{String(user.first_name || "C").slice(0, 2).toUpperCase()}</span><span><strong>{user.first_name || "Minha conta"}</strong><small>{currentMode?.label}</small></span></span>} id="cut-account-menu"><NavDropdown.Item as={Link} to="/profile"><i className="fa-regular fa-user me-2" />Meu perfil</NavDropdown.Item><NavDropdown.Item as={Link} to="/dashboard">Painel</NavDropdown.Item>{peterAdmin && <NavDropdown.Item as={Link} to="/admin"><i className="fa-solid fa-shield-halved me-2" />Admin Center</NavDropdown.Item>}<NavDropdown.Item as={Link} to="/user/edit">Editar conta</NavDropdown.Item>{isAdmin && <><NavDropdown.Divider /><NavDropdown.Item as={Link} to="/moderation/reports"><i className="fa-solid fa-user-shield me-2" />Moderação</NavDropdown.Item></>}<NavDropdown.Item as={Link} to="/password">Alterar senha</NavDropdown.Item><NavDropdown.Divider /><NavDropdown.Item as="button" onClick={signOut}>Sair</NavDropdown.Item></NavDropdown></Nav>
            <span data-peter-ecosystem-slot className="cut-navbar__ecosystem-slot" aria-label="Navegação do ecossistema Peter Tecnet" />
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <nav className="cut-mobile-bottom-nav" aria-label={`Navegação principal — ${currentMode?.label}`}>
        {nav.primary.slice(0, 2).map((entry) => <Link key={entry.id} to={entry.to} className={active(entry.to) ? "active" : ""} onClick={() => trackTelemetry("navigation_item_selected", { id: entry.id, mode: currentMode?.id, source: "mobile_bottom" })}><i className={entry.icon} /><span>{entry.label}</span></Link>)}
        <button type="button" className="cut-mobile-bottom-nav__quick" aria-label={nav.quick[0]?.label || "Ação rápida"} onClick={() => nav.quick[0] && go(nav.quick[0], "mobile_quick")}><i className="fa-solid fa-plus" /><span>Ação</span></button>
        {nav.primary.slice(2, 3).map((entry) => <Link key={entry.id} to={entry.to} className={active(entry.to) ? "active" : ""} onClick={() => trackTelemetry("navigation_item_selected", { id: entry.id, mode: currentMode?.id, source: "mobile_bottom" })}><i className={entry.icon} /><span>{entry.label}</span></Link>)}
        <button type="button" className="cut-mobile-bottom-nav__more" aria-label="Abrir menu completo" onClick={() => setOpen(true)}><i className="fa-solid fa-bars" /><span>Mais</span></button>
      </nav>
    </>
  );
}