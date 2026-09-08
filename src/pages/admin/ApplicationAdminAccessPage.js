import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";
import { clearApplicationAdminContextCache } from "../../components/ApplicationAdminGate";

const permissionLabels = {
  "dashboard.view": "Dashboard",
  "events.view": "Ver eventos",
  "events.manage": "Gerenciar eventos",
  "establishments.view": "Ver produções",
  "establishments.manage": "Gerenciar produções",
  "tickets.view": "Ver ingressos",
  "tickets.manage": "Gerenciar ingressos",
  "checkin.view": "Ver check-ins",
  "checkin.manage": "Gerenciar check-ins",
  "finance.view": "Ver financeiro",
  "finance.refund": "Reembolsar pagamentos",
  "users.view": "Ver usuários",
  "users.manage": "Gerenciar usuários",
  "users.sessions.manage": "Revogar sessões",
  "moderation.view": "Ver moderação",
  "moderation.manage": "Moderar",
  "support.view": "Ver suporte",
  "support.manage": "Gerenciar suporte",
  "security.view": "Ver segurança",
  "security.manage": "Gerenciar segurança",
  "operations.view": "Ver operações",
  "audit.view": "Ver auditoria",
};

export default function ApplicationAdminAccessPage() {
  const [context, setContext] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", description: "", permissions: [] });
  const [grant, setGrant] = useState({ email: "", profile_id: "" });

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [contextRes, permissionsRes, profilesRes, assignmentsRes] = await Promise.all([
        appApiClient.get("/admin/context"),
        appApiClient.get("/admin/permissions"),
        appApiClient.get("/admin/profiles"),
        appApiClient.get("/admin/assignments"),
      ]);
      setContext(contextRes.data?.data || null);
      setCatalog(permissionsRes.data?.data?.permissions || []);
      setProfiles(profilesRes.data?.data || []);
      setAssignments(assignmentsRes.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os privilégios administrativos.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const groupedAssignments = useMemo(() => assignments.filter((item) => item.status === "active" && !item.revoked_at), [assignments]);

  const togglePermission = (permission) => setProfileForm((current) => ({
    ...current,
    permissions: current.permissions.includes(permission)
      ? current.permissions.filter((value) => value !== permission)
      : [...current.permissions, permission],
  }));

  const createProfile = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      await appApiClient.post("/admin/profiles", profileForm);
      setShowProfile(false); setProfileForm({ name: "", description: "", permissions: [] });
      setSuccess("Perfil administrativo criado."); await load();
    } catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível criar o perfil."); }
    finally { setBusy(false); }
  };

  const assign = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      await appApiClient.post("/admin/assignments", { email: grant.email, profile_id: Number(grant.profile_id) });
      setGrant({ email: "", profile_id: "" }); clearApplicationAdminContextCache();
      setSuccess("Privilégios concedidos."); await load();
    } catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível conceder o acesso."); }
    finally { setBusy(false); }
  };

  const revoke = async (assignment) => {
    setBusy(true); setError(""); setSuccess("");
    try {
      await appApiClient.delete(`/admin/assignments/${assignment.id}`);
      clearApplicationAdminContextCache(); setSuccess("Acesso administrativo revogado."); await load();
    } catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível revogar o acesso."); }
    finally { setBusy(false); }
  };

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5">
    <div className="cut-page-heading align-items-start"><div><span className="cut-eyebrow">Cutinapp Owner · autoridade</span><h1>Perfis e privilégios</h1><p>Somente o Owner cria perfis administrativos e concede ou revoga privilégios.</p></div><Badge bg="danger">{context?.is_owner ? "OWNER" : "RESTRITO"}</Badge></div>
    {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
    {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
    {loading ? <div className="text-center py-5"><Spinner /></div> : <>
      <Row className="g-3 mb-4">
        <Col lg={5}><Card className="cut-panel h-100"><Card.Body><h2 className="cut-section-title">Conceder acesso</h2><Form onSubmit={assign} className="d-grid gap-3 mt-3"><Form.Group><Form.Label>E-mail do usuário</Form.Label><Form.Control required type="email" value={grant.email} onChange={(e) => setGrant((c) => ({ ...c, email: e.target.value }))} /></Form.Group><Form.Group><Form.Label>Perfil</Form.Label><Form.Select required value={grant.profile_id} onChange={(e) => setGrant((c) => ({ ...c, profile_id: e.target.value }))}><option value="">Selecione</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</Form.Select></Form.Group><Button type="submit" disabled={busy || !profiles.length}>Conceder privilégios</Button></Form></Card.Body></Card></Col>
        <Col lg={7}><Card className="cut-panel h-100"><Card.Body><div className="d-flex justify-content-between gap-3 align-items-center"><div><h2 className="cut-section-title mb-1">Perfis administrativos</h2><small className="text-secondary">Permissões granulares e cumulativas.</small></div><Button onClick={() => setShowProfile(true)}>Novo perfil</Button></div><div className="d-grid gap-2 mt-3">{profiles.map((profile) => <div key={profile.id} className="border rounded p-3"><div className="d-flex justify-content-between"><strong>{profile.name}</strong><Badge bg="secondary">{profile.active_assignments_count || 0} ativo(s)</Badge></div><small className="text-secondary">{profile.description || "Sem descrição"}</small><div className="d-flex flex-wrap gap-1 mt-2">{(profile.permissions || []).map((p) => <Badge bg="dark" key={p}>{permissionLabels[p] || p}</Badge>)}</div></div>)}</div></Card.Body></Card></Col>
      </Row>
      <Card className="cut-panel"><Card.Body><h2 className="cut-section-title">Administradores delegados</h2><Row className="g-3 mt-1">{groupedAssignments.map((assignment) => <Col md={6} xl={4} key={assignment.id}><div className="border rounded p-3 h-100"><strong>{[assignment.user?.first_name, assignment.user?.last_name].filter(Boolean).join(" ") || assignment.user?.email}</strong><div className="text-secondary small">{assignment.user?.email}</div><Badge className="mt-2" bg="info" text="dark">{assignment.profile?.name}</Badge><div className="mt-3"><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => revoke(assignment)}>Revogar acesso</Button></div></div></Col>)}{!groupedAssignments.length && <Col><Alert variant="secondary" className="mb-0">Nenhum administrador delegado ativo.</Alert></Col>}</Row></Card.Body></Card>
    </>}
  </Container>
  <Modal show={showProfile} onHide={() => !busy && setShowProfile(false)} centered size="lg"><Form onSubmit={createProfile}><Modal.Header closeButton={!busy}><Modal.Title>Novo perfil administrativo</Modal.Title></Modal.Header><Modal.Body><Form.Group className="mb-3"><Form.Label>Nome</Form.Label><Form.Control required value={profileForm.name} onChange={(e) => setProfileForm((c) => ({ ...c, name: e.target.value }))} /></Form.Group><Form.Group className="mb-3"><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={2} value={profileForm.description} onChange={(e) => setProfileForm((c) => ({ ...c, description: e.target.value }))} /></Form.Group><Form.Label>Permissões</Form.Label><Row className="g-2">{catalog.map((permission) => <Col md={6} key={permission}><Form.Check type="switch" label={permissionLabels[permission] || permission} checked={profileForm.permissions.includes(permission)} onChange={() => togglePermission(permission)} /></Col>)}</Row></Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setShowProfile(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !profileForm.permissions.length}>Criar perfil</Button></Modal.Footer></Form></Modal>
  </div>;
}
