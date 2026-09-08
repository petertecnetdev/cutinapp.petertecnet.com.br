import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import { copyText } from "../../utils/clipboard";

const initialForm = {
  name: "",
  code: "",
  discount_type: "percentage",
  discount_value: "10",
  minimum_subtotal: "0",
  max_uses: "",
  max_uses_per_user: "1",
  starts_at: "",
  expires_at: "",
  is_active: true,
};

const formatDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sem limite";
const discountLabel = (coupon) => coupon.discount_type === "percentage" ? `${Number(coupon.discount_value || 0).toLocaleString("pt-BR")}%` : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(coupon.discount_value || 0));

export default function CouponManagePage() {
  const { productionId } = useParams();
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setCoupons(await commerceService.producerCoupons(productionId)); }
    catch (err) { setError(err?.message || "Não foi possível carregar os cupons."); }
    finally { setLoading(false); }
  }, [productionId]);

  useEffect(() => { load(); }, [load]);

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        name: form.name.trim() || null,
        code: form.code.trim() || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        minimum_subtotal: Number(form.minimum_subtotal || 0),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        max_uses_per_user: Number(form.max_uses_per_user || 1),
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
        is_active: Boolean(form.is_active),
      };
      const created = await commerceService.createCoupon(productionId, payload);
      setCoupons((current) => [created, ...current]);
      setForm(initialForm);
      setSuccess(`Cupom ${created.code} criado. Já pode ser divulgado aos participantes.`);
    } catch (err) { setError(err?.message || "Não foi possível criar o cupom."); }
    finally { setSaving(false); }
  };

  const disable = async (coupon) => {
    try {
      await commerceService.disableCoupon(productionId, coupon.id);
      setCoupons((current) => current.map((item) => item.id === coupon.id ? { ...item, is_active: false } : item));
    } catch (err) { setError(err?.message || "Não foi possível desativar o cupom."); }
  };

  const copyCode = async (code) => {
    if (await copyText(code)) { setCopied(code); window.setTimeout(() => setCopied(""), 1800); }
  };

  return <>
    <NavlogComponent />
    <Container className="py-4 py-lg-5" style={{ maxWidth: 1180 }}>
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-end gap-3 mb-4">
        <div><Badge bg="primary" className="mb-2">Promoções</Badge><h1 className="mb-1">Cupons de desconto</h1><p className="text-secondary mb-0">Crie códigos promocionais para sua produção e acompanhe o uso.</p></div>
        <Button as={Link} to={`/production/${productionId}`} variant="outline-light"><i className="fa-solid fa-arrow-left me-2" />Voltar à produção</Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Row className="g-4">
        <Col lg={5}>
          <Card className="border-0 shadow-sm"><Card.Body className="p-4">
            <h2 className="h4 mb-1">Novo cupom</h2>
            <p className="text-secondary small">O código pode ser definido por você ou deixado em branco para a Cutinapp gerar automaticamente.</p>
            <Form onSubmit={submit}>
              <Form.Group className="mb-3"><Form.Label>Nome interno</Form.Label><Form.Control value={form.name} onChange={change("name")} placeholder="Ex.: Lista VIP setembro" maxLength={120} /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Código promocional</Form.Label><Form.Control value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))} placeholder="Gerar automaticamente" maxLength={40} /><Form.Text>Ex.: VIP20, AMIGOS10, LANCAMENTO.</Form.Text></Form.Group>
              <Row className="g-3 mb-3"><Col sm={6}><Form.Label>Tipo</Form.Label><Form.Select value={form.discount_type} onChange={change("discount_type")}><option value="percentage">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></Form.Select></Col><Col sm={6}><Form.Label>Desconto</Form.Label><Form.Control type="number" min="0.01" max={form.discount_type === "percentage" ? "100" : "999999.99"} step="0.01" required value={form.discount_value} onChange={change("discount_value")} /></Col></Row>
              <Row className="g-3 mb-3"><Col sm={6}><Form.Label>Compra mínima (R$)</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.minimum_subtotal} onChange={change("minimum_subtotal")} /></Col><Col sm={6}><Form.Label>Limite total</Form.Label><Form.Control type="number" min="1" placeholder="Sem limite" value={form.max_uses} onChange={change("max_uses")} /></Col></Row>
              <Form.Group className="mb-3"><Form.Label>Usos por participante</Form.Label><Form.Control type="number" min="1" max="1000" value={form.max_uses_per_user} onChange={change("max_uses_per_user")} /></Form.Group>
              <Row className="g-3 mb-3"><Col sm={6}><Form.Label>Início</Form.Label><Form.Control type="datetime-local" value={form.starts_at} onChange={change("starts_at")} /></Col><Col sm={6}><Form.Label>Expira em</Form.Label><Form.Control type="datetime-local" value={form.expires_at} onChange={change("expires_at")} /></Col></Row>
              <Form.Check className="mb-4" type="switch" id="coupon-active" label="Ativar assim que for criado" checked={form.is_active} onChange={change("is_active")} />
              <Button type="submit" className="w-100" disabled={saving}>{saving ? "Criando cupom..." : "Criar cupom"}</Button>
            </Form>
          </Card.Body></Card>
        </Col>

        <Col lg={7}>
          <Card className="border-0 shadow-sm"><Card.Body className="p-0">
            <div className="p-4 pb-2"><h2 className="h4 mb-1">Cupons cadastrados</h2><p className="text-secondary small mb-0">O contador só aumenta quando o pagamento com o cupom é aprovado.</p></div>
            {loading ? <div className="p-4"><ProcessingIndicatorComponent label="Carregando cupons" /></div> : coupons.length === 0 ? <div className="p-4 text-secondary">Nenhum cupom cadastrado para esta produção.</div> : <div className="table-responsive"><Table hover className="mb-0 align-middle"><thead><tr><th>Código</th><th>Desconto</th><th>Uso</th><th>Validade</th><th>Status</th><th /></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id}><td><button type="button" className="btn btn-link p-0 fw-bold text-decoration-none" onClick={() => copyCode(coupon.code)} title="Copiar código"><i className="fa-regular fa-copy me-2" />{copied === coupon.code ? "Copiado!" : coupon.code}</button>{coupon.name && <div className="small text-secondary">{coupon.name}</div>}</td><td>{discountLabel(coupon)}</td><td>{coupon.uses_count || 0}{coupon.max_uses ? ` / ${coupon.max_uses}` : ""}<div className="small text-secondary">máx. {coupon.max_uses_per_user || 1}/pessoa</div></td><td><div className="small">até {formatDate(coupon.expires_at)}</div></td><td><Badge bg={coupon.is_active ? "success" : "secondary"}>{coupon.is_active ? "Ativo" : "Inativo"}</Badge></td><td>{coupon.is_active && <Button size="sm" variant="outline-danger" onClick={() => disable(coupon)}>Desativar</Button>}</td></tr>)}</tbody></Table></div>}
          </Card.Body></Card>
        </Col>
      </Row>
    </Container>
  </>;
}
