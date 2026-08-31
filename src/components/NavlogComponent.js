import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { AuthContext } from "../context/AuthContext";
import { storageUrl } from "../config";

export default function Navigation() {
  const { user, logout } = useContext(AuthContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const closeMenu = () => setIsMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate("/login", { replace: true });
  };

  const avatarUrl = user?.avatar ? `${storageUrl}${String(user.avatar).replace(/^\//, "")}` : "";

  return (
    <Navbar expand="lg" sticky="top" collapseOnSelect className="cut-navbar">
      <Container>
        <Navbar.Brand as={Link} to="/dashboard" onClick={closeMenu} className="cut-navbar__brand">
          <img src="/images/logo.png" alt="Cutinapp" className="cut-navbar__logo" />
          <span>Cutinapp</span>
        </Navbar.Brand>

        <Navbar.Toggle
          aria-controls="cutinapp-navbar"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        />

        <Navbar.Collapse id="cutinapp-navbar" className={isMenuOpen ? "show" : ""}>
          <Nav className="me-auto" onClick={closeMenu}>
            <Nav.Link as={Link} to="/dashboard">Início</Nav.Link>
            <Nav.Link as={Link} to="/event">Eventos</Nav.Link>
            <Nav.Link as={Link} to="/passes">Minhas cortesias</Nav.Link>

            <NavDropdown
              title={<span><i className="fa-solid fa-bolt me-1" />Área do produtor</span>}
              id="producer-dropdown"
            >
              <NavDropdown.Item as={Link} to="/production/mine">Minhas produções</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/production/create">Criar produção</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/manage">Meus eventos</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/event/create">Criar evento</NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item as={Link} to="/ticket/create">Criar cortesia</NavDropdown.Item>
              <NavDropdown.Item as={Link} to="/checkin">
                <i className="fa-solid fa-qrcode me-2" />Abrir portaria
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>

          <Nav className="align-items-lg-center">
            <NavDropdown
              title={<span className="cut-user-label">{user?.first_name || "Minha conta"}</span>}
              id="profile-dropdown"
              align="end"
            >
              <NavDropdown.Item as={Link} to="/user/edit">Minha conta</NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item as="button" onClick={handleLogout}>Sair</NavDropdown.Item>
            </NavDropdown>

            <div className="cut-avatar" aria-hidden="true">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                <span>{String(user?.first_name || "C").slice(0, 2).toUpperCase()}</span>
              )}
            </div>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
