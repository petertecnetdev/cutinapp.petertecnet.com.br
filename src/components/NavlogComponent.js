import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Nav, Navbar, Container, NavDropdown } from "react-bootstrap";
import authService from "../services/AuthService";
import { storageUrl } from "../config";

const Navigation = () => {
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await authService.me();
        setUser(userData);
      } catch (error) {
        console.error(error);
        window.location.href = "/logout";
      }
    };

    fetchUserData();
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <Navbar className="legacy-nav" expand="lg" sticky="top" collapseOnSelect>
      <Container>
        <Navbar.Brand as={Link} to="/" onClick={closeMenu} className="legacy-nav__brand">
          <img src="/images/logo.png" alt="Cutinapp" className="legacy-nav__logo" />
          <span className="legacy-nav__brand-copy">
            <strong>Cutinapp</strong>
            <small>by Peter Tecnet</small>
          </span>
        </Navbar.Brand>

        <Navbar.Toggle
          aria-controls="navbarNav"
          aria-label="Abrir menu"
          onClick={() => setIsMenuOpen((value) => !value)}
        />

        <Navbar.Collapse id="navbarNav" className={isMenuOpen ? "show" : ""}>
          <Nav className="me-auto" onClick={closeMenu}>
            <Nav.Link as={Link} to="/eventos">Eventos</Nav.Link>
            <Nav.Link as={Link} to="/productions">Produções</Nav.Link>
            <Nav.Link as={Link} to="/marketplace">Produtos</Nav.Link>

            {user?.profile?.name === "Administrador" && (
              <NavDropdown title="Administrativo" id="admin-dropdown">
                <NavDropdown.Item as={Link} to="/user/list">Usuários</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/profile/list">Perfis</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/production/admin/list">Produções</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/event/admin/list">Eventos</NavDropdown.Item>
              </NavDropdown>
            )}

            {(user?.profile?.name === "Produtor" || user?.profile?.name === "Administrador") && (
              <NavDropdown title="Corporativo" id="corporate-dropdown">
                <NavDropdown.Item as={Link} to="/production/corp/list">Minhas produções</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/event/corp/list">Meus eventos</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/my-sales">Minhas vendas</NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>

          <Nav className="legacy-nav__account">
            {user && (
              <NavDropdown title={user.first_name || "Minha conta"} id="profile-dropdown">
                <NavDropdown.Item as={Link} to="/minha-conta" onClick={closeMenu}>Gerenciar conta</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/password" onClick={closeMenu}>Alterar senha</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item as={Link} to="/logout" onClick={closeMenu}>Sair</NavDropdown.Item>
              </NavDropdown>
            )}
            <img
              src={user?.avatar ? `${storageUrl}/${user.avatar}` : "/images/logo.png"}
              alt="Avatar"
              className="legacy-nav__avatar"
            />
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navigation;
