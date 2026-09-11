import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner, Table } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";

const emptyCampaign = {
  target_type: "event",
  target_id: "",
  production_id: "",
  label: "",
  keywords: "",
  city: "",
  uf: "",
  priority: 0,
  bid_cents: 0,
  budget_cents: "",
  status: "draft",
  starts_at: "",
  ends_at: "",
};

const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);

export default function AdminSearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [error, setError] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [form, setForm] = useState(emptyCampaign);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsResponse, campaignResponse] = await Promise.all([
        cutinappService.adminSearchAnalytics({ days }),
        cutinappService.adminSearchCampaigns(),
      ]);
      setAnalytics(analyticsResponse || null);
      setCampaigns(campaignResponse?.campaigns || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar a inteligência de busca.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const stats = useMemo(() => analytics ? [
    ["Buscas", analytics.total_searches || 0, "fa-solid fa-magnifying-glass"],
    ["CTR", `${Number(analytics.ctr || 0).toFixed(1)}%`, "fa-solid fa-arrow-pointer"],
    ["Sem resultado", `${Number(analytics.zero_result_rate || 0).toFixed(1)}%`, "fa-regular fa-face-meh"],
    ["Conversão", `${Number(analytics.conversion_rate || 0).toFixed(1)}%`, "fa-solid fa-bullseye"],
    ["Usuários", analytics.unique_users || 0, "fa-solid fa-users"],
    ["Conversões", analytics.conversions || 0, "fa-solid fa-bolt"],
    ["Até o clique", analytics.avg_seconds_to_click ? `${Number(analytics.avg_seconds_to_click).toFixed(0)}s` : "—", "fa-regular fa-clock"],
  ] : [], [analytics]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const createCampaign = async () => {
    setCampaignLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        target_id: Number(form.target_id),
        production_id: form.production_id ? Number(form.production_id) : undefined,
        priority: Number(form.priority || 0),
        bid_cents: Number(form.bid_cents || 0),
        budget_cents: form.budget_cents !== "" ? Number(form.budget_cents) : undefined,
        keywords: String(form.keywords || "").split(",").map((value) => value.trim()).filter(Boolean),
        starts_at: form.starts_at || undefined,
        ends_at: form.ends_at || undefined,
      };
      const response = await cutinappService.createAdminSearchCampaign(payload);
      if (response?.campaign) setCampaigns((current) => [response.campaign, ...current]);
      setCampaignOpen(false);
      setForm(emptyCampaign);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível criar a campanha.");
    } finally {
      setCampaignLoading(false);
    }
  };

  const toggleCampaign = async (campaign) => {
    const next = campaign.status === "active" ? "paused" : "active";
    try {
      const response = await cutinappService.updateAdminSearchCampaign(campaign.id, { status: next });
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? response.campaign : item));
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível atualizar a campanha.");
    }
  };

  const deleteCampaign = async (campaign) => {
    if (!window.confirm(`Excluir a campanha “${campaign.label || campaign.id}”?`)) return;
    try {
      await cutinappService.deleteAdminSearchCampaign(campaign.id);
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível excluir a campanha.");
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div>
          <span className="cut-eyebrow">Inteligência de descoberta</span>
          <h1>Busca & demanda</h1>
          <p>Entenda o que as pessoas procuram, onde a demanda não está sendo atendida, o que gera clique e o que vira receita, follow ou Direct.</p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <Form.Select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Período">
            <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>180 dias</option><option value={365}>365 dias</option>
          </Form.Select>
          <Button onClick={() => setCampaignOpen(true)}><i className="fa-solid fa-bullhorn me-2" />Nova campanha</Button>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando inteligência de busca…</p></div> : <>
        <Row className="g-3 mb-4">
          {stats.map(([label, value, icon]) => <Col xs={6} lg={4} xl={2} key={label}><Card className="cut-panel h-100"><Card.Body><div className="d-flex justify-content-between gap-2"><span className="cut-eyebrow">{label}</span><i className={icon} /></div><div className="display-6 fw-bold mt-3">{value}</div></Card.Body></Card></Col>)}
        </Row>

        <Row className="g-4 mb-4">
          <Col lg={6}><Card className="cut-panel h-100"><Card.Body><div className="d-flex justify-content-between mb-3"><div><span className="cut-eyebrow">Intenção</span><h2 className="h4 mt-2">Termos mais pesquisados</h2></div></div>
            <div className="d-grid gap-2">{(analytics?.top_terms || []).slice(0, 15).map((term, index) => <div key={term.normalized_query} className="d-flex justify-content-between align-items-center gap-3 border-bottom border-secondary border-opacity-25 pb-2"><span><strong className="me-2">{index + 1}.</strong>{term.query}</span><Badge bg="secondary">{term.searches} buscas</Badge></div>)}</div>
          </Card.Body></Card></Col>
          <Col lg={6}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">Oportunidade</span><h2 className="h4 mt-2">Buscas sem resultado</h2><p className="text-secondary small">Estes termos são demanda explícita que a Cutinapp ainda não está atendendo bem.</p>
            <div className="d-grid gap-2">{(analytics?.zero_terms || []).slice(0, 15).map((term) => <div key={term.normalized_query} className="d-flex justify-content-between align-items-center gap-3 border-bottom border-secondary border-opacity-25 pb-2"><span>{term.query}</span><Badge bg="warning" text="dark">{term.searches}x</Badge></div>)}</div>
          </Card.Body></Card></Col>
        </Row>

        <Row className="g-4 mb-4">
          <Col lg={6}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">Geografia</span><h2 className="h4 mt-2">Demanda por cidade</h2>
            <div className="d-grid gap-2">{(analytics?.cities || []).slice(0, 15).map((city) => <div key={`${city.city}-${city.uf}`} className="d-flex justify-content-between border-bottom border-secondary border-opacity-25 pb-2"><span>{city.city}{city.uf ? ` - ${city.uf}` : ""}</span><strong>{city.searches}</strong></div>)}</div>
          </Card.Body></Card></Col>
          <Col lg={6}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">Resultados</span><h2 className="h4 mt-2">Mais clicados</h2>
            <div className="table-responsive"><Table variant="dark" hover size="sm" className="align-middle"><thead><tr><th>Tipo</th><th>ID</th><th>Cliques</th><th>Conversões</th></tr></thead><tbody>{(analytics?.top_targets || []).slice(0, 20).map((target) => <tr key={`${target.target_type}:${target.target_id}`}><td>{target.target_type}</td><td>#{target.target_id}</td><td>{target.clicks}</td><td>{target.conversions}</td></tr>)}</tbody></Table></div>
          </Card.Body></Card></Col>
        </Row>

        {(analytics?.category_signals || []).length > 0 && <Card className="cut-panel mb-4"><Card.Body><span className="cut-eyebrow">Preferências</span><h2 className="h4 mt-2">Sinais por gênero/categoria</h2><div className="d-flex flex-wrap gap-2 mt-3">{analytics.category_signals.map((signal) => <Badge bg="secondary" key={signal.label} className="px-3 py-2">{signal.label} · {signal.searches}</Badge>)}</div></Card.Body></Card>}

        <Card className="cut-panel"><Card.Body>
          <div className="d-flex flex-wrap justify-content-between gap-3 align-items-center mb-3"><div><span className="cut-eyebrow">Monetização</span><h2 className="h4 mt-2 mb-1">Campanhas patrocinadas</h2><small className="text-secondary">Resultados pagos sempre aparecem identificados como Patrocinado e separados do ranking orgânico.</small></div><Button variant="outline-light" onClick={() => setCampaignOpen(true)}>Criar campanha</Button></div>
          <div className="table-responsive"><Table variant="dark" hover className="align-middle"><thead><tr><th>Campanha</th><th>Alvo</th><th>Palavras</th><th>Status</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Orçamento</th><th></th></tr></thead><tbody>
            {campaigns.map((campaign) => {
              const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
              return <tr key={campaign.id}><td><strong>{campaign.label || `Campanha #${campaign.id}`}</strong><small className="d-block text-secondary">{campaign.city || "Todas as cidades"} {campaign.uf || ""}</small></td><td>{campaign.target_type} #{campaign.target_id}</td><td>{(campaign.keywords || []).join(", ") || "Todos"}</td><td><Badge bg={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "secondary"}>{campaign.status}</Badge></td><td>{campaign.impressions}</td><td>{campaign.clicks}</td><td>{ctr.toFixed(1)}%</td><td>{campaign.budget_cents == null ? "Sem limite" : money(campaign.budget_cents)}</td><td><div className="d-flex gap-2 justify-content-end"><Button size="sm" variant="outline-light" onClick={() => toggleCampaign(campaign)}>{campaign.status === "active" ? "Pausar" : "Ativar"}</Button><Button size="sm" variant="outline-danger" onClick={() => deleteCampaign(campaign)}><i className="fa-solid fa-trash" /></Button></div></td></tr>;
            })}
            {!campaigns.length && <tr><td colSpan={9} className="text-center text-secondary py-4">Nenhuma campanha criada.</td></tr>}
          </tbody></Table></div>
        </Card.Body></Card>
      </>}

      <Modal show={campaignOpen} onHide={() => setCampaignOpen(false)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>Nova campanha de busca</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={8}><Form.Group><Form.Label>Nome da campanha</Form.Label><Form.Control value={form.label} onChange={(event) => update("label", event.target.value)} placeholder="Ex.: Sextou Goiânia" /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Status</Form.Label><Form.Select value={form.status} onChange={(event) => update("status", event.target.value)}><option value="draft">Rascunho</option><option value="active">Ativa</option><option value="paused">Pausada</option></Form.Select></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Tipo de alvo</Form.Label><Form.Select value={form.target_type} onChange={(event) => update("target_type", event.target.value)}><option value="event">Evento</option><option value="production">Produção</option><option value="artist">Artista</option><option value="user">Pessoa</option></Form.Select></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>ID do alvo</Form.Label><Form.Control type="number" value={form.target_id} onChange={(event) => update("target_id", event.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>ID da produção</Form.Label><Form.Control type="number" value={form.production_id} onChange={(event) => update("production_id", event.target.value)} /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Palavras-chave</Form.Label><Form.Control value={form.keywords} onChange={(event) => update("keywords", event.target.value)} placeholder="sertanejo, sexta, marista, goiania" /><Form.Text>Separe por vírgulas.</Form.Text></Form.Group></Col>
            <Col md={5}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.city} onChange={(event) => update("city", event.target.value)} /></Form.Group></Col>
            <Col md={2}><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.uf} onChange={(event) => update("uf", event.target.value.toUpperCase())} /></Form.Group></Col>
            <Col md={5}><Form.Group><Form.Label>Prioridade</Form.Label><Form.Control type="number" min="0" max="1000" value={form.priority} onChange={(event) => update("priority", event.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Orçamento (centavos)</Form.Label><Form.Control type="number" min="0" value={form.budget_cents} onChange={(event) => update("budget_cents", event.target.value)} placeholder="Ex.: 5000 = R$ 50" /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Lance/valor de prioridade (centavos)</Form.Label><Form.Control type="number" min="0" value={form.bid_cents} onChange={(event) => update("bid_cents", event.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Início</Form.Label><Form.Control type="datetime-local" value={form.starts_at} onChange={(event) => update("starts_at", event.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Fim</Form.Label><Form.Control type="datetime-local" value={form.ends_at} onChange={(event) => update("ends_at", event.target.value)} /></Form.Group></Col>
          </Row>
        </Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={() => setCampaignOpen(false)}>Cancelar</Button><Button onClick={createCampaign} disabled={campaignLoading || !form.target_id || !form.keywords.trim()}>{campaignLoading ? <Spinner size="sm" /> : "Criar campanha"}</Button></Modal.Footer>
      </Modal>
    </Container>
  </div>;
}
