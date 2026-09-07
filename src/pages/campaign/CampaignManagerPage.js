import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import campaignService from "../../services/CampaignService";
import eventService from "../../services/EventService";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const initialForm = { event_id: "", type: "poll", objective: "engagement", title: "", description: "", starts_at: "", ends_at: "", reward_mode: "none", reward_kind: "benefit", reward_value: "", reward_label: "", options: "", sponsor_name: "", boost_budget: "", boost_placement: "event_feed" };
const regulatedTypes = new Set(["contest", "draw", "giveaway"]);

export default function CampaignManagerPage() {
  const { user } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [metrics, setMetrics] = useState({});
  const [complianceDrafts, setComplianceDrafts] = useState({});
  const rootAdmin = isPeterTecnetRoot(user);

  const load = async () => {
    setLoading(true);
    try {
      const [eventRows, campaignRows] = await Promise.all([eventService.myEvents(), campaignService.list({ mine: 1, per_page: 100 })]);
      setEvents(eventRows || []); setCampaigns(campaignRows || []);
      const preferredEvent = searchParams.get("eventId") || form.event_id || eventRows?.[0]?.id || "";
      setForm((current) => ({ ...current, event_id: current.event_id || String(preferredEvent) }));
    } catch (err) { setError(err?.message || "Não foi possível carregar as campanhas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const selectedEvent = useMemo(() => events.find((event) => Number(event.id) === Number(form.event_id)), [events, form.event_id]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const create = async (publishAfter = false) => {
    if (!form.event_id || !form.title.trim()) { setError("Escolha o evento e informe um título para a campanha."); return; }
    const options = form.options.split("\n").map((label) => label.trim()).filter(Boolean).map((label) => ({ label }));
    if (["poll", "contest"].includes(form.type) && options.length < 2) { setError("Enquetes e concursos precisam de pelo menos duas opções."); return; }
    const rewardMode = regulatedTypes.has(form.type) ? "winner" : form.reward_mode;
    const payload = {
      event_id: Number(form.event_id), type: form.type, objective: form.objective, title: form.title.trim(), description: form.description.trim() || null,
      starts_at: form.starts_at || null, ends_at: form.ends_at || null, options,
      reward: { mode: rewardMode, kind: form.reward_kind, value: form.reward_value === "" ? null : Number(form.reward_value), label: form.reward_label.trim() || null, has_prize: rewardMode === "winner" },
      sponsor_metadata: form.sponsor_name.trim() ? { name: form.sponsor_name.trim() } : null,
      boost_metadata: form.type === "boost" || Number(form.boost_budget || 0) > 0 ? { budget: Number(form.boost_budget || 0), placement: form.boost_placement } : null,
      configuration: { attribution: "last_campaign_touch", conversion_target: "event_commerce" },
    };
    setBusy("create"); setError(""); setSuccess("");
    try {
      const response = await campaignService.create(payload);
      if (publishAfter && !response?.classification?.requires_authorization) await campaignService.publish(response.campaign.uuid);
      setSuccess(response?.classification?.requires_authorization ? "Campanha criada e enviada para fluxo de compliance. Ela não será publicada antes da aprovação." : publishAfter ? "Campanha criada e publicada." : "Campanha criada como rascunho.");
      setForm((current) => ({ ...initialForm, event_id: current.event_id }));
      await load();
    } catch (err) { setError(err?.message || "Não foi possível criar a campanha."); }
    finally { setBusy(""); }
  };

  const act = async (campaign, action) => {
    setBusy(`${action}:${campaign.uuid}`); setError(""); setSuccess("");
    try {
      if (action === "publish") await campaignService.publish(campaign.uuid);
      if (["paused", "ended", "cancelled"].includes(action)) await campaignService.setStatus(campaign.uuid, action);
      setSuccess("Campanha atualizada."); await load();
    } catch (err) { setError(err?.message || "Não foi possível atualizar a campanha."); }
    finally { setBusy(""); }
  };

  const loadMetrics = async (campaign) => {
    setBusy(`metrics:${campaign.uuid}`); setError("");
    try { setMetrics((current) => ({ ...current, [campaign.uuid]: await campaignService.analytics(campaign.uuid) })); }
    catch (err) { setError(err?.message || "Não foi possível carregar as métricas."); }
    finally { setBusy(""); }
  };

  const compliance = async (campaign, status) => {
    const draft = complianceDrafts[campaign.uuid] || {};
    setBusy(`compliance:${campaign.uuid}`); setError("");
    try {
      await campaignService.compliance(campaign.uuid, {
        compliance_status: status,
        authorization_number: draft.authorization_number || campaign.authorization_number || null,
        authorization_metadata: { selection_method: draft.selection_method || campaign.authorization_metadata?.selection_method || "external_official", notes: draft.notes || null },
      });
      setSuccess(status === "review" ? "Documentação enviada para revisão." : `Compliance ${status === "approved" ? "aprovado" : "rejeitado"}.`);
      await load();
    } catch (err) { setError(err?.message || "Não foi possível atualizar o compliance."); }
    finally { setBusy(""); }
  };

  const draw = async (campaign) => {
    setBusy(`draw:${campaign.uuid}`); setError("");
    try {
      const response = await campaignService.draw(campaign.uuid, Number(campaign.configuration?.winner_quantity || 1));
      setSuccess(`${response?.winners?.length || 0} vencedor(es) apurado(s) e registrados com evidência auditável.`);
      await load();
    } catch (err) { setError(err?.message || "Não foi possível realizar a apuração."); }
    finally { setBusy(""); }
  };

  return <div className="cut-app-page"><NavlogComponent />{loading && <ProcessingIndicatorComponent label="Carregando campanhas" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-section-heading mb-4"><div><span className="cut-eyebrow">Marketing e monetização</span><h1>Campanhas e Promoções</h1><p className="text-secondary">Crie engajamento que leve o participante até ingressos, adicionais e novas compras — com atribuição financeira por campanha.</p></div></div>
      {error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body className="p-4 p-lg-5"><Row className="g-3">
        <Col md={6}><Form.Group><Form.Label>Evento</Form.Label><Form.Select value={form.event_id} onChange={(e) => update("event_id", e.target.value)}><option value="">Selecione</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</Form.Select></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Mecânica</Form.Label><Form.Select value={form.type} onChange={(e) => update("type", e.target.value)}><option value="poll">Enquete</option><option value="objective_reward">Benefício objetivo</option><option value="referral">Indicação</option><option value="coupon">Cupom</option><option value="contest">Concurso</option><option value="draw">Sorteio</option><option value="giveaway">Premiação</option><option value="boost">Impulsionamento</option><option value="sponsored">Patrocinada</option></Form.Select></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Objetivo</Form.Label><Form.Select value={form.objective} onChange={(e) => update("objective", e.target.value)}><option value="engagement">Engajamento</option><option value="conversion">Venda</option><option value="acquisition">Aquisição</option><option value="upsell">Adicionais</option><option value="retention">Retenção</option><option value="awareness">Alcance</option></Form.Select></Form.Group></Col>
        <Col md={8}><Form.Group><Form.Label>Título</Form.Label><Form.Control value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Ex.: Vote na música que não pode faltar" /></Form.Group></Col>
        <Col md={4}><Form.Group><Form.Label>Patrocinador</Form.Label><Form.Control value={form.sponsor_name} onChange={(e) => update("sponsor_name", e.target.value)} placeholder="Opcional" /></Form.Group></Col>
        <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} /></Form.Group></Col>
        {["poll", "contest"].includes(form.type) && <Col xs={12}><Form.Group><Form.Label>Opções — uma por linha</Form.Label><Form.Control as="textarea" rows={4} value={form.options} onChange={(e) => update("options", e.target.value)} placeholder={"DJ A\nDJ B\nDJ C"} /></Form.Group></Col>}
        <Col md={3}><Form.Group><Form.Label>Recompensa</Form.Label><Form.Select value={regulatedTypes.has(form.type) ? "winner" : form.reward_mode} disabled={regulatedTypes.has(form.type)} onChange={(e) => update("reward_mode", e.target.value)}><option value="none">Sem benefício</option><option value="all_eligible">Todos que cumprirem</option><option value="winner">Somente vencedor</option></Form.Select></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Tipo de benefício</Form.Label><Form.Select value={form.reward_kind} onChange={(e) => update("reward_kind", e.target.value)}><option value="benefit">Benefício</option><option value="coupon">Cupom</option><option value="discount">Desconto</option><option value="courtesy">Cortesia</option><option value="combo">Combo</option></Form.Select></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Valor de referência</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.reward_value} onChange={(e) => update("reward_value", e.target.value)} /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Benefício exibido</Form.Label><Form.Control value={form.reward_label} onChange={(e) => update("reward_label", e.target.value)} placeholder="Ex.: R$ 5 de desconto" /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Início</Form.Label><Form.Control type="datetime-local" value={form.starts_at} onChange={(e) => update("starts_at", e.target.value)} /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Fim</Form.Label><Form.Control type="datetime-local" value={form.ends_at} onChange={(e) => update("ends_at", e.target.value)} /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Orçamento de impulsionamento</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.boost_budget} onChange={(e) => update("boost_budget", e.target.value)} /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Posicionamento</Form.Label><Form.Select value={form.boost_placement} onChange={(e) => update("boost_placement", e.target.value)}><option value="event_feed">Feed de eventos</option><option value="home_featured">Destaque inicial</option><option value="regional">Destaque regional</option></Form.Select></Form.Group></Col>
        {regulatedTypes.has(form.type) && <Col xs={12}><Alert variant="warning" className="mb-0"><strong>Fluxo regulado.</strong> A campanha nasce em revisão e não pode ser publicada até a aprovação administrativa da documentação.</Alert></Col>}
        <Col xs={12} className="d-flex flex-wrap gap-2"><Button onClick={() => create(false)} disabled={busy === "create"}>Salvar rascunho</Button><Button variant="success" onClick={() => create(true)} disabled={busy === "create" || regulatedTypes.has(form.type)}>Criar e publicar</Button>{selectedEvent && <small className="text-secondary align-self-center">Evento: {selectedEvent.title}</small>}</Col>
      </Row></Card.Body></Card>

      <div className="d-grid gap-3">{campaigns.map((campaign) => {
        const m = metrics[campaign.uuid]; const draft = complianceDrafts[campaign.uuid] || {};
        return <Card key={campaign.uuid} className="cut-panel"><Card.Body className="p-4"><div className="d-flex flex-column flex-lg-row justify-content-between gap-3"><div><div className="d-flex flex-wrap gap-2 mb-2"><Badge bg="dark">{campaign.type}</Badge><Badge bg={campaign.status === "published" ? "success" : campaign.status === "draft" ? "secondary" : "warning"}>{campaign.status}</Badge>{campaign.requires_authorization && <Badge bg={campaign.compliance_status === "approved" ? "success" : "warning"}>compliance: {campaign.compliance_status}</Badge>}</div><h2 className="h4 mb-1">{campaign.title}</h2><p className="text-secondary mb-0">{campaign.event?.title || `Evento #${campaign.event_id}`}</p></div><div className="d-flex flex-wrap gap-2 align-items-start">{campaign.status !== "published" && <Button size="sm" onClick={() => act(campaign, "publish")} disabled={busy}>Publicar</Button>}{campaign.status === "published" && <Button size="sm" variant="outline-warning" onClick={() => act(campaign, "paused")} disabled={busy}>Pausar</Button>}{!["ended", "cancelled"].includes(campaign.status) && <Button size="sm" variant="outline-secondary" onClick={() => act(campaign, "ended")} disabled={busy}>Encerrar</Button>}<Button size="sm" variant="outline-info" onClick={() => loadMetrics(campaign)} disabled={busy}>Resultados</Button></div></div>
          {m && <Table responsive size="sm" className="mt-4 mb-0"><thead><tr><th>Visualizações</th><th>Participantes</th><th>Compras</th><th>Conversão</th><th>GMV</th><th>Receita Peter Tecnet</th><th>Contribuição líquida</th></tr></thead><tbody><tr><td>{m.views}</td><td>{m.participants}</td><td>{m.purchases}</td><td>{m.conversion_participant_to_purchase}%</td><td>{money(m.gmv)}</td><td>{money(m.platform_revenue)}</td><td>{money(m.net_campaign_contribution)}</td></tr></tbody></Table>}
          {campaign.requires_authorization && <div className="border-top border-secondary-subtle mt-4 pt-4"><h3 className="h6">Compliance da promoção</h3><Row className="g-2"><Col md={4}><Form.Control placeholder="Número da autorização" value={draft.authorization_number ?? campaign.authorization_number ?? ""} onChange={(e) => setComplianceDrafts((current) => ({ ...current, [campaign.uuid]: { ...draft, authorization_number: e.target.value } }))} /></Col><Col md={3}><Form.Select value={draft.selection_method ?? campaign.authorization_metadata?.selection_method ?? "external_official"} onChange={(e) => setComplianceDrafts((current) => ({ ...current, [campaign.uuid]: { ...draft, selection_method: e.target.value } }))}><option value="external_official">Apuração oficial externa</option><option value="system_random">Aleatório pelo sistema</option></Form.Select></Col><Col md={5} className="d-flex gap-2"><Button variant="outline-warning" onClick={() => compliance(campaign, "review")} disabled={busy}>Enviar para revisão</Button>{rootAdmin && <><Button variant="success" onClick={() => compliance(campaign, "approved")} disabled={busy}>Aprovar</Button><Button variant="outline-danger" onClick={() => compliance(campaign, "rejected")} disabled={busy}>Rejeitar</Button></>}{campaign.compliance_status === "approved" && campaign.authorization_metadata?.selection_method === "system_random" && <Button variant="primary" onClick={() => draw(campaign)} disabled={busy}>Apurar vencedor</Button>}</Col></Row></div>}
        </Card.Body></Card>;
      })}</div>
      {!loading && !campaigns.length && <Card className="cut-panel"><Card.Body className="p-5 text-center"><i className="fa-solid fa-bullhorn fs-2 mb-3" /><h2 className="h5">Nenhuma campanha criada ainda</h2><p className="text-secondary mb-0">Crie a primeira campanha e acompanhe o impacto em participação, vendas e receita.</p></Card.Body></Card>}
    </Container>
  </div>;
}
