import React, { useContext, useEffect, useState } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";

export default function NavlogComponent() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const userId = user?.id;

  const active = (prefix) => location.pathname.startsWith(prefix);
  const closeMenu = () => setOpen(false);
  const isAdmin = user?.profile?.name === "Administrador" || user?.profile_name === "Administrador";

  useEffect(() => {
    if (!userId) {
      setUnreadNotifications(0);
      return undefined;
    }

    let mounted = true;
    const refreshUnread = async () => {
      try {
        const response = await cutinappService.notifications({ unread: true, per_page: 10 });
        if (mounted) setUnreadNotifications(Number(response?.unread_count || 0));
      } catch (_) {
        // O menu continua utilizável mesmo se a central estiver temporariamente indisponível.
      }
    };

    refreshUnread();

    const disconnectRealtime = subscribeToUserNotifications(userId, (notification) => {
      if (!mounted) return;
      setUnreadNotifications((current) => current + (notification?.read_at ? 0 : 1));
      window.dispatchEvent(new CustomEvent("cutinapp:notification-received", { detail: notification }));
    });

    const timer = window.setInterval(refreshUnread, 30000);
    window.addEventListener("focus", refreshUnread);
    window.addEventListener("cutinapp:notifications-updated", refreshUnread);

    return () => {
      mounted = false;
      if (typeof disconnectRealtime === "function") disconnectRealtime();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshUnread);
      window.removeEventListener("cutinapp:notifications-updated", refreshUnread);
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
    await logout();
    navigate("/", { replace: true });
  };

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
            <Nav.Link as={Link} to="/notifications" className={`${active("/notifications") ? "active " : ""}cut-nav-notification`} aria-label={`${unreadNotifications ? `${unreadNotifications} notificações não lidas` : "Notificações"}`} title="Notificações">
              <span className="cut-nav-notification__globe">
                <i className="fa-solid fa-earth-americas" />
                {unreadNotifications > 0 && <span className="cut-nav-notification__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
              </span>
              <span className="cut-nav-notification-label">Notificações</span>
            </Nav.Link>
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
