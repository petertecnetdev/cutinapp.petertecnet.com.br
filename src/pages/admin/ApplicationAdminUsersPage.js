import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import applicationAdminUserService from "../../services/ApplicationAdminUserService";
import appApiClient from "../../services/AppApiClient";
import { loadApplicationAdminContext } from "../../components/ApplicationAdminGate";

const PAGE_SIZE = 12;
const initialForm = { first_name: "", last_name: "", email: "", role: "participant" };

const roleLabel = (role) => ({
  participant: "Usuário", producer: "Produtor", production_manager: "Gerente de produção",
  artist: "Artista", promoter: "Promoter", ticket_manager: "Gerente de ingressos",
}[role] || role || "Usuário");

const statusVariant = (status) => status === "active" ? "success" : status === "blocked" ? "danger" : "warning";
const statusLabel = (status) => ({ active: "Ativo", suspended: "Suspenso", blocked: "Bloqueado" }[status] || status || "Ativo");

export default function ApplicationAdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState(null);
  const [security, setSecurity] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState(null);
  const [impersonationUser, setImpersonationUser] = useState(null);
  const [impersonationReason, setImpersonationReason] = useState("");
  const [impersonationBusy, setImpersonationBusy] = useState(false);
  const [impersonationHistory, setImpersonationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const sentinelRef = useRef(null);
  const requestRef = useRef(0);

  const loadUsers = useCallback(async ({ nextPage = 1, append = false, q = debouncedQuery } = {}) => {
    const requestId = ++requestRef.current;
    append ? setLoadingMore(true) : setLoading(true); setError("");
    try {
      const response = await applicationAdminUserService.list({ q: q || undefined, page: nextPage, per_page: PAGE_SIZE });
      if (requestId !== requestRef.current) return;
      const paginator = response?.data || {};
      const rows = Array.isArray(paginator?.data) ? paginator.data : [];
      setUsers((current) => append ? [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))] : rows);
      setPage(Number(paginator.current_page || nextPage)); setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os usuários da Cutinapp.");
    } finally { if (requestId === requestRef.current) { setLoading(false); setLoadingMore(false); } }
  }, [debouncedQuery]);

  useEffect(() => {
    let active = true;
    loadApplicationAdminContext()
      .then((context) => {
        if (active) {
          setIsOwner(Boolean(context?.is_owner));
          setOwnerUserId(Number(context?.owner_user_id || 0) || null);
        }
      })
      .catch(() => {
        if (active) setIsOwner(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { setUsers([]); setPage(1); setLastPage(1); void loadUsers({ nextPage: 1, append: false, q: debouncedQuery }); }, [debouncedQuery, loadUsers]);
  useEffect(() => {
    const node = sentinelRef.current; if (!node || loading || loadingMore || page >= lastPage) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting && page < lastPage) void loadUsers({ nextPage: page + 1, append: true }); }, { rootMargin: "320px 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, [lastPage, loadUsers, loading, loadingMore, page]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await applicationAdminUserService.create(form);
      setSuccess(response?.message || "Usuário cadastrado com sucesso.");
      setForm(initialForm);
      setShowCreate(false);
      await loadUsers({ nextPage: 1, append: false });
    } catch (err) {
      const validation = err?.response?.data?.errors;
      const validationMessage = validation ? Object.values(validation).flat().join(" ") : "";
      setError(validationMessage || err?.response?.data?.message || err?.message || "Não foi possível cadastrar o usuário.");
    } finally {
      setBusy(false);
    }
  };

  const openSecurity = async (user) => {
    setSelected(user); setSecurity(null); setSecurityLoading(true); setError("");
    try { const response = await appApiClient.get(`/admin/users/${user.id}/security`); setSecurity(response.data?.data || null); }
    catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível carregar a segurança deste usuário."); setSelected(null); }
    finally { setSecurityLoading(false); }
  };

  const changeAccess = async (status) => {
    if (!selected) return; setBusy(true); setError(""); setSuccess("");
    try { const response = await appApiClient.put(`/admin/users/${selected.id}/access`, { status }); setSecurity(response.data?.data || null); setSuccess(`Acesso ${statusLabel(status).toLowerCase()} com sucesso.`); await loadUsers({ nextPage: 1, append: false }); }
    catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível alterar o acesso."); }
    finally { setBusy(false); }
  };

  const revokeSessions = async () => {
    if (!selected) return; setBusy(true); setError(""); setSuccess("");
    try { await appApiClient.post(`/admin/users/${selected.id}/revoke-sessions`); const response = await appApiClient.get(`/admin/users/${selected.id}/security`); setSecurity(response.data?.data || null); setSuccess("Todas as sessões anteriores foram revogadas."); }
    catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível revogar as sessões."); }
    finally { setBusy(false); }
  };

  const loadImpersonationHistory = useCallback(async () => {
    if (!isOwner) return;
    setHistoryLoading(true);
    try {
      const response = await applicationAdminUserService.impersonationHistory({ per_page: 10 });
      setImpersonationHistory(Array.isArray(response?.sessions) ? response.sessions : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o histórico de acessos temporários.");
    } finally {
      setHistoryLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (isOwner) void loadImpersonationHistory();
  }, [isOwner, loadImpersonationHistory]);

  const beginImpersonation = async (event) => {
    event.preventDefault();
    if (!impersonationUser || impersonationReason.trim().length < 3) return;

    const targetWindow = window.open("", "_blank");
    if (targetWindow) {
      targetWindow.document.title = "Abrindo acesso temporário · Cutinapp";
      targetWindow.document.body.innerHTML = '<div style="font-family:system-ui;padding:32px;background:#09090b;color:#fff;min-height:100vh"><strong>Abrindo acesso temporário…</strong><p>Validando a sessão administrativa da Cutinapp.</p></div>';
    }

    setImpersonationBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await applicationAdminUserService.impersonate(impersonationUser.id, impersonationReason);
      const handoffUrl = response?.handoff_url;
      if (!handoffUrl) throw new Error("A API não retornou a URL do acesso temporário.");

      setSuccess(`Acesso temporário criado para ${impersonationUser.email}. A sessão expira automaticamente e fica registrada na auditoria.`);
      setImpersonationUser(null);
      setImpersonationReason("");
      await loadImpersonationHistory();

      if (targetWindow) {
        targetWindow.location.replace(handoffUrl);
      } else {
        window.location.assign(handoffUrl);
      }
    } catch (err) {
      if (targetWindow && !targetWindow.closed) targetWindow.close();
      const validation = err?.response?.data?.errors;
      const validationMessage = validation ? Object.values(validation).flat().join(" ") : "";
      setError(validationMessage || err?.response?.data?.message || err?.message || "Não foi possível entrar como este usuário.");
    } finally {
      setImpersonationBusy(false);
    }
  };

  const forceEndImpersonation = async (sessionId) => {
    setImpersonationBusy(true);
    setError("");
    try {
      const response = await applicationAdminUserService.endImpersonation(sessionId);
      setSuccess(response?.message || "Acesso temporário encerrado.");
      await loadImpersonationHistory();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível encerrar o acesso temporário.");
    } finally {
      setImpersonationBusy(false);
    }
  };

  const formatImpersonationDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
  };

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5">
    <div className="cut-page-heading"><div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Usuários</h1><p>Todos os usuários da aplicação, com controle de acesso e sessões.</p></div><Button onClick={() => setShowCreate(true)}><i className="fa-solid fa-user-plus me-2" />Cadastrar usuário</Button></div>
    {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}{success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
    <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, e-mail ou usuário" /></Card.Body></Card>
    {isOwner && <Card className="cut-panel mb-4"><Card.Body><div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3"><div><span className="cut-eyebrow">Acesso administrativo temporário</span><h2 className="cut-section-title mt-2 mb-1">Histórico de impersonação</h2><small className="text-secondary">Todas as entradas como usuário feitas pelo Owner na Cutinapp ficam registradas aqui.</small></div><Button variant="outline-light" size="sm" disabled={historyLoading} onClick={() => loadImpersonationHistory()}>{historyLoading ? <Spinner size="sm" /> : <><i className="fa-solid fa-rotate me-2" />Atualizar</>}</Button></div>{historyLoading && !impersonationHistory.length ? <div className="text-center py-3"><Spinner size="sm" /></div> : impersonationHistory.length ? <div className="d-grid gap-2">{impersonationHistory.map((session) => <div key={session.id} className="border rounded-3 p-3 d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-center"><div><div className="fw-semibold">{session.effective_user?.name || session.effective_user?.email || `Usuário #${session.id}`}</div><small className="text-secondary">{session.effective_user?.email || "—"} · {session.reason || "Sem motivo informado"}</small><div className="small text-secondary mt-1">Início: {formatImpersonationDate(session.started_at)} · Expira: {formatImpersonationDate(session.expires_at)}</div></div><div className="d-flex align-items-center gap-2"><Badge bg={session.active ? "warning" : "secondary"} text={session.active ? "dark" : undefined}>{session.active ? "Ativa" : session.ended_at ? "Encerrada" : "Expirada"}</Badge>{session.active && <Button size="sm" variant="outline-danger" disabled={impersonationBusy} onClick={() => forceEndImpersonation(session.id)}>Encerrar</Button>}</div></div>)}</div> : <Alert variant="secondary" className="mb-0">Nenhum acesso temporário registrado na Cutinapp.</Alert>}</Card.Body></Card>}

    {loading && !users.length ? <div className="text-center py-5"><Spinner /></div> : <><Row className="g-3">{users.map((user) => { const membership = (user.applications || [])[0]?.pivot; return <Col md={6} xl={4} key={user.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column"><div className="d-flex justify-content-between gap-3"><div><span className="cut-eyebrow">#{user.id}</span><h2 className="cut-section-title mt-2">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.user_name}</h2></div><Badge bg={statusVariant(membership?.status || "active")}>{statusLabel(membership?.status || "active")}</Badge></div><p className="mb-1">{user.email}</p><small className="text-secondary">{roleLabel(membership?.role)} · @{user.user_name || "sem-usuario"}</small><div className="d-grid gap-2 mt-3">{isOwner && Number(user.id) !== ownerUserId && <Button variant="light" onClick={() => { setImpersonationUser(user); setImpersonationReason(""); }}><i className="fa-solid fa-user-secret me-2" />Entrar como usuário</Button>}<Button variant="outline-light" onClick={() => openSecurity(user)}><i className="fa-solid fa-shield-halved me-2" />Segurança e acesso</Button></div></Card.Body></Card></Col>; })}{!users.length && !error && <Col><Alert variant="secondary">Nenhum usuário encontrado.</Alert></Col>}</Row><div ref={sentinelRef} className="text-center py-4">{loadingMore && <Spinner size="sm" />}{!loadingMore && users.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div></>}
  </Container>

  <Modal show={Boolean(impersonationUser)} onHide={() => !impersonationBusy && setImpersonationUser(null)} centered>
    <Form onSubmit={beginImpersonation}>
      <Modal.Header closeButton={!impersonationBusy}><Modal.Title>Entrar como usuário</Modal.Title></Modal.Header>
      <Modal.Body>
        <Alert variant="warning"><strong>Modo administrativo temporário.</strong> Você continuará identificado como Owner na auditoria. Senha, Google SSO e sessões normais do usuário não serão alterados.</Alert>
        <div className="mb-3"><small className="text-secondary">Usuário</small><div className="fw-semibold">{[impersonationUser?.first_name, impersonationUser?.last_name].filter(Boolean).join(" ") || impersonationUser?.user_name || impersonationUser?.email}</div><div className="text-secondary small">{impersonationUser?.email}</div></div>
        <Form.Group>
          <Form.Label>Motivo do acesso</Form.Label>
          <Form.Control as="textarea" rows={3} minLength={3} maxLength={500} required autoFocus value={impersonationReason} onChange={(event) => setImpersonationReason(event.target.value)} placeholder="Ex.: configurar produção, validar cadastro ou prestar suporte ao cliente" />
          <Form.Text>O motivo ficará registrado no histórico de auditoria.</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={impersonationBusy} onClick={() => setImpersonationUser(null)}>Cancelar</Button><Button type="submit" variant="danger" disabled={impersonationBusy || impersonationReason.trim().length < 3}>{impersonationBusy ? <><Spinner size="sm" className="me-2" />Abrindo…</> : <><i className="fa-solid fa-user-secret me-2" />Entrar como usuário</>}</Button></Modal.Footer>
    </Form>
  </Modal>

  <Modal show={showCreate} onHide={() => !busy && setShowCreate(false)} centered><Form onSubmit={submit}><Modal.Header closeButton={!busy}><Modal.Title>Cadastrar usuário</Modal.Title></Modal.Header><Modal.Body><Row className="g-3"><Col md={6}><Form.Label>Nome</Form.Label><Form.Control required value={form.first_name} onChange={(e) => setForm((c) => ({ ...c, first_name: e.target.value }))} /></Col><Col md={6}><Form.Label>Sobrenome</Form.Label><Form.Control value={form.last_name} onChange={(e) => setForm((c) => ({ ...c, last_name: e.target.value }))} /></Col><Col xs={12}><Form.Label>E-mail</Form.Label><Form.Control required type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /></Col><Col xs={12}><Form.Label>Papel inicial</Form.Label><Form.Select value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value }))}><option value="participant">Usuário</option><option value="producer">Produtor</option><option value="production_manager">Gerente de produção</option><option value="artist">Artista</option><option value="promoter">Promoter</option><option value="ticket_manager">Gerente de ingressos</option></Form.Select></Col></Row></Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>Cadastrar</Button></Modal.Footer></Form></Modal>

  <Modal show={Boolean(selected)} onHide={() => !busy && setSelected(null)} centered><Modal.Header closeButton={!busy}><Modal.Title>Segurança do usuário</Modal.Title></Modal.Header><Modal.Body>{securityLoading ? <div className="text-center py-4"><Spinner /></div> : security && <><div className="d-flex justify-content-between gap-3 align-items-start mb-3"><div><strong>{security.user?.name || selected?.email}</strong><div className="text-secondary small">{security.user?.email}</div></div>{security.is_owner ? <Badge bg="danger">OWNER</Badge> : <Badge bg={statusVariant(security.membership?.status)}>{statusLabel(security.membership?.status)}</Badge>}</div><Card className="cut-panel mb-3"><Card.Body><small className="text-secondary">Versão de sessão</small><div className="fs-4 fw-bold">{security.session_version || 1}</div><small className="text-secondary">Revogar sessões invalida tokens emitidos anteriormente.</small></Card.Body></Card>{security.is_owner ? <Alert variant="warning">A identidade Owner é imutável e não pode ser suspensa nem bloqueada.</Alert> : <div className="d-grid gap-2"><Button variant="outline-success" disabled={busy || security.membership?.status === "active"} onClick={() => changeAccess("active")}>Ativar acesso</Button><Button variant="outline-warning" disabled={busy || security.membership?.status === "suspended"} onClick={() => changeAccess("suspended")}>Suspender</Button><Button variant="outline-danger" disabled={busy || security.membership?.status === "blocked"} onClick={() => changeAccess("blocked")}>Bloquear</Button></div>}<hr /><Button className="w-100" variant="outline-danger" disabled={busy} onClick={revokeSessions}>Revogar todas as sessões</Button></>}</Modal.Body></Modal>
  </div>;
}
