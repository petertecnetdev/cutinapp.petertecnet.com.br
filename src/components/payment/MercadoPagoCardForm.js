import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button } from "react-bootstrap";

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
  script.onerror = () => reject(new Error("Não foi possível carregar o ambiente seguro do Mercado Pago."));
  document.head.appendChild(script);
});

const secureFieldStyle = {
  minHeight: 44,
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,.04)",
};

export default function MercadoPagoCardForm({ publicKey, amount, email, disabled, onSubmit }) {
  const submitRef = useRef(onSubmit);
  const cardFormRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  submitRef.current = onSubmit;

  useEffect(() => {
    let active = true;
    let localCardForm = null;
    setReady(false);
    setError("");

    if (!publicKey || Number(amount) <= 0) return undefined;

    loadMercadoPago()
      .then((MercadoPago) => {
        if (!active) return;
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        localCardForm = mp.cardForm({
          amount: Number(amount).toFixed(2),
          iframe: true,
          form: {
            id: "cut-mp-card-form",
            cardNumber: { id: "cut-mp-card-number", placeholder: "Número do cartão" },
            expirationDate: { id: "cut-mp-card-expiration", placeholder: "MM/AA" },
            securityCode: { id: "cut-mp-card-security", placeholder: "CVV" },
            cardholderName: { id: "cut-mp-card-holder", placeholder: "Nome no cartão" },
            issuer: { id: "cut-mp-card-issuer", placeholder: "Banco emissor" },
            installments: { id: "cut-mp-card-installments", placeholder: "Parcelas" },
            identificationType: { id: "cut-mp-card-document-type", placeholder: "Documento" },
            identificationNumber: { id: "cut-mp-card-document", placeholder: "Número do documento" },
            cardholderEmail: { id: "cut-mp-card-email", placeholder: "E-mail" },
          },
          callbacks: {
            onFormMounted: (formError) => {
              if (!active) return;
              if (formError) {
                setError("Não foi possível preparar o formulário seguro do cartão.");
                return;
              }
              setReady(true);
            },
            onSubmit: async (event) => {
              event.preventDefault();
              if (!localCardForm || disabled) return;
              const data = localCardForm.getCardFormData();
              if (!data?.token || !data?.paymentMethodId || !data?.installments) {
                setError("Confira os dados do cartão antes de continuar.");
                return;
              }
              setError("");
              await submitRef.current?.({
                card_token: data.token,
                payment_method_id: data.paymentMethodId,
                issuer_id: data.issuerId || undefined,
                installments: Number(data.installments),
                payer_identification_type: data.identificationType || "CPF",
                payer_identification_number: data.identificationNumber || "",
                payer_email: data.cardholderEmail || email || "",
              });
            },
            onFetching: () => {
              setReady(false);
              return () => setReady(true);
            },
          },
        });
        cardFormRef.current = localCardForm;
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o Mercado Pago."));

    return () => {
      active = false;
      setReady(false);
      if (cardFormRef.current === localCardForm) cardFormRef.current = null;
      if (typeof localCardForm?.unmount === "function") localCardForm.unmount();
    };
  }, [publicKey, amount, email, disabled]);

  return <form id="cut-mp-card-form" className="mt-3">
    {error && <Alert variant="danger">{error}</Alert>}
    <div className="mb-2" id="cut-mp-card-number" style={secureFieldStyle} />
    <div className="d-grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div id="cut-mp-card-expiration" style={secureFieldStyle} />
      <div id="cut-mp-card-security" style={secureFieldStyle} />
    </div>
    <input className="form-control mb-2" id="cut-mp-card-holder" type="text" autoComplete="cc-name" placeholder="Nome no cartão" />
    <div className="d-grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <select className="form-select" id="cut-mp-card-issuer" defaultValue=""><option value="" disabled>Banco emissor</option></select>
      <select className="form-select" id="cut-mp-card-installments" defaultValue=""><option value="" disabled>Parcelas</option></select>
    </div>
    <div className="d-grid gap-2 mb-2" style={{ gridTemplateColumns: "120px 1fr" }}>
      <select className="form-select" id="cut-mp-card-document-type" defaultValue=""><option value="" disabled>Documento</option></select>
      <input className="form-control" id="cut-mp-card-document" type="text" inputMode="numeric" placeholder="CPF" />
    </div>
    <input className="form-control mb-3" id="cut-mp-card-email" type="email" defaultValue={email || ""} placeholder="E-mail" />
    <Button id="cut-mp-card-submit" type="submit" className="w-100" disabled={disabled || !ready}>
      {disabled ? "Processando..." : ready ? "Pagar com cartão" : "Preparando cartão..."}
    </Button>
    <small className="d-block mt-2 text-secondary">Os campos sensíveis são protegidos pelo Mercado Pago. A Peter Tecnet recebe somente o token do cartão.</small>
  </form>;
}

MercadoPagoCardForm.propTypes = {
  publicKey: PropTypes.string,
  amount: PropTypes.number.isRequired,
  email: PropTypes.string,
  disabled: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
};

MercadoPagoCardForm.defaultProps = { publicKey: "", email: "", disabled: false };
