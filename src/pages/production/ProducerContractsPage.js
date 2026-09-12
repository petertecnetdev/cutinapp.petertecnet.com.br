import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";
import { showImportantAlert } from "../../utils/sweetAlert";

export default function ProducerContractsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requestedProductionId = params.get("productionId") || "";
  const requestedReturnTo = params.get("returnTo") || "";
  const returnTo = requestedReturnTo.startsWith("/event/create") ? requestedReturnTo : "";
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState("");
  const [contract, setContract] = useState(null);
  const [form, setForm] = useState({ signer_name: "", signer_document: "", signer_role: "Representante da produção", accepted: false });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const refreshContract = async (id = productionId) => {
    const data = await cutinappService.producerContract(id);
    setContract(data);
    return data;
  };

  useEffect(() => {
    if (!error) return;
    const message = error;
    setError("");
    void showImportantAlert({
      title: "Não foi possível continuar",
      text: message,
      icon: "error",
      confirmButtonText: "Entendi",
    });
  }, [error]);

  useEffect(() => {
    let active = true;
    cutinappService.myProductions()
      .then((items) => {
        if (!active) return;
        setProductions(items || []);
        const requested = (items || []).find((item) => String(item.id) === String(requestedProductionId));
        const first = requested || items?.[0] || null;
        if (first?.id) setProductionId(String(first.id));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!productionId) { setContract(null); return; }
    let active = true;
    setLoading(true); setError("");
    cutinappService.producerContract(productionId)
      .then((data) => {
        if (!active) return;
        setContract(data);
        if (data?.signer_name) setForm((current) => ({ ...current, signer_name: data.signer_name }));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o contrato."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId]);

  const sign = async (event) => {
    event.preventDefault();
    if (!form.accepted) {
      await showImportantAlert({
        title: "Confirme a concordância",
        text: "Marque a declaração de concordância para assinar o termo de adesão.",
        icon: "warning",
        confirmButtonText: "Entendi",
      });
      return;
    }
    setSigning(true); setError("");
    try {
      const response = await cutinappService.signProducerContract(productionId, form);
      await refreshContract();
      const result = await showImportantAlert({
        title: "Termo assinado",
        text: response?.message || "Contrato assinado com sucesso.",
        icon: "success",
        confirmButtonText: returnTo ? "Voltar para criar evento" : "Continuar",
        cancelButtonText: "Permanecer aqui",
        showCancelButton: Boolean(returnTo),
        allowOutsideClick: false,
      });
      if (returnTo && result?.isConfirmed) navigate(returnTo);
    } catch (err) {
      setError(err?.message || "Não foi possível assinar o contrato.");
    } finally {
      setSigning(false);
    }
  };

  const resend = async () => {
    setSending(true); setError("");
    try {
      const response = await cutinappService.resendProducerContract(productionId);
      await refreshContract();
      await showImportantAlert({
        title: "Cópia enviada",
        text: response?.message || "Cópia enviada por e-mail.",
        icon: "success",
        confirmButtonText: "Entendi",
      });
    } catch (err) {
      setError(err?.message || "Não foi possível reenviar o contrato.");
    } finally {
      setSending(false);
    }
  };

  const download = async () => {
    setDownloading(true); setError("");
    try {
      const blob = await cutinappService.downloadProducerContract(productionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cutinapp-contrato-produtor-${productionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || "Não foi possível baixar o contrato.");
    } finally {
      setDownloading(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Contrato do produtor</h1><p>Leia e assine o termo vigente antes de cadastrar eventos para a produção.</p></div></div>
      {loading && <div className="text-center py-5"><Spinner animation="border" /></div>}
      {!loading && productions.length === 0 && <Card className="cut-empty-state"><Card.Body><h2>Nenhuma produção cadastrada</h2><p>Cadastre sua produção antes de assinar o contrato.</p><Button onClick={() => navigate("/production/create")}>Criar produção</Button></Card.Body></Card>}
      {!!productions.length && <>
        <Card className="cut-panel mb-4"><Card.Body><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(e) => setProductionId(e.target.value)}>{productions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Form.Select></Card.Body></Card>
        {contract && <Row className="g-4"><Col lg={8}><Card className="cut-panel"><Card.Body className="p-4 p-lg-5"><div className="d-flex justify-content-between gap-3 align-items-start mb-3"><div><h2 className="cut-section-title mb-1">Termo de Adesão</h2><small>Versão {contract.version}</small></div><Badge bg={contract.accepted ? "success" : "warning"}>{contract.accepted ? "Assinado" : "Assinatura pendente"}</Badge></div><div style={{ whiteSpace: "pre-line", maxHeight: "65vh", overflowY: "auto", paddingRight: 12 }}>{contract.text}</div></Card.Body></Card></Col><Col lg={4}><Card className="cut-panel"><Card.Body className="p-4">{contract.accepted ? <><h2 className="cut-section-title">Contrato vigente</h2><p><strong>Signatário:</strong><br />{contract.signer_name}</p><p><strong>Assinado em:</strong><br />{contract.accepted_at ? new Date(contract.accepted_at).toLocaleString("pt-BR") : "Registrado"}</p><p><strong>Cópia por e-mail:</strong><br />{contract.email_sent_at ? `Enviada em ${new Date(contract.email_sent_at).toLocaleString("pt-BR")}` : "Envio pendente"}</p><p className="text-break"><strong>Hash:</strong><br /><small>{contract.hash}</small></p><Alert variant="success">Esta produção está habilitada para criar eventos.</Alert><div className="d-grid gap-2"><Button onClick={() => navigate(`/event/create?productionId=${productionId}`)}>Criar evento</Button><Button variant="outline-light" onClick={download} disabled={downloading}>{downloading ? "Gerando PDF..." : "Baixar contrato em PDF"}</Button>{!contract.email_sent_at && <Button variant="outline-light" onClick={resend} disabled={sending}>{sending ? "Enviando..." : "Reenviar por e-mail"}</Button>}</div></> : <Form onSubmit={sign}><h2 className="cut-section-title">Assinar eletronicamente</h2><Form.Group className="mb-3"><Form.Label>Nome completo *</Form.Label><Form.Control value={form.signer_name} onChange={(e) => setForm((current) => ({ ...current, signer_name: e.target.value }))} required minLength={3} /></Form.Group><Form.Group className="mb-3"><Form.Label>CPF ou CNPJ do signatário *</Form.Label><Form.Control value={form.signer_document} onChange={(e) => setForm((current) => ({ ...current, signer_document: e.target.value }))} required /></Form.Group><Form.Group className="mb-3"><Form.Label>Qualificação</Form.Label><Form.Control value={form.signer_role} onChange={(e) => setForm((current) => ({ ...current, signer_role: e.target.value }))} /></Form.Group><Form.Check className="mb-3" type="checkbox" checked={form.accepted} onChange={(e) => setForm((current) => ({ ...current, accepted: e.target.checked }))} label="Li integralmente o contrato, possuo poderes para representar esta produção e concordo com seus termos." /><Button type="submit" className="w-100" disabled={signing || !form.accepted}>{signing ? "Assinando..." : "Assinar contrato"}</Button><small className="d-block mt-3">Ao confirmar, registraremos a versão do documento, data/hora, usuário autenticado, IP e hash de integridade. Uma cópia será enviada por e-mail.</small></Form>}</Card.Body></Card></Col></Row>}
      </>}
    </Container>
  </div>;
}
