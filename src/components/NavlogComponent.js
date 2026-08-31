import React, { useContext, useState } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function NavlogComponent() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const active = (prefix) => location.pathname.startsWith(prefix);

  if (!user) {
    return <Navbar expand="lg" sticky="top" className="cut-navbar"><Container className="cut-navbar__inner"><Navbar.Brand as={Link} to="/" className="cut-navbar__brand"><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>Eventos Peter Tecnet</small></div></Navbar.Brand><Navbar.Toggle aria-controls="cut-navbar-public" /><Navbar.Collapse id="cut-navbar-public"><Nav className="ms-auto cut-navbar__links"><Nav.Link as={Link} to="/event">Eventos</Nav.Link><Nav.Link as={Link} to="/artists">Artistas</Nav.Link><Nav.Link as={Link} to="/login">Entrar</Nav.Link></Nav></Navbar.Collapse></Container></Navbar>;
  }

  const signOut = async () => { setOpen(false); await logout(); navigate("/", { replace: true }); };

  return (
    <Navbar expand="lg" sticky="top" className="cut-navbar" expanded={open} onToggle={setOpen}>
      <Container className="cut-navbar__inner">
        <Navbar.Brand as={Link} to="/feed" className="cut-navbar__brand"><img src="/images/logo.png" alt="Cutinapp" /><div><strong>Cutinapp</strong><small>Eventos Peter Tecnet</small></div></Navbar.Brand>
        <Navbar.Toggle aria-controls="cut-navbar" />
        <Navbar.Collapse id="cut-navbar">
          <Nav className="cut-navbar__links mx-auto">
            <Nav.Link as={Link} to="/feed" className={active("/feed") ? "active" : ""}><i className="fa-solid fa-bolt"/> Feed</Nav.Link>
            <Nav.Link as={Link} to="/event" className={active("/event") && !active("/event/manage") ? "active" : ""}><i className="fa-regular fa-calendar-days"/> Eventos</Nav.Link>
            <Nav.Link as={Link} to="/artists" className={active("/artist") ? "active" : ""}><i className="fa-solid fa-music"/> Artistas</Nav.Link>
            <Nav.Link as={Link} to="/passes" className={active("/passes") ? "active" : ""}><i className="fa-solid fa-ticket"/> Ingressos</Nav.Link>
            <NavDropdown title={<span><i className="fa-solid fa-bullhorn"/> Produzir</span>} id="cut-producer-menu">
              <NavDropdown.Item as={Link} to="/production/mine">Minhas produções</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/manage">Meus eventos</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/artist/manage">Artistas</NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item as={Link} to="/production/create">Nova produção</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/create">Novo evento</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/ticket/create">Nova cortesia</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/checkin">Abrir portaria</NavDropdown.Item>
            </NavDropdown>
          </Nav>
          <Nav className="cut-navbar__account">
            <NavDropdown align="end" title={<span className="cut-navbar__user"><span className="cut-navbar__avatar">{String(user.first_name || "C").slice(0,2).toUpperCase()}</span><span><strong>{user.first_name || "Minha conta"}</strong><small>{user.email}</small></span></span>} id="cut-account-menu">
              <NavDropdown.Item as={Link} to="/dashboard">Painel</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/user/edit">Minha conta</NavDropdown.Item>
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
