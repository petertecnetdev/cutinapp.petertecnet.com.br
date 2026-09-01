import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const payoutStatus = {
  pending: { label: "Solicitado", bg: "warning" },
  processing: { label: "Processando", bg: "info" },
  paid: { label: "Pago", bg: "success" },
  failed: { label: "Falhou", bg: "danger" },
  cancelled: { label: "Cancelado", bg: "secondary" },
};

export default function ProductionFinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(params.get("production") || "");
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    cutinappService.myProductions()
      .then((rows) => {
        if (!active) return;
        setProductions(rows);
        if (!productionId && rows.length) setProductionId(String(rows[0].id));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
    // productionId intentionally initializes only from the first load/query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFinance = async (id, isActive = () => true) => {
    const [paymentAccount, financial, payoutSummary] = await Promise.all([
      commerceService.paymentAccount(id),
      commerceService.financialSummary(id),
      commerceService.payoutSummary(id),
    ]);
    if (!isActive()) return;
    setAccount(paymentAccount);
    setSummary(financial);
    setPayouts(payoutSummary);
    setPayoutAmount(String(payoutSummary?.available_for_payout || ""));
  };

  useEffect(() => {
    if (!productionId) return undefined;
    let active = true;
    setLoading(true); setError(""); setSuccess("");
    loadFinance(productionId, () => active)
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o financeiro da produção."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId]);

  const production = productions.find((row) => String(row.id) === String(productionId));
  const connected = account?.provider === "mercadopago" && account?.status === "connected";
  const connectedNotice = params.get("mercadopago") === "connected";
  const availableForPayout = Number(payouts?.available_for_payout || 0);
  const manualPayoutsEnabled = Boolean(payouts?.manual_payout_requests_enabled);
  const salesEnabled = Boolean(summary?.sales_enabled);

  const connect = async () => {
    if (!productionId) return;
    setConnecting(true); setError(""); setSuccess("");
    try {
      const response = await commerceService.connectMercadoPago(productionId);
      if (!response?.authorization_url) throw new Error("A API não retornou a autorização do Mercado Pago.");
      window.location.assign(response.authorization_url);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar a conexão com o Mercado Pago.");
      setConnecting(false);
    }
  };

  const requestPayout = async () => {
    if (!productionId || !manualPayoutsEnabled) return;
    const amount = Number(String(payoutAmount).replace(",", "."));
    if (!amount || amount <= 0) { setError("Informe um valor válido para o repasse."); return; }
    setRequesting(true); setError(""); setSuccess("");
    try {
      const response = await commerceService.requestPayout(productionId, amount);
      setSuccess(response?.message || "Solicitação registrada com sucesso.");
      await loadFinance(productionId);
    } catch (err) {
      setError(err?.message || "Não foi possível solicitar o repasse.");
    } finally { setRequesting(false); }
  };

  const cancelPayout = async (payoutId) => {
    setRequesting(true); setError(""); setSuccess("");
    try {
      const response = await commerceService.cancelPayout(productionId, payoutId);
      setSuccess(response?.message || "Solicitação cancelada.");
      await loadFinance(productionId);
    } catch (err) {
      setError(err?.message || "Não foi possível cancelar o repasse.");
    } finally { setRequesting(false); }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {(loading || requesting) && <ProcessingIndicatorComponent label={requesting ? "Atualizando repasse" : "Atualizando financeiro"} />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Área do produtor</span><h1>Recebimentos</h1><p>Para vender com segurança, conecte a conta Mercado Pago da produção. As vendas novas usam split automático entre produtor e plataforma.</p></div>
        <Button variant="outline-light" onClick={() => navigate("/production/mine")}>Minhas produções</Button>
      </div>

      {connectedNotice && <Alert variant="success">Mercado Pago conectado com sucesso. As próximas vendas podem usar split automático.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Card className="cut-production-card mb-4"><Card.Body className="p-4"><Form.Group><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}><option value="">Selecione</option>{productions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Form.Select></Form.Group></Card.Body></Card>

      {productionId && <>
        <Row className="g-4">
          <Col lg={5}><Card className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Conta de recebimento</span><h2 className="mt-2 mb-3">Mercado Pago</h2><p>{production?.name || "Produção selecionada"}</p>
            <div className="d-flex align-items-center gap-2 mb-3"><Badge bg={connected ? "success" : "warning"}>{connected ? "Split automático ativo" : "Vendas pagas bloqueadas"}</Badge>{account?.provider_recipient_id && <small>Conta #{account.provider_recipient_id}</small>}</div>
            <p className="text-secondary">A autorização é feita diretamente no Mercado Pago. A Cutinapp não solicita senha nem credenciais bancárias do produtor.</p>
            <Button onClick={connect} disabled={connecting} className="w-100">{connecting ? "Abrindo Mercado Pago..." : connected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago e habilitar vendas"}</Button>
          </Card.Body></Card></Col>
          <Col lg={7}><Card className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Resumo financeiro</span><h2 className="mt-2 mb-4">Vendas da produção</h2>
            <Row className="g-3"><Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Volume bruto</span><strong>{money(summary?.gross_sales)}</strong></div></div></Col><Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Comissão da plataforma</span><strong>{money(summary?.platform_fees)}</strong></div></div></Col><Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Taxas do provedor</span><strong>{money(summary?.processor_fees)}</strong></div></div></Col><Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Crédito do produtor</span><strong>{money(summary?.producer_earned)}</strong></div></div></Col></Row>
            <Alert variant={salesEnabled ? "success" : "warning"} className="mt-4 mb-0">{salesEnabled ? "Vendas pagas habilitadas. O recebimento usa o fluxo configurado pela API, preferencialmente split automático." : (summary?.sales_message || "Conecte o Mercado Pago da produção para habilitar vendas pagas.")}</Alert>
          </Card.Body></Card></Col>
        </Row>

        <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4"><div><span className="cut-eyebrow">Saldo legado de repasse</span><h2 className="mt-2 mb-1">Valores recebidos anteriormente pela plataforma</h2><p className="text-secondary mb-0">Novas vendas não entram neste saldo quando o split automático está ativo.</p></div><Badge bg={payouts?.current_settlement_mode === "automatic_split" ? "success" : "warning"}>{payouts?.current_settlement_mode === "automatic_split" ? "Novas vendas: split automático" : "Vendas pagas não habilitadas"}</Badge></div>
          <Row className="g-3 mb-4"><Col md={3}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Crédito acumulado</span><strong>{money(payouts?.platform_collected_credit)}</strong></div></div></Col><Col md={3}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Disponível</span><strong>{money(availableForPayout)}</strong></div></div></Col><Col md={3}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Em processamento</span><strong>{money(payouts?.payout_pending)}</strong></div></div></Col><Col md={3}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Já repassado</span><strong>{money(payouts?.payout_paid)}</strong></div></div></Col></Row>

          {availableForPayout > 0 && !manualPayoutsEnabled && <Alert variant="info">Há saldo legado registrado, mas solicitações automáticas de repasse estão desativadas até a liquidação ser operacionalmente habilitada. Isso não afeta novas vendas com split.</Alert>}
          {availableForPayout > 0 && manualPayoutsEnabled && !connected && <Alert variant="warning">Conecte a conta Mercado Pago da produção para habilitar a solicitação deste saldo.</Alert>}
          {availableForPayout > 0 && manualPayoutsEnabled && connected && <div className="d-flex flex-column flex-md-row gap-2 align-items-md-end mb-4"><Form.Group className="flex-grow-1"><Form.Label>Valor do repasse</Form.Label><Form.Control type="number" min="0.01" step="0.01" max={availableForPayout} value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} /></Form.Group><Button onClick={requestPayout} disabled={requesting}>Solicitar repasse</Button></div>}
          {availableForPayout <= 0 && <Alert variant="secondary">Não há saldo de vendas recebidas pela plataforma aguardando repasse.</Alert>}

          {(payouts?.history || []).length > 0 && <div className="table-responsive mt-4"><Table variant="dark" hover className="align-middle mb-0"><thead><tr><th>Referência</th><th>Solicitado em</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>{payouts.history.map((row) => { const status = payoutStatus[row.status] || { label: row.status, bg: "secondary" }; return <tr key={row.id}><td><small>{row.reference}</small></td><td>{dateTime(row.requested_at)}</td><td><strong>{money(row.amount)}</strong></td><td><Badge bg={status.bg}>{status.label}</Badge></td><td className="text-end">{manualPayoutsEnabled && row.status === "pending" && <Button size="sm" variant="outline-light" onClick={() => cancelPayout(row.id)} disabled={requesting}>Cancelar</Button>}</td></tr>; })}</tbody></Table></div>}
        </Card.Body></Card>
      </>}
    </Container>
  </div>;
}
