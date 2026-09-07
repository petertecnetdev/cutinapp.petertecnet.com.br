import React from "react";
import PropTypes from "prop-types";
import { Card } from "react-bootstrap";

const compact = (value) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const moneyCents = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0) / 100);

export default function TimelineInsights({ analytics }) {
  const summary = analytics?.summary;
  if (!summary) return null;
  return <Card className="cut-feed-card cut-timeline-insights mb-4">
    <Card.Body>
      <div className="cut-timeline-insights__heading"><div><span className="cut-eyebrow">Performance</span><h2>O que sua timeline está gerando</h2></div><span className="cut-timeline-insights__conversion">{summary.conversion_rate || 0}% conversão / impressão</span></div>
      <div className="cut-timeline-kpis">
        <div><small>Impressões</small><strong>{compact(summary.impressions)}</strong></div>
        <div><small>Cliques em ingressos</small><strong>{compact(summary.ticket_clicks)}</strong><span>{summary.ticket_click_rate || 0}% CTR</span></div>
        <div><small>Vendas atribuídas</small><strong>{compact(summary.conversions)}</strong></div>
        <div><small>GMV atribuído</small><strong>{moneyCents(summary.gmv_cents)}</strong></div>
        <div><small>Receita Peter Tecnet</small><strong>{moneyCents(summary.platform_revenue_cents)}</strong></div>
      </div>
    </Card.Body>
  </Card>;
}

TimelineInsights.propTypes = { analytics: PropTypes.shape({ summary: PropTypes.object }) };
TimelineInsights.defaultProps = { analytics: null };
