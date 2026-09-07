import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const initialForm = { first_name: "", last_name: "", email: "", role: "participant" };

const roleLabel = (role) => ({
  participant: "Usuário",
  producer: "Produtor",
  production_manager: "Gerente de produção",
  artist: "Artista",
  promoter: "Promoter",
  ticket_manager: "Gerente de ingressos",
}[role] || role || "Usuário");

export default function ApplicationAdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async (q = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await appApiClient.get("/admin/users", { params: { q: q || undefined, per_page: 100 } });
      setUsers(response.data?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os usuários da Cutinapp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return users;
    return users.filter((user) => `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""} ${user.user_name || ""}`.toLocaleLowerCase("pt-BR").includes(needle));
  }, [query, users]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await appApiClient.post("/admin/users", form);
      setSuccess(response.data?.message || "Usuário cadastrado com sucesso.");
      setForm(initialForm);
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      const validation = err?.response?.data?.errors;
      const validationMessage = validation ? Object.values(validation).flat().join(" ") : "";
      setError(validationMessage || err?.response?.data?.message || err?.message || "Não foi possível cadastrar o usuário.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Cutinapp Admin Center</span><h1>Usuários</h1><p>Cadastre pessoas na Cutinapp e defina o papel inicial que organiza as áreas do aplicativo.</p></div>
        <Button onClick={() => setShowCreate(true)}><i className="fa-solid fa-user-plus me-2" />Cadastrar usuário</Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, e-mail ou usuário" /></Card.Body></Card>

      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando usuários...</p></div> : <Row className="g-3">
        {filtered.map((user) => {
          const membership = (user.applications || [])[0]?.pivot;
          return <Col md={6} xl={4} key={user.id}><Card className="cut-panel h-100"><Card.Body>
            <div className="d-flex justify-content-between gap-3"><div><span className="cut-eyebrow">#{user.id}</span><h2 className="cut-section-title mt-2">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.user_name}</h2></div><Badge bg="secondary">{roleLabel(membership?.role)}</Badge></div>
            <p className="mb-1">{user.email}</p>
            <small className="text-secondary">@{user.user_name || "sem-usuario"}{user.city ? ` · ${user.city}${user.uf ? `/${user.uf}` : ""}` : ""}</small>
          </Card.Body></Card></Col>;
        })}
        {!filtered.length && <Col><Alert variant="secondary">Nenhum usuário encontrado.</Alert></Col>}
      </Row>}
    </Container>

    <Modal show={showCreate} onHide={() => !busy && setShowCreate(false)} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!busy}><Modal.Title>Cadastrar usuário na Cutinapp</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}><Form.Group><Form.Label>Nome</Form.Label><Form.Control required value={form.first_name} onChange={(e) => setForm((current) => ({ ...current, first_name: e.target.value }))} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Sobrenome</Form.Label><Form.Control value={form.last_name} onChange={(e) => setForm((current) => ({ ...current, last_name: e.target.value }))} /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>E-mail</Form.Label><Form.Control required type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Papel inicial</Form.Label><Form.Select value={form.role} onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}><option value="participant">Usuário</option><option value="producer">Produtor</option><option value="production_manager">Gerente de produção</option><option value="artist">Artista</option><option value="promoter">Promoter</option><option value="ticket_manager">Gerente de ingressos</option></Form.Select><Form.Text>O papel define quais áreas operacionais aparecem no menu. O Admin Center continua exclusivo da Peter Tecnet.</Form.Text></Form.Group></Col>
          </Row>
        </Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner size="sm" className="me-2" />Salvando...</> : "Cadastrar"}</Button></Modal.Footer>
      </Form>
    </Modal>
  </div>;
}
