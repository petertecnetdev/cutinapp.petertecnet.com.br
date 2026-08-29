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
        <Link to="/" className="cutin-brand" aria-label="Cutinapp início">
          <span className="cutin-mark">C</span>
          <span>Cutinapp</span>
        </Link>
        <nav>
          <NavLink to="/eventos"><FaCalendarDays /> Eventos</NavLink>
          <NavLink to="/meus-ingressos"><FaTicket /> Ingressos</NavLink>
          <NavLink to="/marketplace"><FaStore /> Produtos</NavLink>
          <NavLink to="/promoter"><FaBullhorn /> Promoter</NavLink>
          <NavLink to="/equipe"><FaPeopleGroup /> Equipe</NavLink>
          <NavLink to="/produtor"><FaChartLine /> Produzir</NavLink>
        </nav>
        <Link className="cutin-login" to={authenticated ? "/minha-conta" : "/login"}>{authenticated ? "Minha conta" : "Entrar"}</Link>
      </header>
      <main>{children}</main>
      <footer className="cutin-footer">
        <div><strong>Cutinapp</strong><span>Eventos, experiências e negócios em um só lugar.</span></div>
        <a href="https://petertecnet.com.br" target="_blank" rel="noreferrer">Desenvolvido pela Peter Tecnet</a>
      </footer>
    </div>
  );
}

CutinLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
