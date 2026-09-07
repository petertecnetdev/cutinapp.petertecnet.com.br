import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavlogComponent from "../components/NavlogComponent";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";
import eventService from "../services/EventService";
import { producerActivationNextStep } from "../utils/producerActivationProgress";
import "./DashboardPage.css";

export default function DashboardPage() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({ passes: [], productions: [], events: [] });

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      cutinappService.myPasses(),
      cutinappService.myProductions(),
      eventService.myEvents(),
    ]).then((results) => {
      if (!active) return;
      setData({
        passes: results[0].status === "fulfilled" ? results[0].value : [],
        productions: results[1].status === "fulfilled" ? results[1].value : [],
        events: results[2].status === "fulfilled" ? results[2].value : [],
      });
    });
    return () => { active = false; };
  }, []);

  const producerStep = useMemo(() => producerActivationNextStep({
    productions: data.productions,
    events: data.events,
  }), [data.productions, data.events]);

  const trackActivationResume = () => {
    try {
      window.PeterTecnetTelemetry?.track?.("producer_activation_resumed", {
        label: "Produtor retomou a etapa pendente pelo dashboard",
        target: producerStep.stage,
        metadata: {
          activation_stage: producerStep.stage,
          event_id: Number(producerStep.eventId || 0) || null,
          productions_count: data.productions.length,
          events_count: data.events.length,
        },
      });
    } catch (_) {
      // Telemetry must never interrupt producer activation.
    }
  };

  return <div className="cut-dashboard">
    <NavlogComponent />
    <main className="cut-dashboard__main">
      <section className="cut-dashboard__hero">
        <div>
          <span className="cut-eyebrow">Cutinapp</span>
          <h1>Olá, {user?.first_name || "bem-vindo"}.</h1>
          <p>Seus eventos, ingressos e operação de entrada em um único painel.</p>
          <div className="cut-dashboard__hero-actions">
            <Link to="/event" className="cut-dashboard__primary">Explorar eventos</Link>
            <Link to={producerStep.route} onClick={trackActivationResume} className="cut-dashboard__secondary">{producerStep.label}</Link>
          </div>
          <small className="text-secondary d-block mt-2">{producerStep.description}</small>
        </div>
        <div className="cut-dashboard__heroMark"><img src="/images/logo.png" alt="" /></div>
      </section>

      <section className="cut-dashboard__stats">
        <article><span>Meus ingressos</span><strong>{data.passes.length}</strong><Link to="/passes">Abrir carteira →</Link></article>
        <article><span>Produções</span><strong>{data.productions.length}</strong><Link to="/production/mine">Gerenciar →</Link></article>
        <article><span>Eventos criados</span><strong>{data.events.length}</strong><Link to="/event/manage">Gerenciar →</Link></article>
      </section>

      <section className="cut-dashboard__section">
        <div className="cut-dashboard__heading"><span className="cut-eyebrow">Acesso rápido</span><h2>O que você quer fazer?</h2></div>
        <div className="cut-dashboard__grid">
          <Link to="/passes" className="cut-dashboard__card"><i className="fa-solid fa-ticket" /><div><h3>Meus ingressos</h3><p>Encontre seus QR Codes e ingressos já retirados.</p></div><b>→</b></Link>
          <Link to="/event" className="cut-dashboard__card"><i className="fa-regular fa-calendar-days" /><div><h3>Eventos</h3><p>Descubra eventos publicados na Cutinapp.</p></div><b>→</b></Link>
          <Link to={producerStep.route} onClick={trackActivationResume} className="cut-dashboard__card"><i className="fa-solid fa-bullhorn" /><div><h3>{producerStep.label}</h3><p>{producerStep.description}</p></div><b>→</b></Link>
          <Link to="/checkin" className="cut-dashboard__card"><i className="fa-solid fa-qrcode" /><div><h3>Portaria</h3><p>Abra a câmera e valide as entradas do evento.</p></div><b>→</b></Link>
        </div>
      </section>
    </main>
  </div>;
}
