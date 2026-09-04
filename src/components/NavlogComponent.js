import React, { useContext, useEffect, useState } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";
import { hasContextRole } from "../utils/applicationRoles";
import { safeNavigationTarget } from "../utils/safeUrl";

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
  } catch (_) {
    return "";
  }
};

export default function NavlogComponent() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationPreview, setNotificationPreview] = useState([]);
  const userId = user?.id;

  const active = (prefix) => location.pathname.startsWith(prefix);
  const closeMenu = () => setOpen(false);
  const isAdmin = user?.profile?.name === "Administrador" || user?.profile_name === "Administrador";
  const isAcquisitionAgent = hasContextRole(user, "acquisition_agent");

  useEffect(() => {
    if (!userId) {
      setUnreadNotifications(0);
      setNotificationPreview([]);
      return undefined;
    }

    let mounted = true;
    const refreshNotifications = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      try {
        const response = await cutinappService.notifications({ per_page: 6 });
        if (!mounted) return;
        setUnreadNotifications(Number(response?.unread_count || 0));
        setNotificationPreview(response?.notifications?.data || []);
      } catch (_) {
        // O menu continua utilizável mesmo se a central estiver temporariamente indisponível.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshNotifications();
    };

    refreshNotifications();

    const disconnectRealtime = subscribeToUserNotifications(userId, (notification) => {
      if (!mounted) return;
      if (!notification?.read_at) setUnreadNotifications((current) => current + 1);
      setNotificationPreview((current) => [notification, ...current.filter((item) => item?.id !== notification?.id)].slice(0, 6));
      window.dispatchEvent(new CustomEvent("cutinapp:notification-received", { detail: notification }));
    });

    const timer = window.setInterval(refreshNotifications, 60000);
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("cutinapp:notifications-updated", refreshNotifications);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      if (typeof disconnectRealtime === "function") disconnectRealtime();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("cutinapp:notifications-updated", refreshNotifications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId]);

  if (!user) {
    return (
      <Navbar expand="lg" sticky="top" className="cut-navbar" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
        <Container className="cut-navbar__inner">
          <Navbar.Brand as={Link} to="/" className="cut-navbar__brand" onClick={closeMenu}>
            <img src="/images/logo.png" alt="Cutinapp" />
            <div><strong>Cutinapp</strong><small>Rede social de eventos</small></div>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="cut-navbar-public" aria-label="Abrir menu" />
          <Navbar.Collapse id="cut-navbar-public">
            <Nav className="ms-auto cut-navbar__links">
              <Nav.Link as={Link} to="/event">Eventos</Nav.Link>
              <Nav.Link as={Link} to="/artists">Artistas</Nav.Link>
              <Nav.Link as={Link} to="/login">Entrar</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    );
  }

  const signOut = async () => {
    closeMenu();
    try {
      await logout();
    } finally {
      navigate("/", { replace: true });
    }
  };

  const openNotification = async (item) => {
    if (!item) return;
    if (!item.read_at) {
      try {
        await cutinappService.markNotificationRead(item.id);
        setUnreadNotifications((current) => Math.max(0, current - 1));
        setNotificationPreview((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
        window.dispatchEvent(new CustomEvent("cutinapp:notifications-updated"));
      } catch (_) { /* a navegação continua */ }
    }

    const target = safeNavigationTarget(item.reference_url);
    if (target?.type === "internal") return navigate(target.value);
    if (target?.type === "external") {
      window.location.assign(target.value);
      return;
    }

    navigate("/notifications");
  };

  const notificationToggle = (
    <span className="cut-nav-notification-toggle" aria-label={unreadNotifications ? `${unreadNotifications} notificações não lidas` : "Notificações"}>
      <i className={unreadNotifications > 0 ? "fa-solid fa-bell" : "fa-regular fa-bell"} />
      {unreadNotifications > 0 && <span className="cut-nav-notification__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
    </span>
  );

  return (
    <Navbar expand="lg" sticky="top" className="cut-navbar" expanded={open} onToggle={setOpen} onSelect={closeMenu}>
      <Container className="cut-navbar__inner">
        <Navbar.Brand as={Link} to="/feed" className="cut-navbar__brand" onClick={closeMenu}>
          <img src="/images/logo.png" alt="Cutinapp" />
          <div><strong>Cutinapp</strong><small>Rede social de eventos</small></div>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="cut-navbar" aria-label="Abrir menu" />
        <Navbar.Collapse id="cut-navbar">
          <Nav className="cut-navbar__links mx-auto">
            <Nav.Link as={Link} to="/feed" className={active("/feed") ? "active" : ""}><i className="fa-solid fa-bolt" /> Feed</Nav.Link>
            <Nav.Link as={Link} to="/event" className={active("/event") && !active("/event/manage") ? "active" : ""}><i className="fa-regular fa-calendar-days" /> Eventos</Nav.Link>
            <Nav.Link as={Link} to="/artists" className={active("/artist") ? "active" : ""}><i className="fa-solid fa-music" /> Artistas</Nav.Link>
            <Nav.Link as={Link} to="/passes" className={active("/passes") ? "active" : ""}><i className="fa-solid fa-ticket" /> Ingressos</Nav.Link>
            <Nav.Link as={Link} to="/purchases" className={active("/purchases") ? "active" : ""}><i className="fa-solid fa-receipt" /> Compras</Nav.Link>
            {isAcquisitionAgent && <Nav.Link as={Link} to="/agent" className={active("/agent") ? "active" : ""}><i className="fa-solid fa-user-tie" /> Agente</Nav.Link>}
            <NavDropdown align="end" title={notificationToggle} id="cut-notifications-menu" className={`cut-nav-notification-menu ${active("/notifications") ? "active" : ""}`}>
              <div className="cut-notification-popover">
                <div className="cut-notification-popover__head"><strong>Notificações</strong>{unreadNotifications > 0 && <span>{unreadNotifications} nova{unreadNotifications === 1 ? "" : "s"}</span>}</div>
                <div className="cut-notification-popover__list">
                  {notificationPreview.length === 0 ? <div className="cut-notification-popover__empty"><i className="fa-regular fa-bell" /><span>Nenhuma novidade por aqui.</span></div> : notificationPreview.map((item) => <button type="button" key={item.id} className={`cut-notification-popover__item ${item.read_at ? "" : "is-unread"}`} onClick={() => openNotification(item)}><span className="cut-notification-popover__icon"><i className={notificationIcon(item.type)} /></span><span className="cut-notification-popover__copy"><strong>{item.title || "Nova atividade"}</strong><small>{item.message || "Há uma novidade para você na Cutinapp."}</small><time>{notificationTime(item.created_at)}</time></span>{!item.read_at && <span className="cut-notification-popover__dot" />}</button>)}
                </div>
                <button type="button" className="cut-notification-popover__footer" onClick={() => navigate("/notifications")}>Ver todas as notificações</button>
              </div>
            </NavDropdown>
            <NavDropdown title={<span><i className="fa-solid fa-bullhorn" /> Produzir</span>} id="cut-producer-menu">
              <NavDropdown.Item as={Link} to="/production/mine">Minhas produções</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/producer/contracts"><i className="fa-solid fa-file-signature me-2" />Contratos</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/manage">Meus eventos</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/producer/sales"><i className="fa-solid fa-chart-line me-2" />Vendas</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/producer/finance"><i className="fa-solid fa-wallet me-2" />Financeiro</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/artist/manage">Artistas</NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item as={Link} to="/production/create">Nova produção</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/create">Novo evento</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/ticket/create">Nova cortesia</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/checkin">Abrir portaria</NavDropdown.Item>
            </NavDropdown>
          </Nav>
          <Nav className="cut-navbar__account">
            <NavDropdown align="end" title={<span className="cut-navbar__user"><span className="cut-navbar__avatar">{String(user.first_name || "C").slice(0, 2).toUpperCase()}</span><span><strong>{user.first_name || "Minha conta"}</strong><small>{user.email}</small></span></span>} id="cut-account-menu">
              <NavDropdown.Item as={Link} to="/profile"><i className="fa-regular fa-user me-2" />Meu perfil</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/dashboard">Painel</NavDropdown.Item>
              {isAcquisitionAgent && <NavDropdown.Item as={Link} to="/agent"><i className="fa-solid fa-user-tie me-2" />Painel do agente</NavDropdown.Item>}
              <NavDropdown.Item as={Link} to="/purchases"><i className="fa-solid fa-receipt me-2" />Minhas compras</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/user/edit">Editar conta</NavDropdown.Item>
              {isAdmin && <><NavDropdown.Divider /><NavDropdown.Item as={Link} to="/moderation/reports"><i className="fa-solid fa-shield-halved me-2" />Moderação</NavDropdown.Item></>}
              <NavDropdown.Item as={Link} to="/password">Alterar senha</NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item as="button" onClick={signOut}>Sair</NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
