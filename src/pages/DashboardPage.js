import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import "./DashboardPage.css";

export default function DashboardPage() {
  const { user } = useContext(AuthContext);

  const isAdmin = user?.profile?.name === "Administrador";
  const isProducer = isAdmin || user?.profile?.name === "Produtor";
  const firstName = user?.first_name?.trim() || "bem-vindo";

  return (
    <div className="cut-dashboard">
      <NavlogComponent />

      <main className="cut-dashboard__main">
        <section className="cut-dashboard__hero" aria-labelledby="dashboard-title">
          <div className="cut-dashboard__hero-copy">
            <span className="cut-dashboard__eyebrow">CUTINAPP</span>
            <h1 id="dashboard-title">Olá, {firstName}.</h1>
            <p>
              Seu espaço para acessar eventos, produções e os recursos disponíveis
              para a sua conta de forma simples e organizada.
            </p>
          </div>

          <div className="cut-dashboard__hero-mark" aria-hidden="true">
            <img src="/images/logo.png" alt="" />
          </div>
        </section>

        <section className="cut-dashboard__section" aria-labelledby="quick-access-title">
          <div className="cut-dashboard__section-heading">
            <div>
              <span className="cut-dashboard__section-kicker">ACESSO RÁPIDO</span>
              <h2 id="quick-access-title">O que você quer fazer?</h2>
            </div>
          </div>

          <div className="cut-dashboard__grid">
            <Link to="/event" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon" aria-hidden="true">
                <i className="fa-solid fa-calendar-days" />
              </span>
              <div>
                <h3>Eventos</h3>
                <p>Visualize os eventos disponíveis na Cutinapp.</p>
              </div>
              <span className="cut-dashboard-card__arrow" aria-hidden="true">→</span>
            </Link>

            <Link to="/productions" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon" aria-hidden="true">
                <i className="fa-solid fa-layer-group" />
              </span>
              <div>
                <h3>Produções</h3>
                <p>Acesse as produções cadastradas na plataforma.</p>
              </div>
              <span className="cut-dashboard-card__arrow" aria-hidden="true">→</span>
            </Link>

            <Link to="/item" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon" aria-hidden="true">
                <i className="fa-solid fa-ticket" />
              </span>
              <div>
                <h3>Itens</h3>
                <p>Consulte os itens vinculados aos eventos e produções.</p>
              </div>
              <span className="cut-dashboard-card__arrow" aria-hidden="true">→</span>
            </Link>

            <Link to="/user/edit" className="cut-dashboard-card">
              <span className="cut-dashboard-card__icon" aria-hidden="true">
                <i className="fa-solid fa-user" />
              </span>
              <div>
                <h3>Minha conta</h3>
                <p>Atualize seus dados e informações de acesso.</p>
              </div>
              <span className="cut-dashboard-card__arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        {isProducer && (
          <section className="cut-dashboard__section" aria-labelledby="management-title">
            <div className="cut-dashboard__section-heading">
              <div>
                <span className="cut-dashboard__section-kicker">GESTÃO</span>
                <h2 id="management-title">
                  {isAdmin ? "Administração e operação" : "Sua operação"}
                </h2>
              </div>
            </div>

            <div className="cut-dashboard__management-grid">
              <Link to="/production/corp/list" className="cut-dashboard-action">
                <i className="fa-solid fa-briefcase" aria-hidden="true" />
                <span>
                  <strong>Minhas produções</strong>
                  <small>Gerencie suas produções</small>
                </span>
              </Link>

              <Link to="/event/corp/list" className="cut-dashboard-action">
                <i className="fa-solid fa-calendar-check" aria-hidden="true" />
                <span>
                  <strong>Meus eventos</strong>
                  <small>Gerencie seus eventos</small>
                </span>
              </Link>

              {isAdmin && (
                <>
                  <Link to="/user/list" className="cut-dashboard-action">
                    <i className="fa-solid fa-users" aria-hidden="true" />
                    <span>
                      <strong>Usuários</strong>
                      <small>Gerencie usuários da plataforma</small>
                    </span>
                  </Link>

                  <Link to="/profile/list" className="cut-dashboard-action">
                    <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                    <span>
                      <strong>Perfis</strong>
                      <small>Controle perfis e acessos</small>
                    </span>
                  </Link>
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
