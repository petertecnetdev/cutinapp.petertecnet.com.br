import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button } from "react-bootstrap";
import { loadExternalScript } from "../../utils/loadExternalScript";
import { cardFormValidationGuidance } from "../../utils/cardFormValidationGuidance";

const MERCADO_PAGO_SDK_SRC = "https://sdk.mercadopago.com/js/v2";
const MERCADO_PAGO_SDK_TIMEOUT_MS = 15000;
const MERCADO_PAGO_FORM_MOUNT_TIMEOUT_MS = 12000;

const loadMercadoPago = () => loadExternalScript({
  src: MERCADO_PAGO_SDK_SRC,
  selector: 'script[data-mercadopago-sdk="true"]',
  isReady: () => window.MercadoPago,
  timeoutMs: MERCADO_PAGO_SDK_TIMEOUT_MS,
  attributes: {
    "data-mercadopago-sdk": "true",
    referrerpolicy: "strict-origin-when-cross-origin",
  },
  errorMessage: "Não foi possível carregar o ambiente seguro do Mercado Pago. Verifique sua conexão e tente novamente.",
});

const secureFieldStyle = {
  height: 54,
  minHeight: 54,
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 14,
  padding: "15px 16px",
  background: "rgba(255,255,255,.035)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
};

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const trackCardCheckout = (type, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: type === "card_sdk_retry_clicked"
        ? "Tentar carregar cartão novamente"
        : type === "card_form_validation_blocked"
          ? "Pagamento com cartão bloqueado por validação incompleta"
          : "Falha ao carregar ambiente do cartão",
      target: "checkout-card",
      metadata,
    });
  } catch (_) {
    // Telemetry must never interrupt checkout.
  }
};

export default function MercadoPagoCardForm({ publicKey, amount, email, disabled, onSubmit }) {
  const submitRef = useRef(onSubmit);
  const disabledRef = useRef(disabled);
  const emailRef = useRef(email);
  const cardFormRef = useRef(null);
  const submittingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);

  submitRef.current = onSubmit;
  disabledRef.current = disabled;
  emailRef.current = email;

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      trackCardCheckout("card_connectivity_restored", { amount: Number(amount || 0) });
    };
    const handleOffline = () => {
      setOnline(false);
      trackCardCheckout("card_connectivity_offline", { amount: Number(amount || 0) });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [amount]);

  useEffect(() => {
    let active = true;
    let localCardForm = null;
    let formMountTimer = null;
    let formMountTimedOut = false;
    submittingRef.current = false;
    setSubmitting(false);
    setReady(false);
    setError("");
    setLoadFailed(false);

    if (!publicKey || Number(amount) <= 0) return undefined;

    if (!online) {
      setLoadFailed(true);
      setError("Você está sem conexão. Assim que a internet voltar, o formulário seguro do cartão será carregado novamente sem perder sua seleção.");
      return undefined;
    }

    const clearFormMountTimer = () => {
      if (formMountTimer) window.clearTimeout(formMountTimer);
      formMountTimer = null;
    };

    loadMercadoPago()
      .then((MercadoPago) => {
        if (!active) return;
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });

        formMountTimer = window.setTimeout(() => {
          if (!active) return;
          formMountTimedOut = true;
          setReady(false);
          setLoadFailed(true);
          setError("O formulário seguro do cartão demorou mais que o esperado para carregar. Tente novamente sem perder sua seleção.");
          trackCardCheckout("card_sdk_load_failed", {
            stage: "form_mount_timeout",
            attempt: sdkAttempt + 1,
            amount: Number(amount || 0),
            timeout_ms: MERCADO_PAGO_FORM_MOUNT_TIMEOUT_MS,
          });
        }, MERCADO_PAGO_FORM_MOUNT_TIMEOUT_MS);

        localCardForm = mp.cardForm({
          amount: Number(amount).toFixed(2),
          iframe: true,
          form: {
            id: "cut-mp-card-form",
            cardNumber: { id: "cut-mp-card-number", placeholder: "0000 0000 0000 0000" },
            expirationDate: { id: "cut-mp-card-expiration", placeholder: "MM/AA" },
            securityCode: { id: "cut-mp-card-security", placeholder: "CVV" },
            cardholderName: { id: "cut-mp-card-holder", placeholder: "Como está escrito no cartão" },
            issuer: { id: "cut-mp-card-issuer", placeholder: "Banco emissor" },
            installments: { id: "cut-mp-card-installments", placeholder: "Parcelamento" },
            identificationType: { id: "cut-mp-card-document-type", placeholder: "Documento" },
            identificationNumber: { id: "cut-mp-card-document", placeholder: "CPF do titular" },
            cardholderEmail: { id: "cut-mp-card-email", placeholder: "E-mail para confirmação" },
          },
          callbacks: {
            onFormMounted: (formError) => {
              clearFormMountTimer();
              if (!active || formMountTimedOut) return;
              if (formError) {
                setLoadFailed(true);
                setError("Não foi possível preparar o formulário seguro do cartão.");
                trackCardCheckout("card_sdk_load_failed", { stage: "form_mount", attempt: sdkAttempt + 1, amount: Number(amount || 0) });
                return;
              }
              setLoadFailed(false);
              setReady(true);
            },
            onSubmit: async (event) => {
              event.preventDefault();
              if (!localCardForm || disabledRef.current || submittingRef.current) return;
              const data = localCardForm.getCardFormData();
              const guidance = cardFormValidationGuidance(data);
              if (guidance) {
                setError(guidance.message);
                trackCardCheckout("card_form_validation_blocked", {
                  reason: guidance.reason,
                  amount: Number(amount || 0),
                });
                return;
              }

              submittingRef.current = true;
              if (active) {
                setSubmitting(true);
                setError("");
              }

              try {
                await submitRef.current?.({
                  card_token: data.token,
                  payment_method_id: data.paymentMethodId,
                  issuer_id: data.issuerId || undefined,
                  installments: Number(data.installments),
                  payer_identification_type: data.identificationType || "CPF",
                  payer_identification_number: data.identificationNumber || "",
                  payer_email: data.cardholderEmail || emailRef.current || "",
                });
              } finally {
                submittingRef.current = false;
                if (active) setSubmitting(false);
              }
            },
            onFetching: () => {
              setReady(false);
              return () => active && !formMountTimedOut && setReady(true);
            },
          },
        });
        cardFormRef.current = localCardForm;
      })
      .catch((err) => {
        clearFormMountTimer();
        if (!active) return;
        setLoadFailed(true);
        setError(err?.message || "Não foi possível carregar o Mercado Pago.");
        trackCardCheckout("card_sdk_load_failed", { stage: "sdk_load", attempt: sdkAttempt + 1, amount: Number(amount || 0) });
      });

    return () => {
      active = false;
      clearFormMountTimer();
      submittingRef.current = false;
      if (cardFormRef.current === localCardForm) cardFormRef.current = null;
      if (typeof localCardForm?.unmount === "function") localCardForm.unmount();
    };
  }, [publicKey, amount, sdkAttempt, online]);

  const retrySecureCardEnvironment = () => {
    if (disabled || submitting) return;
    trackCardCheckout("card_sdk_retry_clicked", { attempt: sdkAttempt + 2, amount: Number(amount || 0) });
    setError("");
    setLoadFailed(false);
    setSdkAttempt((current) => current + 1);
  };

  const paymentBusy = disabled || submitting;

  return <div className="cut-payment-card-shell mt-3">
    <div className="cut-payment-card-head">
      <div className="cut-payment-card-lock"><i className="fa-solid fa-lock" /></div>
      <div>
        <strong>Pagamento seguro com cartão</strong>
        <span>Seus dados são criptografados e processados pelo Mercado Pago.</span>
      </div>
      <div className="cut-payment-card-badges" aria-label="Cartões aceitos">
        <span>VISA</span><span>MC</span>
      </div>
    </div>

    <form id="cut-mp-card-form" className="cut-payment-card-form">
      {error && <Alert variant="danger" role="alert" aria-live="assertive">
        <div>{error}</div>
        {loadFailed && online && <Button type="button" variant="light" className="w-100 mt-3" onClick={retrySecureCardEnvironment} disabled={paymentBusy}>
          <i className="fa-solid fa-rotate-right me-2" />Tentar carregar cartão novamente
        </Button>}
      </Alert>}

      <label className="cut-payment-label" htmlFor="cut-mp-card-number">Número do cartão</label>
      <div className="cut-payment-secure-field" id="cut-mp-card-number" style={secureFieldStyle} />

      <div className="cut-payment-grid cut-payment-grid--2">
        <div>
          <label className="cut-payment-label" htmlFor="cut-mp-card-expiration">Validade</label>
          <div className="cut-payment-secure-field" id="cut-mp-card-expiration" style={secureFieldStyle} />
        </div>
        <div>
          <label className="cut-payment-label" htmlFor="cut-mp-card-security">Código de segurança</label>
          <div className="cut-payment-secure-field" id="cut-mp-card-security" style={secureFieldStyle} />
        </div>
      </div>

      <label className="cut-payment-label" htmlFor="cut-mp-card-holder">Nome do titular</label>
      <input className="form-control cut-payment-input" id="cut-mp-card-holder" type="text" autoComplete="cc-name" placeholder="Como está escrito no cartão" />

      <div className="cut-payment-grid cut-payment-grid--2">
        <div>
          <label className="cut-payment-label" htmlFor="cut-mp-card-issuer">Banco emissor</label>
          <select className="form-select cut-payment-input" id="cut-mp-card-issuer" defaultValue=""><option value="" disabled>Selecione</option></select>
        </div>
        <div>
          <label className="cut-payment-label" htmlFor="cut-mp-card-installments">Parcelamento</label>
          <select className="form-select cut-payment-input" id="cut-mp-card-installments" defaultValue=""><option value="" disabled>Selecione</option></select>
        </div>
      </div>

      <label className="cut-payment-label">Documento do titular</label>
      <div className="cut-payment-grid cut-payment-grid--document">
        <select className="form-select cut-payment-input" id="cut-mp-card-document-type" defaultValue="" aria-label="Tipo de documento"><option value="" disabled>Tipo</option></select>
        <input className="form-control cut-payment-input" id="cut-mp-card-document" type="text" inputMode="numeric" autoComplete="off" aria-label="Número do documento" placeholder="Número do documento" />
      </div>

      <label className="cut-payment-label" htmlFor="cut-mp-card-email">E-mail para confirmação</label>
      <input className="form-control cut-payment-input" id="cut-mp-card-email" type="email" autoComplete="email" defaultValue={email || ""} placeholder="seu@email.com" />

      <div className="cut-payment-summary" aria-live="polite">
        <span>Valor final desta compra</span>
        <strong>{money(amount)}</strong>
      </div>
      <div className="cut-payment-trust mb-3">
        <i className="fa-solid fa-circle-check" />
        <div><strong>Total transparente</strong><span>Este é o valor enviado para o pagamento. Nenhuma taxa adicional será acrescentada pela Cutinapp nesta etapa.</span></div>
      </div>

      <Button id="cut-mp-card-submit" type="submit" className="w-100 cut-payment-submit" disabled={paymentBusy || !ready} aria-busy={paymentBusy || !ready}>
        <i className="fa-solid fa-lock me-2" />
        {paymentBusy ? "Processando pagamento..." : ready ? `Pagar ${money(amount)} com cartão` : !online ? "Aguardando conexão..." : loadFailed ? "Ambiente do cartão indisponível" : "Preparando ambiente seguro..."}
      </Button>
    </form>

    <div className="cut-payment-trust">
      <i className="fa-solid fa-shield-halved" />
      <div><strong>Compra protegida</strong><span>Os dados completos do seu cartão não ficam armazenados na Cutinapp. O processamento seguro é realizado pelo Mercado Pago.</span></div>
    </div>
  </div>;
}

MercadoPagoCardForm.propTypes = {
  publicKey: PropTypes.string,
  amount: PropTypes.number.isRequired,
  email: PropTypes.string,
  disabled: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
};

MercadoPagoCardForm.defaultProps = { publicKey: "", email: "", disabled: false };
