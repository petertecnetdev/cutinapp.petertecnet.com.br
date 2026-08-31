import React from "react";
import PropTypes from "prop-types";
import PeterTecnetSignature from "../PeterTecnetSignature";
import "./AuthPageShell.css";

export default function AuthPageShell({ title, subtitle, children, compact = false }) {
  return (
    <div className={`cut-auth-shell${compact ? " cut-auth-shell--compact" : ""}`}>
      <div className="cut-auth-shell__bg" aria-hidden="true">
        <div className="cut-auth-shell__orb cut-auth-shell__orb--a" />
        <div className="cut-auth-shell__orb cut-auth-shell__orb--b" />
        <div className="cut-auth-shell__grid" />
      </div>

      <div className="cut-auth-shell__container">
        <div className="cut-auth-shell__layout">
          <aside className="cut-auth-shell__hero">
            <div className="cut-auth-shell__heroCard">
              <div>
                <div className="cut-auth-shell__brandRow">
                  <div className="cut-auth-shell__brandMark"><img src="/images/logo.png" alt="" /></div>
                  <div>
                    <span className="cut-auth-shell__eyebrow">Peter Tecnet</span>
                    <h1>Cutinapp</h1>
                    <p>Eventos, ingressos e acesso conectados em uma experiência simples.</p>
                  </div>
                </div>

                <div className="cut-auth-shell__pill"><span /> Evento • cortesia • QR Code • check-in</div>
                <ul className="cut-auth-shell__benefits">
                  <li><b>Para participantes</b><span>Encontre eventos, retire cortesias e tenha seu ingresso sempre à mão.</span></li>
                  <li><b>Para produtores</b><span>Crie produções, publique eventos e organize lotes gratuitos.</span></li>
                  <li><b>Para a portaria</b><span>Valide QR Codes pelo celular e bloqueie reutilizações automaticamente.</span></li>
                </ul>
              </div>

              <div className="cut-auth-shell__security"><i className="fa-solid fa-shield-halved" /> A validação dos ingressos acontece no servidor da Peter Tecnet.</div>
            </div>
          </aside>

          <main className="cut-auth-shell__main">
            <div className="cut-auth-shell__card">
              <header className="cut-auth-shell__cardHeader">
                <div className="cut-auth-shell__logo"><img src="/images/logo.png" alt="Cutinapp" /></div>
                <span className="cut-auth-shell__eyebrow">Cutinapp</span>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </header>
              <div className="cut-auth-shell__body">{children}</div>
              <div className="cut-auth-shell__terms">Ao continuar, você concorda com as políticas de uso e privacidade da plataforma.</div>
            </div>
          </main>
        </div>
        <PeterTecnetSignature />
      </div>
    </div>
  );
}

AuthPageShell.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  compact: PropTypes.bool,
};
