import React, { useCallback, useEffect, useMemo, useState } from "react";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import acquisitionService from "../../services/AcquisitionService";
import { commissionDealPreview } from "../../utils/commissionDealPreview";
import "./AcquisitionDashboardPage.css";
import "./CommissionDealPreview.css";

const emptyTicket = () => ({ name: "Ingresso padrão", quantity: 100, price: 0, ticket_type: "standard", description: "" });
const emptyEvent = () => ({
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  event_format: "in_person",
  address: "",
  venue: "",
  city: "",
  uf: "",
  online_url: "",
  commission_percentage: 10,
  tickets: [emptyTicket()],
});
const emptyForm = () => ({
  user: { first_name: "", last_name: "", email: "" },
  production: { name: "", fantasy: "", cnpj: "", phone: "", description: "", city: "", uf: "", address: "", instagram_url: "", website_url: "" },
  events: [emptyEvent()],
});

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
};
const errorMessage = (error) => error?.response?.data?.message || error?.response?.data?.error || "Não foi possível concluir a operação.";
const referralStatusLabel = (status) => ({ accepted: "Ativado", pending: "Pendente", expired: "Expirado", revoked: "Revogado" }[status] || status);

export default function AcquisitionDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [feedback, setFeedback] = useState(null);
  const [commissionDrafts, setCommissionDrafts] = useState({});

  const refresh = useCallback(async () => {
    try {
      const data = await acquisitionService.dashboard();
      const commissionMax = Math.max(0, Number(data?.commission_max_percentage || 0));
      setDashboard(data);
      setForm((current) => ({
        ...current,
        events: current.events.map((event) => ({
          ...event,
          commission_percentage: Math.min(Math.max(0, Number(event.commission_percentage || 0)), commissionMax),
        })),
      }));
      setCommissionDrafts(Object.fromEntries((data?.commissions || []).map((row) => [row.event_id, String(row.percentage)])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh().catch((error) => setFeedback({ type: "error", text: errorMessage(error) })); }, [refresh]);

  const metrics = dashboard?.metrics || {};
  const commissionMax = Math.max(0, Number(dashboard?.commission_max_percentage || 0));
  const commissionEconomics = dashboard?.commission_economics || {};
  const retainedMargin = Math.max(0, Number(commissionEconomics.minimum_retained_margin_percentage || 0));
  const processingReserve = Math.max(0, Number(commissionEconomics.processing_reserve_percentage || 0));
  const conversion = Number(metrics.conversion_rate || 0);
  const funnelWidth = useMemo(() => `${Math.max(0, Math.min(100, conversion))}%`, [conversion]);

  const setUser = (field, value) => setForm((current) => ({ ...current, user: { ...current.user, [field]: value } }));
  const setProduction = (field, value) => setForm((current) => ({ ...current, production: { ...current.production, [field]: value } }));
  const setEvent = (index, field, value) => setForm((current) => ({ ...current, events: current.events.map((event, i) => i === index ? { ...event, [field]: value } : event) }));
  const setTicket = (eventIndex, ticketIndex, field, value) => setForm((current) => ({ ...current, events: current.events.map((event, i) => i !== eventIndex ? event : { ...event, tickets: event.tickets.map((ticket, ti) => ti === ticketIndex ? { ...ticket, [field]: value } : ticket) }) }));
  const addEvent = () => setForm((current) => ({ ...current, events: [...current.events, emptyEvent()] }));
  const removeEvent = (index) => setForm((current) => ({ ...current, events: current.events.filter((_, i) => i !== index) }));
  const addTicket = (eventIndex) => setForm((current) => ({ ...current, events: current.events.map((event, i) => i === eventIndex ? { ...event, tickets: [...event.tickets, emptyTicket()] } : event) }));
  const removeTicket = (eventIndex, ticketIndex) => setForm((current) => ({ ...current, events: current.events.map((event, i) => i === eventIndex ? { ...event, tickets: event.tickets.filter((_, ti) => ti !== ticketIndex) } : event) }));

  const submitOnboarding = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...form,
        production: { ...form.production, cnpj: String(form.production.cnpj || "").replace(/\D/g, "") || null, uf: String(form.production.uf || "").toUpperCase() || null },
        events: form.events.map((item) => ({
          ...item,
          uf: String(item.uf || form.production.uf || "").toUpperCase() || null,
          city: item.city || form.production.city || null,
          address: item.event_format === "online" ? null : (item.address || form.production.address || null),
          online_url: item.event_format === "in_person" ? null : item.online_url,
          commission_percentage: Number(item.commission_percentage),
          tickets: item.tickets.map((ticket) => ({ ...ticket, quantity: Number(ticket.quantity), price: Number(ticket.price) })),
        })),
      };
      const result = await acquisitionService.onboard(payload);
      setFeedback({ type: result.email_sent ? "success" : "warning", text: result.message });
      setForm(emptyForm());
      await refresh();
    } catch (error) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setFeedback({ type: "error", text: firstValidation || errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const resend = async (referralId) => {
    setFeedback(null);
    try {
      const result = await acquisitionService.resend(referralId);
      setFeedback({ type: result.email_sent ? "success" : "warning", text: result.message });
      await refresh();
    } catch (error) {
      setFeedback({ type: "error", text: errorMessage(error) });
    }
  };

  const saveCommission = async (eventId) => {
    try {
      const percentage = Number(commissionDrafts[eventId]);
      const result = await acquisitionService.updateCommission(eventId, percentage);
      setFeedback({ type: "success", text: result.message });
      await refresh();
    } catch (error) {
      setFeedback({ type: "error", text: errorMessage(error) });
    }
  };

  if (loading) return <ProcessingIndicatorComponent label="Carregando painel do agente" />;

  return (
    <div className="acq-page">
      <NavlogComponent />
      <main className="acq-shell">
        <section className="acq-hero">
          <div>
            <span className="acq-kicker">Operação comercial · Cutinapp</span>
            <h1>Painel do Agente</h1>
            <p>Cadastre produtores, prepare eventos e ingressos, acompanhe conversão e controle sua comissão por evento sem acesso ao Admin Center da Peter Tecnet.</p>
          </div>
          <div className="acq-hero__score">
            <span>Conversão</span>
            <strong>{conversion.toFixed(1)}%</strong>
            <div className="acq-progress"><i style={{ width: funnelWidth }} /></div>
            <small>{metrics.referrals_accepted || 0} ativações em {metrics.referrals_total || 0} convites</small>
          </div>
        </section>

        {feedback && <div className={`acq-feedback acq-feedback--${feedback.type}`}>{feedback.text}</div>}

        <section className="acq-metrics">
          <article><span>Convites</span><strong>{metrics.referrals_total || 0}</strong><small>{metrics.referrals_pending || 0} aguardando ativação</small></article>
          <article><span>Produções</span><strong>{metrics.productions_total || 0}</strong><small>originadas pelo seu trabalho</small></article>
          <article><span>Eventos</span><strong>{metrics.events_total || 0}</strong><small>com comissão configurada</small></article>
          <article><span>Vendas pagas</span><strong>{money(metrics.gross_sales)}</strong><small>{metrics.paid_orders || 0} pedidos confirmados</small></article>
          <article className="acq-metric--accent"><span>Sua comissão</span><strong>{money(metrics.commission_amount)}</strong><small>estimada sobre vendas pagas</small></article>
        </section>

        <section className="acq-layout">
          <div className="acq-panel acq-panel--form">
            <div className="acq-panel__head"><div><span className="acq-kicker">Novo onboarding</span><h2>Cadastrar produtor completo</h2></div><span className="acq-step-badge">1 usuário → N eventos</span></div>
            <form onSubmit={submitOnboarding}>
              <fieldset>
                <legend>Responsável pela produção</legend>
                <div className="acq-grid acq-grid--3">
                  <label><span>Nome</span><input required value={form.user.first_name} onChange={(e) => setUser("first_name", e.target.value)} /></label>
                  <label><span>Sobrenome</span><input value={form.user.last_name} onChange={(e) => setUser("last_name", e.target.value)} /></label>
                  <label><span>E-mail</span><input required type="email" value={form.user.email} onChange={(e) => setUser("email", e.target.value)} /></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Produção</legend>
                <div className="acq-grid acq-grid--3">
                  <label><span>Nome da produção</span><input required value={form.production.name} onChange={(e) => setProduction("name", e.target.value)} /></label>
                  <label><span>Nome fantasia</span><input value={form.production.fantasy} onChange={(e) => setProduction("fantasy", e.target.value)} /></label>
                  <label><span>CNPJ</span><input value={form.production.cnpj} onChange={(e) => setProduction("knpj", e.target.value)} /></label>
                  <label><span>Telefone</span><input value={form.production.phone} onChange={(e) => setProduction("phone", e.target.value)} /></label>
                  <label><span>Cidade</span><input value={form.production.city} onChange={(e) => setProduction("city", e.target.value)} /></label>
                  <label><span>UF</span><input maxLength={2} value={form.production.uf} onChange={(e) => setProduction("uf", e.target.value.toUpperCase())} /></label>
                  <label className="acq-span-2"><span>Endereço</span><input value={form.production.address} onChange={(e) => setProduction("address", e.target.value)} /></label>
                  <label><span>Instagram</span><input placeholder="https://instagram.com/..." value={form.production.instagram_url} onChange={(e) => setProduction("instagram_url", e.target.value)} /></label>
                  <label className="acq-span-3"><span>Descrição</span><textarea rows={3} value={form.production.description} onChange={(e) => setProduction("description", e.target.value)} /></label>
                </div>
              </fieldset>

              <div className="acq-event-stack">
                {form.events.map((eventItem, eventIndex) => (
                  <fieldset className="acq-event-card" key={`event-${eventIndex}`}>
                    <div className="acq-event-card__head">
                      <legend>Evento {eventIndex + 1}</legend>
                      {form.events.length > 1 && <button type="button" className="acq-link danger" onClick={() => removeEvent(eventIndex)}>Remover evento</button>}
                    </div>
                    <div className="acq-grid acq-grid--3">
                      <label className="acq-span-2"><span>Título</span><input required value={eventItem.title} onChange={(e) => setEvent(eventIndex, "title", e.target.value)} /></label>
                      <label><span>Comissão do agente (%)</span><input required type="number" min="0" max={commissionMax} step="0.01" value={eventItem.commission_percentage} onChange={(e) => setEvent(eventIndex, "commission_percentage", e.target.value)} /><small>Máximo econômico {commissionMax.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do GMV. O limite preserva {retainedMargin.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% para a Peter Tecnet{processingReserve > 0 ? ` e ${processingReserve.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% de processamento observado` : ""}.</small></label>
                      <label><span>Início</span><input required type="datetime-local" value={eventItem.start_date} onChange={(e) => setEvent(eventIndex, "start_date", e.target.value)} /></label>
                      <label><span>Fim</span><input required type="datetime-local" value={eventItem.end_date} onChange={(e) => setEvent(eventIndex, "end_date", e.target.value)} /></label>
                      <label><span>Formato</span><select value={eventItem.event_format} onChange={(e) => setEvent(eventIndex, "event_format", e.target.value)}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></label>
                      <label><span>Local</span><input value={eventItem.venue} onChange={(e) => setEvent(eventIndex, "venue", e.target.value)} /></label>
                      {eventItem.event_format !== "online" && <label className="acq-span-2"><span>Endereço do evento</span><input required value={eventItem.address} onChange={(e) => setEvent(eventIndex, "address", e.target.value)} /></label>}
                      {eventItem.event_format !== "in_person" && <label className="acq-span-2"><span>Link online</span><input required type="url" value={eventItem.online_url} onChange={(e) => setEvent(eventIndex, "online_url", e.target.value)} /></label>}
                      <label className="acq-span-3"><span>Descrição</span><textarea required rows={3} value={eventItem.description} onChange={(e) => setEvent(eventIndex, "description", e.target.value)} /></label>
                    </div>

                    <div className="acq-tickets">
                      <div className="acq-tickets__head"><h3>Ingressos</h3><button type="button" className="acq-link" onClick={() => addTicket(eventIndex)}>+ Adicionar ingresso</button></div>
                      {eventItem.tickets.map((ticket, ticketIndex) => (
                        <div className="acq-ticket-row" key={`ticket-${eventIndex}-${ticketIndex}`}>
                          <label><span>Nome</span><input required value={ticket.name} onChange={(e) => setTicket(eventIndex, ticketIndex, "name", e.target.value)} /></label>
                          <label><span>Quantidade</span><input required type="number" min="1" value={ticket.quantity} onChange={(e) => setTicket(eventIndex, ticketIndex, "quantity", e.target.value)} /></label>
                          <label><span>Preço (R$)</span><input required type="number" min="0" step="0.01" value={ticket.price} onChange={(e) => setTicket(eventIndex, ticketIndex, "price", e.target.value)} /></label>
                          {eventItem.tickets.length > 1 && <button type="button" className="acq-icon-button" title="Remover ingresso" onClick={() => removeTicket(eventIndex, ticketIndex)}>×</button>}
                        </div>
                      ))}
                      {(() => {
                        const preview = commissionDealPreview({
                          tickets: eventItem.tickets,
                          commissionPercentage: eventItem.commission_percentage,
                          minimumRetainedMarginPercentage: retainedMargin,
                          processingReservePercentage: processingReserve,
                        });
                        if (preview.selloutGmv <= 0) return null;
                        return <div className="acq-deal-preview">
                          <strong>Prévia econômica se os ingressos pagos esgotarem</strong>
                          <span>{money(preview.selloutGmv)} GMV · ticket médio {money(preview.averagePaidTicket)}</span>
                          <span>Comissão do agente: {money(preview.agentCommissionAtSellout)}</span>
                          <span>Margem mínima protegida Peter Tecnet: {money(preview.minimumPeterRetainedAtSellout)}</span>
                          {preview.processingReserveAtSellout > 0 && <span>Reserva de processamento considerada no teto: {money(preview.processingReserveAtSellout)}</span>}
                          <small>Projeção pelo estoque e preços informados. Não cria cobrança, não altera o preço e não garante venda.</small>
                        </div>;
                      })()}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="acq-form-actions">
                <button type="button" className="acq-secondary" onClick={addEvent}>+ Adicionar outro evento</button>
                <button type="submit" className="acq-primary" disabled={saving}>{saving ? "Criando onboarding..." : "Cadastrar e enviar convite"}</button>
              </div>
            </form>
          </div>

          <aside className="acq-side">
            <section className="acq-panel">
              <div className="acq-panel__head"><div><span className="acq-kicker">Pipeline</span><h2>Últimos produtores</h2></div></div>
              <div className="acq-referrals">
                {(dashboard?.recent_referrals || []).length === 0 && <div className="acq-empty">Nenhum produtor indicado ainda.</div>}
                {(dashboard?.recent_referrals || []).map((referral) => (
                  <article key={referral.id}>
                    <div><strong>{referral.production?.name || referral.name || referral.email}</strong><small>{referral.email}</small></div>
                    <span className={`acq-status acq-status--${referral.status}`}>{referralStatusLabel(referral.status)}</span>
                    <small>{referral.commissions_count || 0} evento(s) · {dateLabel(referral.created_at)}</small>
                    {["pending", "expired"].includes(referral.status) && <button type="button" className="acq-link" onClick={() => resend(referral.id)}>{referral.status === "expired" ? "Gerar novo convite" : "Reenviar convite"}</button>}
                  </article>
                ))}
              </div>
            </section>

            <section className="acq-panel">
              <div className="acq-panel__head"><div><span className="acq-kicker">Comissões</span><h2>Por evento</h2><small>Teto atual: {commissionMax.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do GMV, já descontando reservas econômicas da plataforma.</small></div></div>
              <div className="acq-commission-list">
                {(dashboard?.commissions || []).length === 0 && <div className="acq-empty">As comissões aparecerão após o primeiro onboarding.</div>}
                {(dashboard?.commissions || []).map((row) => (
                  <article key={row.id}>
                    <div className="acq-commission-title"><strong>{row.event?.title || `Evento #${row.event_id}`}</strong><small>{row.event?.production?.name}</small></div>
                    <div className="acq-commission-numbers"><span>{money(row.gross_sales)} vendidos</span><strong>{money(row.commission_amount)}</strong></div>
                    <div className={`acq-commission-edit${row.commission_locked ? " acq-commission-edit--locked" : ""}`}><input type="number" min="0" max={commissionMax} step="0.01" value={commissionDrafts[row.event_id] ?? row.percentage} disabled={row.commission_locked} aria-label={`Comissão de ${row.event?.title || `evento ${row.event_id}`}`} onChange={(e) => setCommissionDrafts((current) => ({ ...current, [row.event_id]: e.target.value }))} /><span>%</span><button type="button" disabled={row.commission_locked} onClick={() => saveCommission(row.event_id)}>{row.commission_locked ? "Bloqueada" : "Salvar"}</button></div>
                    {row.commission_locked && <small className="acq-commission-lock-note">Percentual protegido após a primeira venda paga.</small>}
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
