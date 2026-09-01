import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import commerceService from "../../services/CommerceService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const loadMercadoPago = () => new Promise((resolve, reject) => {
  if (window.MercadoPago) return resolve(window.MercadoPago);
  const existing = document.querySelector('script[data-mercadopago-sdk="true"]');
  if (existing) {
    existing.addEventListener("load", () => resolve(window.MercadoPago), { once: true });
    existing.addEventListener("error", reject, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src = "https://sdk.mercadopago.com/js/v2";
  script.async = true;
  script.dataset.mercadopagoSdk = "true";
  script.onload = () => resolve(window.MercadoPago);
  script.onerror = () => reject(new Error("Não foi possível carregar o Mercado Pago."));
  document.head.appendChild(script);
});

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const [catalog, setCatalog] = useState({ tickets: [], items: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [method, setMethod] = useState("pix");
  const [card, setCard] = useState({ number: "", holder: "", month: "", year: "", cvv: "", cpf: "", installments: "1" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    commerceService.catalog(slug)
      .then((response) => active && setCatalog(response || { tickets: [], items: [] }))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os ingressos pagos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const selected = useMemo(() => {
    const tickets = (catalog.tickets || []).filter((item) => Number(quantities[`ticket:${item.id}`] || 0) > 0);
    const items = (catalog.items || []).filter((item) => Number(quantities[`item:${item.id}`] || 0) > 0);
    return { tickets, items };
  }, [catalog, quantities]);

  const total = useMemo(() => {
    const ticketTotal = selected.tickets.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`ticket:${item.id}`] || 0), 0);
    const itemTotal = selected.items.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`item:${item.id}`] || 0), 0);
    return ticketTotal + itemTotal;
  }, [selected, quantities]);

  const setQuantity = (kind, id, value) => {
    const parsed = Math.max(0, Math.min(50, Number(value || 0)));
    setQuantities((current) => ({ ...current, [`${kind}:${id}`]: parsed }));
  };

  const basePayload = () => ({
    event_id: eventId,
    payment_method: method,
    tickets: selected.tickets.map((item) => ({ id: item.id, quantity: Number(quantities[`ticket:${item.id}`]) })),
    items: selected.items.map((item) => ({ id: item.id, quantity: Number(quantities[`item:${item.id}`]) })),
  });

  const tokenizeCard = async () => {
    const publicKey = catalog?.payment_config?.public_key;
    if (!publicKey) throw new Error("A chave pública do Mercado Pago não está disponível para este evento.");
    const number = onlyDigits(card.number);
    if (number.length < 13 || onlyDigits(card.cvv).length < 3 || onlyDigits(card.cpf).length !== 11) {
      throw new Error("Confira os dados do cartão e o CPF do titular.");
    }

    const MercadoPago = await loadMercadoPago();
    const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
    const bin = number.slice(0, 6);
    const methods = await mp.getPaymentMethods({ bin });
    const paymentMethodId = methods?.results?.[0]?.id;
    if (!paymentMethodId) throw new Error("Não foi possível identificar a bandeira do cartão.");

    const token = await mp.createCardToken({
      cardNumber: number,
      cardholderName: card.holder,
      cardExpirationMonth: String(card.month).padStart(2, "0"),
      cardExpirationYear: String(card.year).length === 2 ? `20${card.year}` : String(card.year),
      securityCode: onlyDigits(card.cvv),
      identificationType: "CPF",
      identificationNumber: onlyDigits(card.cpf),
    });

    if (!token?.id) throw new Error("O Mercado Pago não conseguiu tokenizar o cartão.");
    return { card_token: token.id, payment_method_id: paymentMethodId, installments: Number(card.installments || 1) };
  };

  const checkout = async () => {
    if (!user) return onLoginRequired?.();
    if (!selected.tickets.length && !selected.items.length) return setError("Selecione ao menos um ingresso ou item.");
    if (!catalog?.payment_config?.connected) return setError("Este produtor ainda não conectou o Mercado Pago e a venda paga está temporariamente indisponível.");

    setPaying(true); setError(""); setResult(null);
    try {
      const payload = basePayload();
      if (method === "card") Object.assign(payload, await tokenizeCard());
      const response = await commerceService.checkout(payload);
      setResult(response);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar o pagamento.");
    } finally { setPaying(false); }
  };

  const copyPix = async () => {
    const code = result?.payment?.qr_code;
    if (code) await navigator.clipboard.writeText(code);
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length) return null;

  const paymentStatus = result?.payment?.status;
  const approved = ["approved", "paid"].includes(paymentStatus);

  return <div className="cut-commerce-panel mt-4">
    <span className="cut-eyebrow">Comprar</span>
    <h3 className="cut-section-title mt-2">Ingressos e itens</h3>
    {error && <Alert variant="danger">{error}</Alert>}
    {!catalog?.payment_config?.connected && <Alert variant="warning">Pagamento aguardando conexão do produtor com o Mercado Pago.</Alert>}

    {!result && <>
      {(catalog.tickets || []).map((ticket) => <div className="cut-ticket-option" key={`paid-ticket-${ticket.id}`}>
        <div><span className="cut-ticket-kicker">Ingresso</span><strong>{ticket.name}</strong><span>{money(ticket.price)}</span></div>
        <Form.Control type="number" min="0" max="20" value={quantities[`ticket:${ticket.id}`] || 0} onChange={(event) => setQuantity("ticket", ticket.id, event.target.value)} style={{ width: 82 }} />
      </div>)}
      {(catalog.items || []).map((item) => <div className="cut-ticket-option" key={`event-item-${item.id}`}>
        <div><span className="cut-ticket-kicker">Item do evento</span><strong>{item.name}</strong><span>{money(item.price)}</span>{item.description && <small>{item.description}</small>}</div>
        <Form.Control type="number" min="0" max="50" value={quantities[`item:${item.id}`] || 0} onChange={(event) => setQuantity("item", item.id, event.target.value)} style={{ width: 82 }} />
      </div>)}

      <div className="d-flex align-items-center justify-content-between mt-3"><strong>Total</strong><strong>{money(total)}</strong></div>
      <Form.Group className="mt-3">
        <Form.Label>Forma de pagamento</Form.Label>
        <div className="d-flex gap-2">
          <Button type="button" variant={method === "pix" ? "primary" : "outline-primary"} onClick={() => setMethod("pix")}>PIX</Button>
          <Button type="button" variant={method === "card" ? "primary" : "outline-primary"} onClick={() => setMethod("card")}>Cartão</Button>
        </div>
      </Form.Group>

      {method === "card" && <div className="mt-3">
        <Form.Control className="mb-2" placeholder="Número do cartão" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
        <Form.Control className="mb-2" placeholder="Nome impresso no cartão" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
        <div className="d-flex gap-2 mb-2">
          <Form.Control placeholder="Mês" inputMode="numeric" autoComplete="cc-exp-month" value={card.month} onChange={(e) => setCard({ ...card, month: e.target.value })} />
          <Form.Control placeholder="Ano" inputMode="numeric" autoComplete="cc-exp-year" value={card.year} onChange={(e) => setCard({ ...card, year: e.target.value })} />
          <Form.Control placeholder="CVV" inputMode="numeric" autoComplete="cc-csc" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
        </div>
        <Form.Control className="mb-2" placeholder="CPF do titular" inputMode="numeric" value={card.cpf} onChange={(e) => setCard({ ...card, cpf: e.target.value })} />
        <Form.Select value={card.installments} onChange={(e) => setCard({ ...card, installments: e.target.value })}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((value) => <option key={value} value={value}>{value}x</option>)}
        </Form.Select>
        <small className="d-block mt-2 text-secondary">Os dados do cartão são tokenizados no navegador pelo Mercado Pago e não são enviados em formato bruto à Peter Tecnet.</small>
      </div>}

      <Button className="w-100 mt-3" onClick={checkout} disabled={paying || total <= 0 || !catalog?.payment_config?.connected}>
        {paying ? "Processando..." : user ? (method === "pix" ? "Pagar com PIX" : "Pagar com cartão") : "Entrar para comprar"}
      </Button>
    </>}

    {result && <Alert variant={approved ? "success" : "info"} className="mt-3 mb-0">
      <strong>{approved ? "Pagamento aprovado." : "Pedido criado."}</strong>
      {method === "pix" && <div className="mt-2">Pague o PIX para liberar automaticamente seus ingressos.</div>}
      {method === "card" && !approved && <div className="mt-2">O Mercado Pago está processando o pagamento. A liberação acontece após a confirmação.</div>}
      {result.payment?.qr_code_image && <img src={result.payment.qr_code_image} alt="QR Code PIX" className="img-fluid bg-white rounded p-2 my-3" />}
      {result.payment?.qr_code && <><Form.Control as="textarea" rows={3} readOnly value={result.payment.qr_code} /><Button variant="outline-success" className="w-100 mt-2" onClick={copyPix}>Copiar PIX</Button></>}
      {result.payment?.ticket_url && <Button as="a" href={result.payment.ticket_url} target="_blank" rel="noreferrer" variant="outline-primary" className="w-100 mt-2">Abrir pagamento no Mercado Pago</Button>}
    </Alert>}
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
