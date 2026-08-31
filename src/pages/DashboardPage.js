import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import cutinappService from "../services/CutinappService";
import "./DashboardPage.css";

export default function DashboardPage() {
  const { user } = useContext(AuthContext);
  const [productions, setProductions] = useState([]);
  const firstName = user?.first_name?.trim() || "bem-vindo";

  useEffect(() => {
    let active = true;
    cutinappService
      .myProductions()
      .then((items) => active && setProductions(items))
      .catch(() => active && setProductions([]));
    return () => {
      active = false;
    };
  }, []);

  const hasProduction = productions.length > 0;

  return (
    <div className="cut-dashboard">
      <NavlogComponent />

      <main className="cut-dashboard__main">
        <section className="cut-dashboard__hero" aria-labelledby="dashboard-title">
          <div className="cut-dashboard__hero-copy">
            <span className="cut-dashboard__eyebrow">CUTINAPP · EVENTOS E ACESSO</span>
            <h1 id="dashboard-title">Olá, {firstName}.</h1>
            <p>
              Descubra eventos, retire cortesias em QR Code ou organize sua própria produção.
              A Cutinapp agora concentra o fluxo do ingresso gratuito até a validação na portaria.
            </p>
            <div className="cut-dashboard__hero-actions">
              <Link to="/event" className="btn btn-primary">Encontrar eventos</Link>
              <Link to="/passes" className="btn btn-outline-light">Minhas cortesias</Link>
            </div>
          </div>

          <div className="cut-dashboard__hero-mark" aria-hidden="true">
            <img src="/images/logo.png" alt="" />
          </div>
        </section>

        <section className="cut-dashboard__section" aria-labelledby="quick-access-title">
          <div className="cut-dashboard__section-heading">
            <div>
              <span className="cut-dashboard__section-kicker">PARA PARTICIPAR</span>
              <h2 id="quick-access-title">Seu evento no celular</h2>
            </div>
          </div>

          <div className="cut-dashboard__grid">
            <Link to="/event" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon"><i className="fa-solid fa-calendar-days" /></span>
              <div><h3>Eventos</h3><p>Veja os eventos e as cortesias disponíveis.</p></div>
              <span className="cut-dashboard-card__arrow">→</span>
            </Link>

            <Link to="/passes" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon"><i className="fa-solid fa-qrcode" /></span>
              <div><h3>Minhas cortesias</h3><p>Acesse seus QR Codes e apresente-os na entrada.</p></div>
              <span className="cut-dashboard-card__arrow">→</span>
            </Link>

            <Link to="/user/edit" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon"><i className="fa-solid fa-user" /></span>
              <div><h3>Minha conta</h3><p>Mantenha seus dados pessoais atualizados.</p></div>
              <span className="cut-dashboard-card__arrow">→</span>
            </Link>
          </div>
        </section>

        <section className="cut-dashboard__section" aria-labelledby="producer-title">
          <div className="cut-dashboard__section-heading">
            <div>
              <span className="cut-dashboard__section-kicker">PARA PRODUZIR</span>
              <h2 id="producer-title">Organize e valide seus eventos</h2>
            </div>
          </div>

          <div className="cut-dashboard__management-grid">
            <Link to={hasProduction ? "/production/mine" : "/production/create"} className="cut-dashboard-action">
              <i className="fa-solid fa-layer-group" />
              <span>
                <strong>{hasProduction ? "Minhas produções" : "Criar minha produção"}</strong>
                <small>{hasProduction ? "Gerencie as marcas responsáveis" : "Comece sem depender de liberação administrativa"}</small>
              </span>
            </Link>

            <Link to="/event/manage" className="cut-dashboard-action">
              <i className="fa-solid fa-calendar-check" />
              <span><strong>Meus eventos</strong><small>Crie eventos e lotes de cortesia</small></span>
            </Link>

            <Link to="/ticket/create" className="cut-dashboard-action">
              <i className="fa-solid fa-ticket" />
              <span><strong>Criar cortesia</strong><small>Publique um lote gratuito com QR individual</small></span>
            </Link>

            <Link to="/checkin" className="cut-dashboard-action cut-dashboard-action--accent">
              <i className="fa-solid fa-camera" />
              <span><strong>Abrir portaria</strong><small>Leia QR Codes pela câmera e bloqueie reutilização</small></span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
