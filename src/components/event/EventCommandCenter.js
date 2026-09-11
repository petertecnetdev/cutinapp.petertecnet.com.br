/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";
import { Badge, Offcanvas, ProgressBar } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { storageUrl } from "../../config";
import {
  EventAgendaDays,
  EventHealthBadge,
  EventMetrics,
  EventPerformanceBadge,
} from "./EventManagerEnhancements";
import {
  eventAlerts,
  eventHealth,
  eventOperationalMetrics,
  eventPerformance,
  moneyBR,
} from "../../utils/eventManagerInsights";

const TABS = [
  { key: "prepare", label: "Preparar", icon: "fa-solid fa-sliders" },
  { key: "sell", label: "Vender", icon: "fa-solid fa-chart-line" },
  { key: "operate", label: "Operar", icon: "fa-solid fa-bolt" },
  { key: "analyze", label: "Analisar", icon: "fa-solid fa-chart-pie" },
];

const imageUrl = (path) => {
  if (!path) return "";
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${value.replace(/^\//, "")}`;
};

const initials = (value) => String(value || "EV")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join("") || "EV";

const writeClipboard = async (text) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
};

const publicUrlFor = (event, channel = "command_center") => {
  if (!event?.slug || typeof window === "undefined") return "";
  const url = new URL(`/event/${event.slug}`, window.location.origin);
  url.searchParams.set("utm_source", "cutinapp_producer");
  url.searchParams.set("utm_medium", channel);
  url.searchParams.set("utm_campaign", "event_management");
  url.searchParams.set("utm_content", String(event.id || event.slug));
  return url.toString();
};

const eventStage = (event) => {
  if (event?.is_cancelled) return { key: "analyze", label: "Cancelado", tone: "secondary", icon: "fa-solid fa-ban" };
  if (event?.has_ended) return { key: "analyze", label: "Pós-evento", tone: "info", icon: "fa-solid fa-clock-rotate-left" };
  if (event?.is_happening_now) return { key: "operate", label: "Acontecendo agora", tone: "success", icon: "fa-solid fa-bolt" };
  if (!event?.is_published || Number(event?.available_tickets_count || 0) <= 0) {
    return { key: "prepare", label: "Preparação", tone: "warning", icon: "fa-solid fa-sliders" };
  }
  return { key: "sell", label: "Vendas abertas", tone: "success", icon: "fa-solid fa-chart-line" };
};

const countdown = (event) => {
  const target = new Date(event?.start_date || "").getTime();
  if (!Number.isFinite(target)) return "Data não definida";
  const diff = target - Date.now();
  if (event?.has_ended) return "Evento encerrado";
  if (event?.is_happening_now || diff <= 0) return "Acontecendo agora";
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `Começa em ${Math.max(1, hours)}h`;
  const days = Math.ceil(hours / 24);
  return `Começa em ${days} dia${days === 1 ? "" : "s"}`;
};

const preparationChecklist = (event) => {
  const description = String(event?.description || "").trim();
  const location = String(event?.venue || event?.address || event?.city || event?.online_url || "").trim();
  const productionId = Number(event?.production?.id || event?.production_id || 0);
  const tickets = Number(event?.tickets_count || 0);
  const sellable = Number(event?.available_tickets_count || 0);
  const itemsCount = Number(event?.event_items_count ?? event?.items_count ?? 0);

  return [
    { key: "identity", label: "Nome, data e horário", done: Boolean(String(event?.title || "").trim() && event?.start_date), route: `/event/edit/${event.id}` },
    { key: "location", label: "Local ou acesso online", done: Boolean(location), route: `/event/edit/${event.id}` },
    { key: "description", label: "Descrição completa", done: description.length >= 40, route: `/event/edit/${event.id}` },
    { key: "cover", label: "Flyer / capa", done: Boolean(event?.image), route: "/producer/media" },
    { key: "production", label: "Produção vinculada", done: productionId > 0, route: `/event/edit/${event.id}` },
    { key: "tickets", label: "Ingresso configurado", done: tickets > 0, route: `/ticket/create?eventId=${event.id}` },
    { key: "sellable", label: "Lote disponível para venda", done: sellable > 0 || event?.has_ended, route: `/ticket/create?eventId=${event.id}` },
    { key: "items", label: "Itens e adicionais revisados", done: itemsCount > 0 || Boolean(event?.items_reviewed), route: `/event/edit/${event.id}#items`, optional: true },
    { key: "published", label: "Evento publicado", done: Boolean(event?.is_published || event?.has_ended), mode: "publication" },
  ];
};

const commandButton = ({ key, icon, title, description, onClick, disabled, tone = "default" }) => (
  <button type="button" className={`cut-event-command-action is-${tone}`} onClick={onClick} disabled={disabled} key={key}>
    <span className="cut-event-command-action__icon"><i className={icon} /></span>
    <span><strong>{title}</strong><small>{description}</small></span>
    <i className="fa-solid fa-chevron-right cut-event-command-action__arrow" />
  </button>
);

export function EventAttentionCenter({ events = [], onOpen }) {
  const candidates = useMemo(() => events
    .filter((event) => !event?.is_cancelled)
    .map((event) => {
      const alerts = eventAlerts(event);
      const health = eventHealth(event);
      const performance = eventPerformance(event);
      const start = new Date(event?.start_date || "").getTime();
      const urgency = (alerts.some((item) => item.tone === "danger") ? 0 : alerts.length ? 1 : 2)
        + (health.score < 45 ? 0 : health.score < 65 ? 1 : 2)
        + Math.min(3, Math.max(0, performance.rank || 0));
      return { event, alerts, health, performance, start, urgency };
    })
    .filter((item) => item.alerts.length || item.health.score < 65 || item.performance.rank <= 3)
    .sort((a, b) => a.urgency - b.urgency || a.start - b.start)
    .slice(0, 4), [events]);

  if (!candidates.length) return (
    <section className="cut-event-attention-center is-clear">
      <div className="cut-event-attention-center__title">
        <span><i className="fa-solid fa-circle-check" /></span>
        <div><small>Central de ações</small><strong>Nenhuma pendência crítica agora</strong></div>
      </div>
      <p>Seus eventos não têm bloqueios urgentes. Continue acompanhando vendas, estoque e divulgação.</p>
    </section>
  );

  return (
    <section className="cut-event-attention-center" aria-label="Eventos que precisam de atenção">
      <header>
        <div className="cut-event-attention-center__title">
          <span><i className="fa-solid fa-bolt" /></span>
          <div><small>Central de ações</small><strong>{candidates.length} prioridade(s) para resolver agora</strong></div>
        </div>
        <span className="cut-event-attention-center__hint">Abra o evento e execute a ação sem se perder entre páginas.</span>
      </header>
      <div className="cut-event-attention-center__grid">
        {candidates.map(({ event, alerts, health, performance }) => {
          const firstAlert = alerts[0];
          const reason = firstAlert?.title
            || (health.score < 45 ? "Configuração incompleta" : performance.label);
          return (
            <button type="button" key={event.id} onClick={() => onOpen?.(event)}>
              <span className="cut-event-attention-center__event"><b>{event.title}</b><small>{event.production?.name || "Produção"}</small></span>
              <span className="cut-event-attention-center__reason"><i className={firstAlert?.icon || "fa-solid fa-triangle-exclamation"} />{reason}</span>
              <span className="cut-event-attention-center__score">{health.score}/100</span>
              <i className="fa-solid fa-arrow-right" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function EventCommandCenter({
  event,
  show,
  onHide,
  onDuplicate,
  onAgenda,
  onPublication,
  onCopyLink,
  onShare,
  onShareWhatsApp,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("prepare");
  const [feedback, setFeedback] = useState("");
  const [generatingQr, setGeneratingQr] = useState(false);

  useEffect(() => {
    if (!event) return;
    setActiveTab(eventStage(event).key);
    setFeedback("");
  }, [event]);

  if (!event) return null;

  const metrics = eventOperationalMetrics(event);
  const health = eventHealth(event);
  const alerts = eventAlerts(event);
  const stage = eventStage(event);
  const checklist = preparationChecklist(event);
  const requiredChecklist = checklist.filter((item) => !item.optional);
  const completed = requiredChecklist.filter((item) => item.done).length;
  const readiness = requiredChecklist.length ? Math.round((completed / requiredChecklist.length) * 100) : 100;
  const productionId = Number(event?.production?.id || event?.production_id || 0);
  const publicUrl = publicUrlFor(event);

  const navigateAndClose = (route) => {
    if (!route) return;
    onHide?.();
    navigate(route);
  };

  const copyPromotion = async () => {
    if (!publicUrl) return;
    const when = event.start_date ? new Date(event.start_date).toLocaleString("pt-BR") : "";
    const place = event.venue || event.city || "";
    const text = [`🎟️ ${event.title}`, when, place, "Garanta seu ingresso pela Cutinapp:", publicUrl].filter(Boolean).join("\n");
    await writeClipboard(text);
    setFeedback("Texto de divulgação copiado.");
  };

  const downloadQr = async () => {
    if (!publicUrl || generatingQr) return;
    setGeneratingQr(true);
    setFeedback("");
    try {
      const dataUrl = await QRCode.toDataURL(publicUrl, { width: 960, margin: 2, errorCorrectionLevel: "H" });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `cutinapp-${event.slug || event.id}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setFeedback("QR Code do evento gerado.");
    } catch (_) {
      setFeedback("Não foi possível gerar o QR Code.");
    } finally {
      setGeneratingQr(false);
    }
  };

  const groups = {
    prepare: [
      { key: "edit", icon: "fa-solid fa-pen", title: "Editar informações", description: "Nome, data, local, descrição e configurações.", onClick: () => navigateAndClose(`/event/edit/${event.id}`) },
      { key: "media", icon: "fa-regular fa-images", title: "Flyer e biblioteca de mídia", description: "Revise ou reutilize materiais visuais.", onClick: () => navigateAndClose("/producer/media") },
      { key: "lineup", icon: "fa-solid fa-microphone-lines", title: "Line-up e atrações", description: "Gerencie artistas, horários e destaques.", onClick: () => navigateAndClose(`/event/${event.id}/lineup`) },
      { key: "ticket", icon: "fa-solid fa-ticket", title: "Ingressos e lotes", description: "Crie ou revise lotes antes da publicação.", onClick: () => navigateAndClose(`/ticket/create?eventId=${event.id}`) },
      { key: "items", icon: "fa-solid fa-basket-shopping", title: "Itens e adicionais", description: "Revise produtos e extras vendidos no evento.", onClick: () => navigateAndClose(`/event/edit/${event.id}#items`) },
      { key: "agenda", icon: "fa-solid fa-calendar-week", title: "Agenda semanal", description: "Transforme este evento em modelo recorrente.", onClick: () => { onAgenda?.(event); onHide?.(); } },
      { key: "duplicate", icon: "fa-regular fa-copy", title: "Criar próxima edição", description: "Duplique preservando a base do evento.", onClick: () => { onDuplicate?.(event); onHide?.(); } },
    ],
    sell: [
      { key: "publication", icon: event.is_published ? "fa-solid fa-eye-slash" : "fa-solid fa-rocket", title: event.is_published ? "Despublicar evento" : "Publicar evento", description: event.is_published ? "Retire temporariamente a página pública." : "Coloque o evento no ar para começar a vender.", onClick: () => { onPublication?.(event); onHide?.(); }, tone: event.is_published ? "warning" : "success", disabled: event.is_cancelled },
      { key: "ticket", icon: "fa-solid fa-layer-group", title: "Gerenciar lotes", description: "Preço, estoque e disponibilidade dos ingressos.", onClick: () => navigateAndClose(`/ticket/create?eventId=${event.id}`) },
      ...(productionId ? [{ key: "coupons", icon: "fa-solid fa-tags", title: "Cupons", description: "Configure incentivos e rastreie conversões.", onClick: () => navigateAndClose(`/production/${productionId}/coupons`) }] : []),
      { key: "sales", icon: "fa-solid fa-chart-line", title: "Vendas e pedidos", description: "Abra o financeiro comercial do produtor.", onClick: () => navigateAndClose("/producer/sales") },
      { key: "copy", icon: "fa-regular fa-copy", title: "Copiar link rastreável", description: "Link com origem de campanha para divulgação.", onClick: () => onCopyLink?.(event), disabled: !event.is_published || !event.slug },
      { key: "whatsapp", icon: "fa-brands fa-whatsapp", title: "Divulgar no WhatsApp", description: "Abra uma mensagem pronta com link de venda.", onClick: () => onShareWhatsApp?.(event), tone: "success", disabled: !event.is_published || !event.slug },
      { key: "promo", icon: "fa-solid fa-wand-magic-sparkles", title: "Copiar texto de divulgação", description: "Gere uma chamada pronta com data, local e link.", onClick: copyPromotion, disabled: !event.is_published || !event.slug },
      { key: "qr", icon: "fa-solid fa-qrcode", title: generatingQr ? "Gerando QR Code…" : "Gerar QR Code", description: "Baixe o QR do link rastreável do evento.", onClick: downloadQr, disabled: !event.is_published || !event.slug || generatingQr },
      { key: "share", icon: "fa-solid fa-share-nodes", title: "Compartilhar", description: "Use o compartilhamento nativo do dispositivo.", onClick: () => onShare?.(event), disabled: !event.is_published || !event.slug },
    ],
    operate: [
      { key: "participants", icon: "fa-solid fa-users", title: "Participantes", description: "Consulte quem comprou ou recebeu ingresso.", onClick: () => navigateAndClose(`/event/${event.id}/participants`) },
      { key: "checkin", icon: "fa-solid fa-qrcode", title: "Portaria / check-in", description: "Abra a operação de entrada deste evento.", onClick: () => navigateAndClose(`/checkin?eventId=${event.id}`), disabled: !event.is_published || event.is_cancelled },
      { key: "courtesy", icon: "fa-solid fa-gift", title: "Cortesias", description: "Gerencie ingressos gratuitos como ingressos normais.", onClick: () => navigateAndClose(`/event/${event.id}/courtesies`) },
      { key: "public", icon: "fa-solid fa-user-check", title: "Visualizar como participante", description: "Veja exatamente a experiência pública do evento.", onClick: () => navigateAndClose(`/event/${event.slug}`), disabled: !event.slug },
      { key: "edit", icon: "fa-solid fa-screwdriver-wrench", title: "Ajustes operacionais", description: "Corrija informações sem perder o contexto do evento.", onClick: () => navigateAndClose(`/event/edit/${event.id}`) },
    ],
    analyze: [
      { key: "sales", icon: "fa-solid fa-chart-column", title: "Analisar vendas", description: "Faturamento, pedidos, taxas e comportamento comercial.", onClick: () => navigateAndClose("/producer/sales") },
      { key: "participants", icon: "fa-solid fa-users-viewfinder", title: "Base de participantes", description: "Consulte presença, emissão e público alcançado.", onClick: () => navigateAndClose(`/event/${event.id}/participants`) },
      ...(event.slug ? [{ key: "reviva", icon: "fa-solid fa-camera-retro", title: event.has_ended ? "Reviva Evento" : "Página pública", description: event.has_ended ? "Adicione fotos, avaliações e mantenha o evento vivo." : "Veja a experiência pública antes do evento.", onClick: () => navigateAndClose(`/event/${event.slug}${event.has_ended ? "#reviva" : ""}`) }] : []),
      { key: "duplicate", icon: "fa-solid fa-repeat", title: "Repetir este evento", description: "Crie uma nova edição usando esta configuração como base.", onClick: () => { onDuplicate?.(event); onHide?.(); } },
    ],
  };

  return (
    <Offcanvas show={show} onHide={onHide} placement="end" className="cut-event-command-center">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title>Central do Evento</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <section className="cut-event-command-hero">
          <div className="cut-event-command-hero__cover">
            {event.image ? <img src={imageUrl(event.image)} alt="" /> : <span>{initials(event.title)}</span>}
          </div>
          <div className="cut-event-command-hero__copy">
            <div className="cut-event-command-hero__badges">
              <Badge bg={stage.tone}><i className={`${stage.icon} me-1`} />{stage.label}</Badge>
              <EventPerformanceBadge event={event} />
              <EventHealthBadge event={event} showLabel={false} />
            </div>
            <small>{event.production?.name || "Produção"}</small>
            <h2>{event.title}</h2>
            <p>{countdown(event)} · {event.venue || event.address || event.city || "Local não informado"}</p>
          </div>
        </section>

        <section className="cut-event-command-overview">
          <EventMetrics event={event} />
          <div className="cut-event-command-overview__inventory">
            <div><span>Ocupação</span><strong>{Number(metrics.inventoryUtilizationRate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
            <ProgressBar now={Math.min(100, metrics.inventoryUtilizationRate)} />
            <small>{metrics.ticketsRemaining} ingresso(s) restante(s) · {metrics.checkedIn} check-in(s)</small>
          </div>
          <div className="cut-event-command-overview__readiness">
            <div><span>Preparação</span><strong>{readiness}%</strong></div>
            <ProgressBar now={readiness} />
            <small>{completed} de {requiredChecklist.length} etapas essenciais concluídas</small>
          </div>
        </section>

        {feedback && <div className="cut-event-command-feedback">{feedback}</div>}

        {alerts.length > 0 && <section className="cut-event-command-alerts">
          <header><span>Precisa da sua atenção</span><strong>{alerts.length}</strong></header>
          {alerts.map((alert) => <div key={alert.key} className={`is-${alert.tone}`}>
            <i className={alert.icon} />
            <span><strong>{alert.title}</strong><small>{alert.detail}</small></span>
          </div>)}
        </section>}

        <nav className="cut-event-command-tabs" aria-label="Áreas de gestão do evento">
          {TABS.map((tab) => <button type="button" key={tab.key} className={activeTab === tab.key ? "is-active" : ""} onClick={() => setActiveTab(tab.key)}>
            <i className={tab.icon} /><span>{tab.label}</span>
          </button>)}
        </nav>

        {activeTab === "prepare" && <section className="cut-event-command-checklist">
          <header><div><small>Pronto para trabalhar</small><strong>O que ainda falta neste evento?</strong></div><b>{readiness}%</b></header>
          <div>
            {checklist.map((item) => <button type="button" key={item.key} className={item.done ? "is-done" : ""} onClick={() => {
              if (item.mode === "publication") { onPublication?.(event); onHide?.(); }
              else if (item.route) navigateAndClose(item.route);
            }}>
              <i className={item.done ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />
              <span>{item.label}{item.optional ? <small>Opcional</small> : null}</span>
              {!item.done && <i className="fa-solid fa-chevron-right" />}
            </button>)}
          </div>
        </section>}

        <section className="cut-event-command-actions">
          <header><small>{TABS.find((tab) => tab.key === activeTab)?.label}</small><strong>Ações disponíveis agora</strong></header>
          <div>{groups[activeTab].map(commandButton)}</div>
        </section>

        <section className="cut-event-command-footer-metrics">
          <div><small>Faturamento</small><strong>{moneyBR(metrics.grossSales)}</strong></div>
          <div><small>Pedidos pagos</small><strong>{metrics.paidOrders}</strong></div>
          <div><small>Conversão</small><strong>{Number(metrics.conversionRate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
          <div><small>Visualizações</small><strong>{metrics.views}</strong></div>
        </section>

        <EventAgendaDays event={event} />
      </Offcanvas.Body>
    </Offcanvas>
  );
}
