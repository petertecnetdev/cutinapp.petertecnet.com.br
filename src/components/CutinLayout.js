import React from "react";
import PropTypes from "prop-types";
import { NavLink, Link } from "react-router-dom";
import { FaCalendarDays, FaTicket, FaStore, FaPeopleGroup, FaChartLine, FaBullhorn } from "react-icons/fa6";
import "./CutinLayout.css";

export default function CutinLayout({ children }) {
  const authenticated = Boolean(localStorage.getItem("token") || localStorage.getItem("access_token"));

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
            <NavLink to="/eventos"><FaCalendarDays /> <span>Eventos</span></NavLink>
            <NavLink to="/meus-ingressos"><FaTicket /> <span>Ingressos</span></NavLink>
            <NavLink to="/marketplace"><FaStore /> <span>Produtos</span></NavLink>
            <NavLink to="/promoter"><FaBullhorn /> <span>Promoter</span></NavLink>
            <NavLink to="/equipe"><FaPeopleGroup /> <span>Equipe</span></NavLink>
            <NavLink to="/produtor"><FaChartLine /> <span>Produzir</span></NavLink>
          </nav>

          <Link className="cutin-login" to={authenticated ? "/minha-conta" : "/login"}>
            {authenticated ? "Minha conta" : "Entrar"}
          </Link>
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
