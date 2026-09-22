import React, { useContext, useEffect, useMemo, useState } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { storageUrl } from "../config";
import cutinappService from "../services/CutinappService";
import artistService from "../services/ArtistService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";
import { safeNavigationTarget } from "../utils/safeUrl";
import { notificationTelemetryAttrs } from "../utils/notificationTelemetry";
import { trackTelemetry } from "../utils/telemetry";
import { resolveNavigationCapabilities } from "../navigation/capabilityResolver";
import {
  NAV_USAGE_STORAGE_KEY,
  PRODUCTION_STORAGE_KEY,
  accountNavigation,
  actorMenusFor,
  commonNavigation,
  contextualNavigation,
  quickActionsFor,
  rankQuickActions,
  readNavigationUsage,
} from "../navigation/navigationRegistry";
import NotificationPermissionControl from "./NotificationPermissionControl";

const CAPABILITY_CACHE_TTL = 5 * 60 * 1000;
const NAV_RUNTIME_CACHE_TTL = 45 * 1000;
const navigationRuntimeCache = new Map();

const runtimeCacheFor = (userId) => navigationRuntimeCache.get(String(userId || "")) || {};
const writeRuntimeCache = (userId, patch) => {
  if (!userId) return;
  const key = String(userId);
  navigationRuntimeCache.set(key, { ...runtimeCacheFor(userId), ...patch });
};
const runtimeCacheFresh = (timestamp, ttl = NAV_RUNTIME_CACHE_TTL) => Number(timestamp || 0) > 0 && Date.now() - Number(timestamp) < ttl;

const capabilityCacheKey = (userId) => `cutinapp:navigation-capabilities:${userId || "guest"}`;

const userAvatarUrl = (user) => {
  const value = user?.avatar || user?.photo || user?.picture || user?.profile_photo || user?.profile_photo_url;
  if (!value) return "";
  return /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\\//, "")}`;
};

const userInitials = (user) => `${user?.first_name?.[0] || user?.name?.[0] || "C"}${user?.last_name?.[0] || ""}`.toUpperCase();

const readStored = (key) => {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch (_) { return null; }
};

const store = (key, value) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch (_) { /* storage is an optimization only */ }
};

const readCapabilityEvidence = (userId) => {
  const raw = readStored(capabilityCacheKey(userId));
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value?.cachedAt || Date.now() - value.cachedAt > CAPABILITY_CACHE_TTL) return {};
    return value.evidence || {};
  } catch (_) { return {}; }
};

const cacheCapabilityEvidence = (userId, evidence) => store(capabilityCacheKey(userId), JSON.stringify({ cachedAt: Date.now(), evidence }));

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
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(date);
  } catch (_) { return ""; }
};

export default function NavlogComponent() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;
  const initialRuntimeCache = runtimeCacheFor(userId);
  const [open, setOpen] = useState(false);
  const [productions, setProductions] = useState(() => initialRuntimeCache.productions || []);
  const [selectedProduction, setSelectedProduction] = useState(() => readStored(PRODUCTION_STORAGE_KEY) || "");
  const [capabilityEvidence, setCapabilityEvidence] = useState(() => readCapabilityEvidence(userId));
  const [usage, setUsage] = useState(() => readNavigationUsage(readStored(NAV_USAGE_STORAGE_KEY)));
  const [unreadNotifications, setUnreadNotifications] = useState(() => Number(initialRuntimeCache.unreadNotifications || 0));
  const [notificationPreview, setNotificationPreview] = useState(() => initialRuntimeCache.notificationPreview || []);
  const [pendingArtistInvitations, setPendingArtistInvitations] = useState(() => Number(initialRuntimeCache.pendingArtistInvitations || 0));

  const capabilities = useMemo(() => resolveNavigationCapabilities(user, capabilityEvidence), [user, capabilityEvidence]);
  const actorMenus = useMemo(() => actorMenusFor(capabilities), [capabilities]);
  const contextual = useMemo(() => contextualNavigation(location.pathname, capabilities), [location.pathname, capabilities]);
  const quickActions = useMemo(() => rankQuickActions(quickActionsFor(capabilities), usage), [capabilities, usage]);
  const active = (to) => to === "/" ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(`${to}/`);
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    setCapabilityEvidence(readCapabilityEvidence(userId));
    if (!userId) {
      setProductions([]);
      setUnreadNotifications(0);
      setNotificationPreview([]);
      setPendingArtistInvitations(0);
      return;
    }
    const cached = runtimeCacheFor(userId);
    if (Array.isArray(cached.productions)) setProductions(cached.productions);
    if (Array.isArray(cached.notificationPreview)) setNotificationPreview(cached.notificationPreview);
    if (cached.unreadNotifications !== undefined) setUnreadNotifications(Number(cached.unreadNotifications || 0));
    if (cached.pendingArtistInvitations !== undefined) setPendingArtistInvitations(Number(cached.pendingArtistInvitations || 0));
  }, [userId]);

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
    if (!userId) { setProductions([]); return undefined; }
    let mounted = true;
    let timer;
    const cached = runtimeCacheFor(userId);
    if (runtimeCacheFresh(cached.productionsAt) && Array.isArray(cached.productions)) {
      setProductions(cached.productions);
      const evidence = { hasProductions: cached.productions.length > 0, productionCount: cached.productions.length };
      setCapabilityEvidence((current) => ({ ...current, ...evidence }));
      return () => { mounted = false; };
    }

    const loadOwnership = async () => {
      try {
        const data = await cutinappService.myProductions();
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setProductions(list);
        writeRuntimeCache(userId, { productions: list, productionsAt: Date.now() });
        const evidence = { hasProductions: list.length > 0, productionCount: list.length };
        setCapabilityEvidence((current) => ({ ...current, ...evidence }));
        cacheCapabilityEvidence(userId, evidence);
      } catch (_) { /* optional enrichment */ }
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(loadOwnership, { timeout: 1200 });
      return () => { mounted = false; window.cancelIdleCallback?.(idleId); };
    }
    timer = window.setTimeout(loadOwnership, 150);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPendingArtistInvitations(0);
      return undefined;
    }

    let mounted = true;
    const refreshInvitations = async (force = false) => {
      const cached = runtimeCacheFor(userId);
      if (!force && runtimeCacheFresh(cached.invitationsAt)) {
        if (mounted) setPendingArtistInvitations(Number(cached.pendingArtistInvitations || 0));
        return;
      }
      try {
        const response = await artistService.invitations({ per_page: 1 });
        if (!mounted) return;
        const nextCount = Number(response?.pending_count || 0);
        setPendingArtistInvitations(nextCount);
        writeRuntimeCache(userId, { pendingArtistInvitations: nextCount, invitationsAt: Date.now() });
      } catch (_) {
        // Preserve the last known count instead of flashing back to zero on transient failures.
      }
    };

    refreshInvitations();
    const timer = window.setInterval(refreshInvitations, 60000);
    const onFocus = () => refreshInvitations(false);
    const onUpdated = () => refreshInvitations(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("cutinapp:artist-invitations-updated", onUpdated);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("cutinapp:artist-invitations-updated", onUpdated);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) { setUnreadNotifications(0); setNotificationPreview([]); return undefined; }
    let mounted = true;

    const refresh = async (force = false) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const cached = runtimeCacheFor(userId);
      if (!force && runtimeCacheFresh(cached.notificationsAt)) {
        if (mounted) {
          setUnreadNotifications(Number(cached.unreadNotifications || 0));
          setNotificationPreview(Array.isArray(cached.notificationPreview) ? cached.notificationPreview : []);
        }
        return;
      }
      try {
        const response = await cutinappService.notifications({ per_page: 6 });
        if (!mounted) return;
        const nextUnread = Number(response?.unread_count || 0);
        const nextPreview = response?.notifications?.data || [];
        setUnreadNotifications(nextUnread);
        setNotificationPreview(nextPreview);
        writeRuntimeCache(userId, {
          unreadNotifications: nextUnread,
          notificationPreview: nextPreview,
          notificationsAt: Date.now(),
        });
      } catch (_) { /* notifications never block navigation */ }
    };

    const onVisible = () => document.visibilityState === "visible" && refresh(false);
    const onFocus = () => refresh(false);
    const onUpdated = () => refresh(true);
    refresh(false);
    const disconnect = subscribeToUserNotifications(userId, (notification) => {
      if (!mounted) return;
      if (!notification?.read_at) {
        setUnreadNotifications((current) => {
          const next = current + 1;
          writeRuntimeCache(userId, { unreadNotifications: next, notificationsAt: Date.now() });
          return next;
        });
      }
      setNotificationPreview((current) => {
        const next = [notification, ...current.filter((entry) => entry?.id !== notification?.id)].slice(0, 6);
        writeRuntimeCache(userId, { notificationPreview: next, notificationsAt: Date.now() });
        return next;
      });
    });
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("cutinapp:notifications-updated", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      if (typeof disconnect === "function") disconnect();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("cutinapp:notifications-updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const recordUsage = (entry, source) => {
    const nextUsage = { ...usage, [entry.id]: Number(usage[entry.id] || 0) + 1 };
    setUsage(nextUsage);
    store(NAV_USAGE_STORAGE_KEY, JSON.stringify(nextUsage));
    trackTelemetry("navigation_item_selected", { id: entry.id, route: entry.to, source, actor_areas: capabilities.actorAreas });
  };

  const go = (entry, source = "navbar") => {
    recordUsage(entry, source);
    closeMenu();
    navigate(entry.to);
  };

  const signOut = async () => {
    closeMenu();
    try { await logout(); } finally { navigate("/", { replace: true }); }
  };

  const openNotification = async (entry) => {
    if (!entry) return;
    if (!entry.read_at) {
      try {
        await cutinappService.markNotificationRead(entry.id);
        setUnreadNotifications((current) => {
          const next = Math.max(0, current - 1);
          writeRuntimeCache(userId, { unreadNotifications: next, notificationsAt: Date.now() });
          return next;
        });
        setNotificationPreview((current) => {
          const next = current.map((item) => item.id === entry.id ? { ...item, read_at: new Date().toISOString() } : item);
          writeRuntimeCache(userId, { notificationPreview: next, notificationsAt: Date.now() });
          return next;
        });
        window.dispatchEvent(new CustomEvent("cutinapp:notifications-updated"));
      } catch (_) { /* continue to destination */ }
    }
    const target = safeNavigationTarget(entry.reference_url);
    if (target?.type === "internal") return navigate(target.value);
    if (target?.type === "external") return window.location.assign(target.value);
    navigate("/notifications");
  };

  if (!user) {
    return (
      <Navbar expand="lg" sticky="top" className="cut-navbar cut-advanced-nav" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
        <Container className="cut-navbar__inner">
          <Navbar.Brand as={Link} to="/" className="cut-navbar__brand"><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>Rede social de eventos</small></div></Navbar.Brand>
          <Navbar.Toggle aria-controls="cut-navbar-public" aria-label={open ? "Fechar menu" : "Abrir menu"} />
          <Navbar.Collapse id="cut-navbar-public"><Nav className="ms-auto cut-navbar__links"><Nav.Link as={Link} to="/search" onClick={closeMenu}><i className="fa-solid fa-magnifying-glass me-2" />Buscar</Nav.Link><Nav.Link as={Link} to="/event">Eventos</Nav.Link><Nav.Link as={Link} to="/productions">Produções</Nav.Link><Nav.Link as={Link} to="/artists">Artistas</Nav.Link><Nav.Link as={Link} to="/login">Entrar</Nav.Link></Nav><span data-peter-ecosystem-slot className="cut-navbar__ecosystem-slot" /></Navbar.Collapse>
        </Container>
      </Navbar>
    );
  }

  const selectedProductionObject = productions.find((entry) => String(entry.id) === String(selectedProduction));
  const userAvatar = userAvatarUrl(user);
  const userFallbackInitials = userInitials(user);

  return (
    <>
      <Navbar expand="lg" sticky="top" className="cut-navbar cut-advanced-nav cut-capability-nav" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
        <Container className="cut-navbar__inner">
          <Navbar.Brand as={Link} to="/" className="cut-navbar__brand" onClick={closeMenu}><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>Rede social de eventos</small></div></Navbar.Brand>
          <Navbar.Toggle aria-controls="cut-navbar" aria-label={open ? "Fechar menu" : "Abrir menu"} />
          <Navbar.Collapse id="cut-navbar">
            <Link to="/profile" className="cut-navbar__mobile-account" onClick={closeMenu} aria-label="Abrir meu perfil">
              <span className="cut-navbar__avatar">{userAvatar ? <img src={userAvatar} alt="" /> : userFallbackInitials}</span>
              <span className="cut-navbar__mobile-account-copy"><strong>{user.first_name || user.name || "Minha conta"}</strong><small>{user.email}</small></span>
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </Link>
            <div className="cut-navbar__drawer-heading"><strong>Navegação</strong><small>{actorMenus.length ? `${actorMenus.length} área${actorMenus.length > 1 ? "s" : ""} de trabalho disponível${actorMenus.length > 1 ? "is" : ""}` : "Sua experiência Cutinapp"}</small></div>

            <Nav className="cut-navbar__links mx-auto" aria-label="Navegação principal">
              <Nav.Link as={Link} to="/search" aria-current={active("/search") ? "page" : undefined} className={`cut-navbar__primary-link cut-navbar__search-link ${active("/search") ? "active" : ""}`} onClick={() => { closeMenu(); trackTelemetry("navigation_item_selected", { id: "global-search", route: "/search", source: "global_search_page" }); }}><i className="fa-solid fa-magnifying-glass" /><span>Buscar</span></Nav.Link>
              {commonNavigation.map((entry) => <Nav.Link key={entry.id} as={Link} to={entry.to} aria-current={active(entry.to) ? "page" : undefined} onClick={() => recordUsage(entry, "common_primary")} className={`cut-navbar__primary-link ${active(entry.to) ? "active" : ""}`}><i className={entry.icon} /><span>{entry.label}</span></Nav.Link>)}

              {actorMenus.map((area) => <NavDropdown key={area.id} title={<span className="cut-actor-menu__title"><i className={area.icon} /><span>{area.label}</span>{area.id === "producer" && productions.length > 0 && <span className="cut-actor-menu__badge">{productions.length}</span>}</span>} id={`cut-actor-${area.id}`} className={`cut-actor-menu ${area.items.some((entry) => active(entry.to)) ? "active" : ""}`}>
                <div className="cut-actor-menu__heading"><i className={area.icon} /><span><strong>{area.label}</strong><small>{area.description}</small></span></div>
                {area.items.map((entry) => <NavDropdown.Item key={entry.id} as={Link} to={entry.to} aria-current={active(entry.to) ? "page" : undefined} onClick={() => recordUsage(entry, `actor_${area.id}`)}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}
                {area.id === "producer" && productions.length > 0 && <><NavDropdown.Divider /><div className="cut-production-switcher"><label htmlFor="cut-production-context">Produção em foco</label><select id="cut-production-context" value={selectedProduction} onChange={(event) => { const id = event.target.value; setSelectedProduction(id); store(PRODUCTION_STORAGE_KEY, id); trackTelemetry("navigation_production_context_changed", { production_id: id || null }); if (id) navigate(`/production/${id}`); }}><option value="">Selecionar produção</option>{productions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || `Produção #${entry.id}`}</option>)}</select>{selectedProductionObject && <small>Em foco: {selectedProductionObject.name}</small>}</div></>}
              </NavDropdown>)}

              {contextual && <NavDropdown title={<span><i className="fa-solid fa-location-crosshairs" /> Contexto</span>} id="cut-context-menu" className="cut-context-menu"><div className="cut-navbar__context-box"><div className="cut-navbar__context-title">{contextual.label}</div>{contextual.items.map((entry) => <NavDropdown.Item key={entry.id} as={Link} to={entry.to} onClick={() => recordUsage(entry, "contextual")}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}</div></NavDropdown>}

              {quickActions.length > 0 && <NavDropdown title={<span><i className="fa-solid fa-plus" /> Ações</span>} id="cut-quick-menu" className="cut-navbar__quick-toggle"><div className="cut-navbar__quick-menu"><div className="cut-quick-heading">Ações rápidas</div>{quickActions.slice(0, 6).map((entry) => <NavDropdown.Item key={entry.id} as="button" onClick={() => go(entry, "quick_actions")}><i className={`${entry.icon} me-2`} />{entry.label}</NavDropdown.Item>)}</div></NavDropdown>}

              <Nav.Link as={Link} to="/artist/invitations" className={`cut-navbar__primary-link ${active("/artist/invitations") ? "active" : ""}`} onClick={closeMenu} aria-label={pendingArtistInvitations ? `${pendingArtistInvitations} convites artísticos aguardando resposta` : "Convites artísticos"}>
                <span className="cut-nav-notification-toggle"><i className="fa-solid fa-id-card-clip" />{pendingArtistInvitations > 0 && <span className="cut-nav-notification__badge">{pendingArtistInvitations > 99 ? "99+" : pendingArtistInvitations}</span>}</span>
                <span>Convites</span>
              </Nav.Link>

              <NavDropdown align="end" title={<span className="cut-nav-notification-toggle" aria-label={unreadNotifications ? `${unreadNotifications} notificações não lidas` : "Notificações"}><i className={unreadNotifications > 0 ? "fa-solid fa-bell" : "fa-regular fa-bell"} />{unreadNotifications > 0 && <span className="cut-nav-notification__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</span>} id="cut-notifications-menu" className="cut-nav-notification-menu">
                <div className="cut-notification-popover"><div className="cut-notification-popover__head"><strong>Notificações</strong>{unreadNotifications > 0 && <span>{unreadNotifications} nova{unreadNotifications === 1 ? "" : "s"}</span>}</div><NotificationPermissionControl compact /><div className="cut-notification-popover__list">{notificationPreview.length === 0 ? <div className="cut-notification-popover__empty"><i className="fa-regular fa-bell" /><span>Nenhuma novidade por aqui.</span></div> : notificationPreview.map((entry) => <button type="button" key={entry.id} {...notificationTelemetryAttrs(entry, "navbar_popover")} className={`cut-notification-popover__item ${entry.read_at ? "" : "is-unread"}`} onClick={() => openNotification(entry)}><span className="cut-notification-popover__icon"><i className={notificationIcon(entry.type)} /></span><span className="cut-notification-popover__copy"><strong>{entry.title || "Nova atividade"}</strong><small>{entry.message || "Há uma novidade para você na Cutinapp."}</small><time>{notificationTime(entry.created_at)}</time></span>{!entry.read_at && <span className="cut-notification-popover__dot" />}</button>)}</div><button type="button" className="cut-notification-popover__footer" onClick={() => navigate("/notifications")}>Ver todas</button></div>
              </NavDropdown>
            </Nav>

            <Nav className="cut-navbar__account">
              <NavDropdown align="end" title={<span className="cut-navbar__user"><span className="cut-navbar__avatar">{userAvatar ? <img src={userAvatar} alt="" /> : userFallbackInitials}</span><span><strong>{user.first_name || user.name || "Minha conta"}</strong><small>{user.email}</small></span></span>} id="cut-account-menu">
                <div className="cut-account-menu__heading"><strong>Minha conta</strong><small>Itens pessoais disponíveis para todo usuário</small></div>
                {accountNavigation.map((entry) => <NavDropdown.Item key={entry.id} as={Link} to={entry.to} aria-current={active(entry.to) ? "page" : undefined} onClick={() => recordUsage(entry, "account")}><i className={`${entry.icon} me-2`} />{entry.label}{entry.id === "notifications" && unreadNotifications > 0 && <span className="cut-account-inline-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</NavDropdown.Item>)}
                <NavDropdown.Divider />
                <NavDropdown.Item as="button" onClick={signOut}><i className="fa-solid fa-arrow-right-from-bracket me-2" />Sair</NavDropdown.Item>
              </NavDropdown>
            </Nav>
            <span data-peter-ecosystem-slot className="cut-navbar__ecosystem-slot" aria-label="Navegação do ecossistema Peter Tecnet" />
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <nav className="cut-mobile-bottom-nav" aria-label="Navegação principal mobile">
        <Link to="/feed" className={active("/feed") ? "active" : ""} aria-current={active("/feed") ? "page" : undefined}><i className="fa-solid fa-bolt" /><span>Feed</span></Link>
        <Link to="/search" className={active("/search") ? "active" : ""} aria-current={active("/search") ? "page" : undefined}><i className="fa-solid fa-magnifying-glass" /><span>Buscar</span></Link>
        <Link to="/event" className={active("/event") ? "active" : ""} aria-current={active("/event") ? "page" : undefined}><i className="fa-regular fa-calendar-days" /><span>Eventos</span></Link>
        <Link to="/messages" className={active("/messages") ? "active" : ""} aria-current={active("/messages") ? "page" : undefined} aria-label="Mensagens"><i className="fa-regular fa-paper-plane" /><span>Mensagens</span></Link>
        <Link to="/profile" className={active("/profile") ? "active" : ""} aria-current={active("/profile") ? "page" : undefined}><i className="fa-regular fa-user" /><span>Perfil</span></Link>
      </nav>
    </>
  );
}
