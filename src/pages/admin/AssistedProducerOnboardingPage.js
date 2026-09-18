import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, ProgressBar, Row, Spinner, Table } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import onboardingService from "../../services/OnboardingService";

const emptyForm = {
  producer: { first_name: "", email: "", phone: "" },
  organization: { name: "", cnpj: "", description: "", city: "", uf: "", address: "", instagram_url: "" },
  event: { title: "", description: "", start_date: "", end_date: "", venue: "", city: "", uf: "" },
  send_email: true,
};

const statusLabel = {
  awaiting_owner: "Aguardando produtor",
  awaiting_agreement: "Contrato pendente",
  awaiting_payout: "Recebimentos pendentes",
  ready_to_sell: "Pronto para vender",
};

export default function AssistedProducerOnboardingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const paginator = await onboardingService.admin({ q: query || undefined, per_page: 100 });
      setRows(Array.isArray(paginator?.data) ? paginator.data : []);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar os onboardings.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const change = (section, field, value) => {
    setForm((current) => section
      ? { ...current, [section]: { ...current[section], [field]: value } }
      : { ...current, [field]: value });
  };

  const submit = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        producer: Object.fromEntries(Object.entries(form.producer).filter(([, value]) => String(value).trim() !== "")),
        organization: Object.fromEntries(Object.entries(form.organization).filter(([, value]) => String(value).trim() !== "")),
        event: Object.fromEntries(Object.entries(form.event).filter(([, value]) => String(value).trim() !== "")),
      };
      const response = await onboardingService.initiateAssisted(payload);
      setSuccess(response?.message || "Onboarding criado e entregue ao produtor.");
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err?.message || "Não foi possível criar o onboarding assistido.");
    } finally {
      setWorking(false);
    }
  };

  const resend = async (organizationId) => {
    setResendingId(organizationId);
    setError("");
    setSuccess("");
    try {
      const response = await onboardingService.resendHandoff(organizationId);
      setSuccess(response?.message || "E-mail reenviado.");
      await load();
    } catch (err) {
      setError(err?.message || "Não foi possível reenviar o e-mail.");
    } finally {
      setResendingId(null);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Admin Center · Cutinapp</span><h1>Onboarding assistido de produtores</h1><p>Cadastre a conta, prepare a produção e deixe o primeiro evento pronto. O produtor conclui contrato e recebimentos e assume a operação.</p></div>
        <Button variant="outline-light" onClick={() => navigate("/admin/productions")}>Todas as produções</Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body className="p-4">
        <Form onSubmit={submit}>
          <span className="cut-eyebrow">Novo produtor</span>
          <Row className="g-3 mt-1">
            <Col md={4}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control required value={form.producer.first_name} onChange={(e) => change("producer", "first_name", e.target.value)} /></Form.Group></Col>
            <Col md={5}><Form.Group><Form.Label>E-mail *</Form.Label><Form.Control required type="email" value={form.producer.email} onChange={(e) => change("producer", "email", e.target.value)} /></Form.Group></Col>
            <Col md={3}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control value={form.producer.phone} onChange={(e) => change("producer", "phone", e.target.value)} /></Form.Group></Col>
          </Row>

          <hr className="my-4" />
          <span className="cut-eyebrow">Produção</span>
          <Row className="g-3 mt-1">
            <Col md={6}><Form.Group><Form.Label>Nome da produção *</Form.Label><Form.Control required value={form.organization.name} onChange={(e) => change("organization", "name", e.target.value)} /></Form.Group></Col>
            <Col md={3}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control value={form.organization.cnpj} onChange={(e) => change("organization", "cnpj", e.target.value)} /></Form.Group></Col>
            <Col md={2}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.organization.city} onChange={(e) => change("organization", "city", e.target.value)} /></Form.Group></Col>
            <Col md={1}><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.organization.uf} onChange={(e) => change("organization", "uf", e.target.value.toUpperCase())} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Endereço</Form.Label><Form.Control value={form.organization.address} onChange={(e) => change("organization", "address", e.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control value={form.organization.instagram_url} onChange={(e) => change("organization", "instagram_url", e.target.value)} placeholder="@producao" /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={3} value={form.organization.description} onChange={(e) => change("organization", "description", e.target.value)} /></Form.Group></Col>
          </Row>

          <hr className="my-4" />
          <span className="cut-eyebrow">Primeiro evento</span>
          <Row className="g-3 mt-1">
            <Col md={6}><Form.Group><Form.Label>Título do evento *</Form.Label><Form.Control required value={form.event.title} onChange={(e) => change("event", "title", e.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Local</Form.Label><Form.Control value={form.event.venue} onChange={(e) => change("event", "venue", e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Início *</Form.Label><Form.Control required type="datetime-local" value={form.event.start_date} onChange={(e) => change("event", "start_date", e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Término *</Form.Label><Form.Control required type="datetime-local" value={form.event.end_date} onChange={(e) => change("event", "end_date", e.target.value)} /></Form.Group></Col>
            <Col md={3}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.event.city} onChange={(e) => change("event", "city", e.target.value)} /></Form.Group></Col>
            <Col md={1}><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.event.uf} onChange={(e) => change("event", "uf", e.target.value.toUpperCase())} /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} value={form.event.description} onChange={(e) => change("event", "description", e.target.value)} /></Form.Group></Col>
          </Row>

          <Form.Check className="my-4" checked={form.send_email} onChange={(e) => change(null, "send_email", e.target.checked)} label="Enviar imediatamente o e-mail de entrega com links para contrato, recebimentos e checklist." />
          <Button type="submit" disabled={working}>{working ? "Criando onboarding..." : "Criar produção, evento e enviar ao produtor"}</Button>
        </Form>
      </Card.Body></Card>

      <Card className="cut-panel"><Card.Body className="p-4">
        <div className="d-flex flex-wrap justify-content-between gap-3 align-items-center mb-3">
          <div><span className="cut-eyebrow">Acompanhamento</span><h2 className="cut-section-title mt-2 mb-0">Produtores em onboarding</h2></div>
          <Form.Control style={{ maxWidth: 330 }} type="search" placeholder="Buscar produção ou produtor" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {loading ? <div className="text-center py-4"><Spinner /></div> : <div className="table-responsive">
          <Table variant="dark" hover className="align-middle mb-0">
            <thead><tr><th>Produção</th><th>Produtor</th><th>Progresso</th><th>Status</th><th>Entrega</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.organization.id}>
                <td><strong>{row.organization.name}</strong><small className="d-block text-secondary">{row.organization.city || "Cidade não informada"}</small></td>
                <td>{row.owner.first_name}<small className="d-block text-secondary">{row.owner.email}</small></td>
                <td style={{ minWidth: 150 }}><ProgressBar now={row.progress} label={`${row.progress}%`} /></td>
                <td><Badge bg={row.sales_ready ? "success" : "warning"}>{statusLabel[row.status] || row.status}</Badge></td>
                <td>{row.handoff_sent_at ? new Date(row.handoff_sent_at).toLocaleString("pt-BR") : "Pendente"}</td>
                <td><div className="d-flex gap-2">
                  <Button size="sm" variant="outline-light" onClick={() => void resend(row.organization.id)} disabled={resendingId === row.organization.id}>{resendingId === row.organization.id ? "Enviando..." : "Reenviar e-mail"}</Button>
                </div></td>
              </tr>)}
              {!rows.length && <tr><td colSpan={6} className="text-center text-secondary py-4">Nenhum onboarding assistido encontrado.</td></tr>}
            </tbody>
          </Table>
        </div>}
      </Card.Body></Card>
    </Container>
  </div>;
}
